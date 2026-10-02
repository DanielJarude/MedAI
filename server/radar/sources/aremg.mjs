// AREMG — Processo Seletivo Unificado de Residência Médica de Minas Gerais (PSU-MG).
// Página oficial: https://www.aremg.org.br/processos-atuais. A própria página carrega, por requisições públicas
// (js/geral.js), a lista de notícias do processo e a lista de editais por hospital (PDFs hospedados em galaxcms.com.br).
// Cada hospital publica o próprio edital: cada edital vira um processo do grupo "PSU-MG AAAA", com dados do próprio PDF.
import { links, stripTags, decodeEntities } from '../html.mjs';
import { extractField, parseDate, parseRange, parseMoney, notFound, validateFields, flat } from '../extract.mjs';
import { slug } from '../../../dist/taxonomy.js';

const BASE = 'https://www.aremg.org.br/';
const PAGE = BASE + 'processos-atuais';

export const source = {
  id: 'aremg-psu-mg',
  name: 'AREMG — PSU-MG (Processo Seletivo Unificado de Minas Gerais)',
  organization: 'Associação de Residência Médica de Minas Gerais (AREMG)',
  url: PAGE,
  sourceType: 'HTML + JSON + PDF',
  accessMethod: 'Página oficial “Processos atuais” e os mesmos endpoints públicos que ela usa (ajaxCarregaProcesso / ajaxCarregaCategoriaEdital); editais por hospital em PDF',
  automated: true,
  notes: 'Os editais são de responsabilidade de cada instituição (aviso da própria AREMG). Os layouts variam: campos não reconhecidos ficam como “não informado” ou em verificação manual. A tabela de vagas por hospital não é extraída automaticamente nesta versão.'
};

const decode = buf => new TextDecoder('windows-1252').decode(buf);
const ajaxJson = async (ctx, path) => { const r = await ctx.fetcher.get(BASE + path, { accept: 'application/json' }); try { return JSON.parse(decode(r.body)); } catch { throw new Error(`Resposta inesperada de ${path}`); } };

export function findCategories(html, label = /PSU MG (\d{4})/i) {
  const out = { process: null, editais: null, year: null };
  for (const m of html.matchAll(/<a\b[^>]*class="([^"]*)"[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = stripTags(m[3]), hit = label.exec(text);
    if (!hit) continue;
    out.year ||= Number(hit[1]);
    if (/link-categoria-edital/.test(m[1])) out.editais ||= { id: m[2], text };
    else if (/link-categoria\b/.test(m[1])) out.process ||= { id: m[2], text };
  }
  return out;
}

export function extractAremgFields(text) {
  const t = flat(text);
  return {
    published: extractField(t, [{ re: /Publicação no site da AREMG[^0-9]{0,40}(\d{2}\/\d{2}\/\d{4})/gi, parse: m => parseDate(m[1]), confidence: 0.9 }]),
    registration: extractField(t, [{ re: /Inscrições,? preenchimento[^0-9]{0,60}(\d{2}\/\d{2}(?:\/\d{4})?\s*a\s*\d{2}\/\d{2}\/\d{4})/gi, parse: m => parseRange(m[1]), confidence: 0.85 }]),
    exam: extractField(t, [{ re: /Data da prova escrita[^0-9]{0,60}(\d{2}\/\d{2}\/\d{4})/gi, parse: m => parseDate(m[1]), confidence: 0.85 }]),
    fee: extractField(t, [{ re: /taxa de inscrição,? no valor de (R\$\s*[\d.]+,\d{2})/gi, parse: m => parseMoney(m[1]), confidence: 0.85, pad: 40 }]),
    year: extractField(t, [{ re: /IN[ÍI]CIO DAS ATIVIDADES NO PRIMEIRO SEMESTRE DE (\d{4})/gi, parse: m => Number(m[1]), confidence: 0.9 }]),
    city: extractField(t, [{ re: /([A-ZÀ-Ú][a-zà-ú]+(?: (?:de |do |da )?[A-ZÀ-Ú][a-zà-ú]+){0,3})\s*(?:\/|–|-)\s*(?:MG\b|Minas Gerais)/g, parse: m => m[1], confidence: 0.7 }])
  };
}

export async function collect(ctx) {
  const html = (await ctx.fetcher.get(PAGE, { accept: 'text/html' })).body.toString('utf8');
  const cat = findCategories(html);
  if (!cat.editais) throw new Error('Categoria de editais do PSU-MG não encontrada na página oficial');
  const group = `PSU-MG ${cat.year}`;

  const news = [];
  if (cat.process) {
    try {
      const j = await ajaxJson(ctx, `ajaxCarregaProcesso.ajax.php?id=${cat.process.id}`);
      for (const l of links(j.html || '', BASE)) {
        const m = /^(\d{2}\/\d{2}\/\d{4})\s*-\s*(.+)$/.exec(l.text);
        if (m) news.push({ docKey: l.url, kind: /retifica/i.test(m[2]) ? 'RETIFICACAO' : /resultado|classifica/i.test(m[2]) ? 'RESULTADO' : /edita/i.test(m[2]) ? 'EDITAL' : 'COMUNICADO', title: `AREMG: ${m[2].trim()}`, url: l.url, publishedAt: parseDate(m[1]) });
      }
    } catch (e) { ctx.log(`notícias do processo indisponíveis (${e.message})`); }
  }
  const retification = news.find(n => n.kind === 'RETIFICACAO');

  const j = await ajaxJson(ctx, `ajaxCarregaCategoriaEdital.ajax.php?id=${cat.editais.id}&tipo=1`);
  const editais = [...new Map(links(decodeEntities(j.html || ''), BASE).filter(l => /\.pdf$/i.test(l.url)).map(l => [l.url, l])).values()];
  if (!editais.length) throw new Error('Nenhum edital de hospital listado para o PSU-MG');
  const max = Number(process.env.RADAR_AREMG_MAX) || editais.length;

  const processes = [];
  for (const e of editais.slice(0, max)) {
    const hospital = e.text.replace(/\s*-\s*Edital PSU MG \d{4}\s*$/i, '').trim() || e.url.split('/').pop();
    const doc = await ctx.docs.get(e.url, { kind: 'pdf', immutable: true });
    const notice = { docKey: e.url, kind: 'EDITAL', title: e.text, url: e.url, publishedAt: null, contentHash: doc.contentHash, byteSize: doc.byteSize, contentType: doc.contentType, fetchedAt: doc.fetchedAt, parseStatus: doc.parseStatus, parseError: doc.parseError };
    const meta = f => ({ ...f, method: 'pdf-text', sourceUrl: e.url, noticeKey: e.url });
    const fields = {}; let city = null;
    if (doc.parseStatus === 'PARSED') {
      const x = extractAremgFields(doc.text);
      fields.published_at = meta(x.published);
      fields.registration_start = meta(x.registration.status === 'ACCEPTED' ? { ...x.registration, value: x.registration.value.start } : x.registration);
      fields.registration_end = meta(x.registration.status === 'ACCEPTED' ? { ...x.registration, value: x.registration.value.end } : x.registration);
      fields.exam_date = meta(x.exam); fields.fee = meta(x.fee); fields.year = meta(x.year);
      if (x.city.status === 'ACCEPTED') city = x.city.value;
      if (x.published.status === 'ACCEPTED') notice.publishedAt = x.published.value;
    }
    fields.total_vacancies = meta(notFound());
    processes.push({
      externalKey: `${cat.year}-${slug(hospital)}`, name: `${group} · ${hospital}`, type: 'Residência médica (edital da instituição)', group,
      institution: { id: `aremg-${slug(hospital)}`.slice(0, 120), name: hospital, uf: city ? 'MG' : null, city },
      officialUrl: PAGE, noticeUrl: e.url,
      statusNote: retification ? `A AREMG publicou “${retification.title.replace(/^AREMG: /, '')}” em ${retification.publishedAt?.split('-').reverse().join('/')}. Os dados abaixo vêm do edital da instituição e podem ter sido alterados: confira a retificação.` : null,
      fields: validateFields(fields), programs: null, notices: [notice, ...news], needsReview: doc.parseStatus !== 'PARSED'
    });
  }
  return { processes, complete: max >= editais.length };
}
