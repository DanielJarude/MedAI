// FUVEST — Processo seletivo de Residência Médica da FMUSP (COREME/FMUSP).
// Página oficial (WordPress): https://www.fuvest.br/residencia-medica/ com links para os PDFs (rmAAAA-*.pdf).
// A API REST do WordPress exige autenticação (401) e não é usada. O feed RSS público é registrado como sinal de novidades.
import { links, rssItems } from '../html.mjs';
import { extractField, parseDate, parseRange, parseMoney, accepted, notFound, needsReview, validateFields, flat, normalizeSpace } from '../extract.mjs';
import { slug } from '../../../dist/taxonomy.js';

const PAGE = 'https://www.fuvest.br/residencia-medica/';
const FEED = 'https://www.fuvest.br/feed/';

export const source = {
  id: 'fuvest-rm-fmusp',
  name: 'FUVEST — Residência Médica FMUSP (página oficial)',
  organization: 'Fundação Universitária para o Vestibular (FUVEST) · COREME da Faculdade de Medicina da USP',
  url: PAGE,
  sourceType: 'HTML + RSS + PDF',
  accessMethod: 'Página oficial do processo (links dos PDFs) e feed RSS público; edital em PDF com camada de texto',
  automated: true,
  notes: 'A API REST do WordPress responde 401 e não é usada. robots.txt restringe apenas /wp-admin/.',
  institution: { id: 'fmusp', name: 'Faculdade de Medicina da Universidade de São Paulo (FMUSP)', acronym: 'FMUSP', uf: 'SP', city: 'São Paulo', officialUrl: PAGE }
};

const kindOf = text => /retifica/i.test(text) ? 'RETIFICACAO' : /resultado|convoca|classifica|gabarito|aprovados/i.test(text) ? 'RESULTADO' : /edital/i.test(text) ? 'EDITAL' : 'OUTRO';

export function extractFuvestFields(text) {
  const t = flat(text);
  const longDate = '(\\d{1,2}º? de [a-zçã]+ de \\d{4})';
  return {
    registration: extractField(t, [
      { re: new RegExp(`inscrições serão realizadas[^.]{0,160}?do dia ${longDate}, a partir das [^,]{1,20}, ao dia ${longDate}`, 'gi'), parse: m => parseRange(`${m[1]} ${m[2]}`), confidence: 0.95, stopOnMatch: false },
      { re: new RegExp(`inscrições, ${longDate}, a partir das \\S+ ao dia ${longDate}`, 'gi'), parse: m => parseRange(`${m[1]} ${m[2]}`), confidence: 0.9 }
    ]),
    fee: extractField(t, [{ re: /pagamento da inscrição, no valor de (R\$\s*[\d.]+,\d{2})/gi, parse: m => parseMoney(m[1]), confidence: 0.95 }]),
    exam: extractField(t, [{ re: new RegExp(`PROVA SERÁ REALIZADA NO dia ${longDate}`, 'gi'), parse: m => parseDate(m[1]), confidence: 0.95 }]),
    year: extractField(t, [{ re: /exclusivamente para ingresso em (\d{4})/gi, parse: m => Number(m[1]), confidence: 0.95 }])
  };
}

// Tabela "III. ... NÚMERO PREVISTO DE VAGAS": código, programa, situação, credenciadas, parecer, duração e os números
// finais: [retorno Forças Armadas,] bolsas MIS, bolsas SES e TOTAL previsto (= MIS + SES). Nomes quebrados em duas
// linhas são unidos. Linha que não fecha a soma é descartada e o total vai para verificação manual.
const ROW = /^(\d{2,3})\s+(.+?)\s+(Aprovado|Em análise|Em diligência|Provisório)\s+(\d+)\s+(\S+)\s+(\d+\s*anos?)\s+((?:\d+\s+){2,3}\d+)\s*$/;
export function extractFuvestPrograms(text, noticeKey) {
  const lines = normalizeSpace(text).split('\n'), joined = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (/^\d{2,3}\s+\S/.test(l) && !ROW.test(l) && i + 1 < lines.length && !/^\d{2,3}\s+\S/.test(lines[i + 1]) && ROW.test(`${l} ${lines[i + 1]}`)) { l = `${l} ${lines[i + 1]}`; i++; }
    joined.push(l);
  }
  const rows = [], rejected = [], seen = new Set();
  for (const line of joined) {
    const m = ROW.exec(line);
    if (!m) continue;
    const [, code, name, , , , duration, tail] = m;
    if (seen.has(code)) continue; seen.add(code);
    const nums = tail.trim().split(/\s+/).map(Number), total = nums.at(-1), mis = nums.at(-3), ses = nums.at(-2);
    if (mis + ses !== total) { rejected.push(line); continue; }
    rows.push({ programKey: `fmusp-${code}`, specialty: name.trim(), specialtyId: slug(name), programType: null, prerequisite: null, vacancies: total, duration: duration.replace(/(\d)\s*ano/, '$1 ano'), institutionName: 'FMUSP', uf: 'SP', city: 'São Paulo', details: { codigo: code, retornoForcasArmadas: nums.length === 4 ? nums[0] : null }, evidence: line.trim().slice(0, 200), noticeKey });
  }
  return { rows, rejected };
}

export async function collect(ctx) {
  // Feed RSS: apenas registra a publicação mais recente sobre o processo (sinal de novidade; não é fonte de datas).
  let latestFeed = null;
  try {
    const feed = rssItems((await ctx.fetcher.get(FEED, { accept: 'application/rss+xml' })).body.toString('utf8'));
    latestFeed = feed.find(i => /resid[êe]ncia m[ée]dica/i.test(`${i.title} ${i.categories.join(' ')}`)) || null;
  } catch (e) { ctx.log(`feed RSS indisponível (${e.message}); seguindo pela página oficial`); }

  const html = (await ctx.fetcher.get(PAGE, { accept: 'text/html' })).body.toString('utf8');
  const docs = links(html, PAGE).filter(l => /\/wp-content\/uploads\/rm(\d{4})[-_][^/]*\.pdf$/i.test(l.url));
  if (!docs.length) throw new Error('Nenhum documento do processo (rmAAAA-*.pdf) encontrado na página oficial');
  const cycle = Math.max(...docs.map(d => Number(/\/rm(\d{4})/i.exec(d.url)[1])));
  const current = [...new Map(docs.filter(d => d.url.includes(`/rm${cycle}`)).map(d => [d.url, d])).values()];
  const editalLink = current.find(d => /^edital do processo seletivo/i.test(d.text)) || current.find(d => /edital/i.test(d.url));
  const notices = current.map(d => ({ docKey: d.url, kind: d === editalLink ? 'EDITAL' : kindOf(d.text + ' ' + d.url), title: d.text || d.url.split('/').pop(), url: d.url, publishedAt: parseDate(d.text) }));
  const fields = {}; let programs = null, review = false;
  if (editalLink) {
    const doc = await ctx.docs.get(editalLink.url, { kind: 'pdf' });
    Object.assign(notices.find(n => n.url === editalLink.url), { contentHash: doc.contentHash, byteSize: doc.byteSize, contentType: doc.contentType, fetchedAt: doc.fetchedAt, parseStatus: doc.parseStatus, parseError: doc.parseError });
    const meta = f => ({ ...f, method: 'pdf-text', sourceUrl: editalLink.url, noticeKey: editalLink.url });
    if (doc.parseStatus === 'PARSED') {
      const x = extractFuvestFields(doc.text);
      fields.registration_start = meta(x.registration.status === 'ACCEPTED' ? { ...x.registration, value: x.registration.value.start } : x.registration);
      fields.registration_end = meta(x.registration.status === 'ACCEPTED' ? { ...x.registration, value: x.registration.value.end } : x.registration);
      fields.fee = meta(x.fee); fields.exam_date = meta(x.exam); fields.year = meta(x.year);
      const pub = parseDate(editalLink.text);
      fields.published_at = meta(pub ? accepted(pub, `Link oficial: “${editalLink.text}”`, 0.9) : notFound());
      const pr = extractFuvestPrograms(doc.text, editalLink.url);
      if (pr.rows.length) {
        programs = pr.rows;
        fields.total_vacancies = meta(pr.rejected.length ? needsReview(`${pr.rejected.length} linha(s) da tabela de vagas não fecharam a soma: ${pr.rejected.slice(0, 2).join(' | ')}`)
          : accepted(pr.rows.reduce((s, r) => s + r.vacancies, 0), `Soma da coluna “Total geral de vagas previstas a serem oferecidas” em ${pr.rows.length} programas do edital`, 0.85));
      } else fields.total_vacancies = meta(notFound());
    } else { review = true; ctx.log(`edital não interpretado: ${doc.parseError}`); }
  } else ctx.log('edital principal não identificado na página');
  return {
    complete: true,
    processes: [{
      externalKey: `rm${cycle}-fmusp`, name: `Residência Médica FMUSP ${cycle} — FUVEST`, type: 'Residência médica · acesso direto e com pré-requisito', group: null,
      institution: source.institution, officialUrl: PAGE, noticeUrl: editalLink?.url || null,
      statusNote: latestFeed ? `Última publicação no feed oficial: “${latestFeed.title}” (${latestFeed.pubDate})` : null,
      fields: validateFields(fields), programs, notices, needsReview: review
    }]
  };
}
