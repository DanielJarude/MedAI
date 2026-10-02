// ENARE — Exame Nacional de Residência (HU Brasil, antiga EBSERH; organização FGV Conhecimento).
// Descoberta: página oficial no gov.br → portal da edição (enareAAAA.conhecimento.fgv.br).
// Dados: lista de publicações embutida na página /publicacoes/ (Next.js), tabelas oficiais de vagas em JSON
// (/data/tabelas/*.json) e editais/cronogramas em PDF com camada de texto.
import { links, nextFlightObjects, stripTags } from '../html.mjs';
import { extractField, parseDate, parseRange, parseMoney, accepted, notFound, needsReview, validateFields, flat } from '../extract.mjs';
import { slug } from '../../../dist/taxonomy.js';

const GOVBR = 'https://www.gov.br/hubrasil/pt-br/ensino-e-pesquisa/exame-nacional-de-residencia-enare';
const FALLBACK_PORTAL = 'https://enare2026.conhecimento.fgv.br/';

export const source = {
  id: 'enare',
  name: 'ENARE — Exame Nacional de Residência (portal oficial)',
  organization: 'HU Brasil — Hospitais Universitários Federais (antiga EBSERH), com organização da FGV Conhecimento',
  url: GOVBR,
  sourceType: 'HTML + JSON + PDF',
  accessMethod: 'Página oficial gov.br (descoberta do portal da edição) → lista de publicações do portal FGV, tabelas oficiais de vagas em JSON e editais/cronogramas em PDF',
  automated: true,
  notes: 'O servidor do portal FGV não envia o certificado intermediário; o MedAI inclui o intermediário público GeoTrust TLS RSA CA G1 (DigiCert) e mantém a verificação TLS ativa.',
  institution: { id: 'hu-brasil', name: 'HU Brasil — Hospitais Universitários Federais (antiga EBSERH)', acronym: 'ENARE / HU Brasil', uf: null, officialUrl: GOVBR }
};

export const TRACKS = [
  { key: 'medica-acesso-direto', name: 'Residência Médica — Acesso Direto', type: 'Residência médica · acesso direto' },
  { key: 'medica-pre-requisito', name: 'Residência Médica — Especialidades com pré-requisito', type: 'Residência médica · com pré-requisito' }
];
const KIND = { edital: 'EDITAL', retificacao: 'RETIFICACAO', resultado: 'RESULTADO', anexo: 'ANEXO', comunicado: 'COMUNICADO' };
const docKey = url => { const u = new URL(url); u.searchParams.delete('v'); return u.href; };

export async function discoverPortal(ctx) {
  try {
    const page = await ctx.fetcher.get(GOVBR, { accept: 'text/html' });
    const candidates = links(page.body.toString('utf8'), GOVBR).map(l => /^https:\/\/enare(\d{4})\.conhecimento\.fgv\.br/.exec(l.url)).filter(Boolean);
    if (candidates.length) { const year = Math.max(...candidates.map(m => Number(m[1]))); return { portal: `https://enare${year}.conhecimento.fgv.br/`, discoveredFrom: GOVBR }; }
    ctx.log('ENARE: nenhum link de portal encontrado na página gov.br; usando o portal configurado');
  } catch (e) { ctx.log(`ENARE: página gov.br indisponível (${e.message}); usando o portal configurado`); }
  return { portal: FALLBACK_PORTAL, discoveredFrom: null };
}

// Período de inscrição e taxa no edital; data da prova e período no cronograma (anexo). Datas iguais nos dois
// documentos reforçam a confiança; divergência → verificação manual.
export function extractEditalFields(text) {
  const t = flat(text);
  return {
    registration: extractField(t, [{ re: /As inscrições estarão abertas das?[^.]{0,40}?dia (\d{2}\/\d{2}\/\d{4})[^.]{0,40}?dia (\d{2}\/\d{2}\/\d{4})/g, parse: m => ({ start: parseDate(m[1]), end: parseDate(m[2]) }), confidence: 0.95 }]),
    fee: extractField(t, [{ re: /valor da taxa de inscrição será de (R\$\s*[\d.]+,\d{2})/gi, parse: m => parseMoney(m[1]), confidence: 0.95 }])
  };
}
export function extractCronogramaFields(text) {
  const t = flat(text);
  return {
    registration: extractField(t, [{ re: /Período de Inscrição\s+(?:\d{1,2}h\d{0,2}\s+de\s+)?(\d{2}\/\d{2}(?:\/\d{4})?\s+a\s+(?:\d{1,2}h\d{0,2}\s+de\s+)?\d{2}\/\d{2}\/\d{4})/gi, parse: m => parseRange(m[1].replace(/\d{1,2}h\d{0,2}\s+de\s+/g, '')), confidence: 0.9 }]),
    exam: extractField(t, [{ re: /Aplicação da Prova Objetiva[^0-9]{0,40}(\d{2}\/\d{2}\/\d{4})/gi, parse: m => parseDate(m[1]), confidence: 0.9 }])
  };
}

// Tabela oficial de vagas → programas (um por instituição/cenário/especialidade/requisito).
export function programsFromVagas(rows, { noticeKey, tableUrl, updatedLabel }) {
  if (!Array.isArray(rows)) throw new Error('Tabela de vagas em formato inesperado');
  const programs = [], requisitos = new Set();
  let total = 0, valid = 0;
  for (const r of rows) {
    const specialty = String(r['Especialidade'] || '').trim(), inst = String(r['Instituição'] || '').trim();
    if (!specialty || !inst) continue;
    const vagas = Number.isInteger(r['Vagas Ofertadas Total']) ? r['Vagas Ofertadas Total'] : null;
    if (vagas !== null) { total += vagas; valid++; }
    if (r['Requisito']) requisitos.add(String(r['Requisito']).trim());
    const scenario = String(r['CenárioPratica'] || '').trim();
    programs.push({
      programKey: slug([inst, scenario, r['Cidade'], r['UF'], specialty, r['Requisito'], r['Tipo de Residência']].join('|')).slice(0, 300),
      specialty, specialtyId: slug(specialty), programType: r['Tipo de Residência'] || null, prerequisite: r['Requisito'] || null,
      vacancies: vagas, institutionName: inst, uf: r['UF'] || null, city: r['Cidade'] || null, duration: r['Duração'] || null,
      details: { cenario: scenario || null, ampla: r['Vagas Ampla Concorrência'] ?? null, pnp: r['Vagas PNP'] ?? null, pcd: r['Vagas PCD'] ?? null, indigena: r['Vagas Indígena'] ?? null, quilombola: r['Vagas Quilombola'] ?? null, observacao: r['Observação'] || null },
      evidence: `Tabela oficial de vagas${updatedLabel ? ` (atualizada em ${updatedLabel})` : ''}: ${inst} · ${specialty} · ${vagas ?? 'sem número'} vaga(s)`,
      noticeKey
    });
  }
  const totalField = valid && valid === programs.length ? { ...accepted(total, `Soma da coluna “Vagas Ofertadas Total” em ${valid} linhas da tabela oficial${updatedLabel ? ` atualizada em ${updatedLabel}` : ''}`, 0.95), method: 'api-json', sourceUrl: tableUrl, noticeKey }
    : valid ? { ...needsReview(`${programs.length - valid} linha(s) sem número de vagas na tabela oficial`), method: 'api-json', sourceUrl: tableUrl, noticeKey } : { ...notFound(), method: 'api-json', sourceUrl: tableUrl };
  const prereq = requisitos.size === 1 ? { ...accepted([...requisitos][0], `Coluna “Requisito” da tabela oficial: ${[...requisitos][0]}`, 0.9), method: 'api-json', sourceUrl: tableUrl, noticeKey }
    : requisitos.size ? { ...notFound(), evidence: `Requisito varia por programa (${requisitos.size} valores diferentes na tabela oficial); ver a lista de programas`, method: 'api-json', sourceUrl: tableUrl, noticeKey } : { ...notFound(), method: 'api-json', sourceUrl: tableUrl };
  return { programs, total: totalField, prerequisite: prereq };
}

const withMeta = (field, method, sourceUrl, noticeKey) => ({ ...field, method, sourceUrl, noticeKey });

function combineRegistration(a, b) {
  // a = edital, b = cronograma. Valores {start,end}.
  if (a.status === 'ACCEPTED' && b.status === 'ACCEPTED') {
    if (a.value.start === b.value.start && a.value.end === b.value.end) return { ...a, confidence: 0.98, evidence: `${a.evidence} | confere com o cronograma: ${b.evidence}` };
    return needsReview(`Edital: ${a.evidence} | Cronograma: ${b.evidence}`, [a.value, b.value]);
  }
  if (a.status === 'NEEDS_REVIEW' || b.status === 'NEEDS_REVIEW') return needsReview([a.evidence, b.evidence].filter(Boolean).join(' | '));
  return a.status === 'ACCEPTED' ? a : b;
}

export async function collect(ctx) {
  const { portal, discoveredFrom } = await discoverPortal(ctx);
  const pubPage = await ctx.fetcher.get(new URL('publicacoes/', portal).href, { accept: 'text/html' });
  const pubs = nextFlightObjects(pubPage.body.toString('utf8'), ['id', 'titulo', 'dataPublicacao', 'urlDocumento']);
  if (!pubs.length) throw new Error('Lista de publicações não encontrada no portal (estrutura da página mudou?)');
  const edition = /enare(\d{4})/.exec(portal)?.[1];
  const processes = [];
  for (const track of TRACKS) {
    const mine = pubs.filter(p => Array.isArray(p.destinatarios) && p.destinatarios.includes(track.key)).sort((a, b) => String(b.dataPublicacao).localeCompare(String(a.dataPublicacao)));
    if (!mine.length) { ctx.log(`ENARE: nenhuma publicação para ${track.key}`); continue; }
    const abs = u => new URL(u, portal).href;
    const notices = mine.filter(p => KIND[p.tipoDocumento] && String(p.urlDocumento).startsWith('/docs/')).map(p => ({ docKey: docKey(abs(p.urlDocumento)), kind: KIND[p.tipoDocumento], title: p.titulo + (p.descricao ? ` — ${p.descricao}` : ''), url: abs(p.urlDocumento), publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(p.dataPublicacao) ? p.dataPublicacao : null }));
    const edital = mine.filter(p => p.tipoDocumento === 'edital' && /^Edital n/i.test(p.titulo) && /Residência Médica/i.test(p.descricao || '')).at(0);
    const crono = mine.filter(p => p.tipoDocumento === 'anexo' && /cronograma/i.test(p.titulo)).at(0);
    const vagasPub = mine.find(p => p.tipoDocumento === 'anexo' && String(p.urlDocumento).startsWith('/vagas/'));
    const fields = {}; let needsReviewFlag = false, programs = null;

    let ed = { registration: notFound(), fee: notFound() }, cr = { registration: notFound(), exam: notFound() };
    if (edital) {
      const doc = await ctx.docs.get(abs(edital.urlDocumento), { kind: 'pdf', immutable: true });
      const n = notices.find(x => x.docKey === docKey(doc.url)); if (n) Object.assign(n, { contentHash: doc.contentHash, byteSize: doc.byteSize, contentType: doc.contentType, fetchedAt: doc.fetchedAt, parseStatus: doc.parseStatus, parseError: doc.parseError });
      if (doc.parseStatus === 'PARSED') ed = extractEditalFields(doc.text); else needsReviewFlag = true;
      fields.published_at = withMeta(accepted(edital.dataPublicacao, `Data de publicação na lista oficial: ${edital.titulo} — ${edital.dataPublicacao}`, 0.9), 'html-json', abs('publicacoes/'), docKey(doc.url));
    } else { fields.published_at = withMeta(notFound(), 'html-json', abs('publicacoes/')); ctx.log(`ENARE: edital principal não identificado para ${track.key}`); }
    if (crono) {
      const doc = await ctx.docs.get(abs(crono.urlDocumento), { kind: 'pdf', immutable: true });
      const n = notices.find(x => x.docKey === docKey(doc.url)); if (n) Object.assign(n, { contentHash: doc.contentHash, byteSize: doc.byteSize, contentType: doc.contentType, fetchedAt: doc.fetchedAt, parseStatus: doc.parseStatus, parseError: doc.parseError });
      if (doc.parseStatus === 'PARSED') cr = extractCronogramaFields(doc.text); else needsReviewFlag = true;
    }
    const editalUrl = edital ? abs(edital.urlDocumento) : portal, cronoUrl = crono ? abs(crono.urlDocumento) : portal;
    const reg = combineRegistration(ed.registration, cr.registration);
    const regUrl = ed.registration.status === 'ACCEPTED' ? editalUrl : cronoUrl;
    fields.registration_start = withMeta(reg.status === 'ACCEPTED' ? { ...reg, value: reg.value.start } : reg, 'pdf-text', regUrl, docKey(regUrl));
    fields.registration_end = withMeta(reg.status === 'ACCEPTED' ? { ...reg, value: reg.value.end } : reg, 'pdf-text', regUrl, docKey(regUrl));
    fields.fee = withMeta(ed.fee, 'pdf-text', editalUrl, docKey(editalUrl));
    fields.exam_date = withMeta(cr.exam, 'pdf-text', cronoUrl, docKey(cronoUrl));

    if (vagasPub) {
      const pageUrl = abs(vagasPub.urlDocumento);
      try {
        const page = (await ctx.fetcher.get(pageUrl, { accept: 'text/html' })).body.toString('utf8');
        const jsonPath = /\/data\/tabelas\/[a-z0-9-]+\.json(?:\?v=[a-z0-9]+)?/i.exec(page)?.[0];
        const updated = /Atualizado em:?\s*(?:\\?["',\[\]\s]*)*(\d{1,2} de [a-zçã]+ de \d{4})/i.exec(page)?.[1] || null;
        if (!jsonPath) throw new Error('Link da tabela de vagas não encontrado');
        const tableUrl = abs(jsonPath);
        const rows = JSON.parse((await ctx.fetcher.get(tableUrl, { accept: 'application/json' })).body.toString('utf8'));
        const key = docKey(pageUrl);
        notices.push({ docKey: key, kind: 'ANEXO', title: vagasPub.titulo, url: pageUrl, publishedAt: vagasPub.dataPublicacao || null, contentType: 'application/json', parseStatus: 'PARSED' });
        const v = programsFromVagas(rows, { noticeKey: key, tableUrl, updatedLabel: updated });
        programs = v.programs; fields.total_vacancies = v.total; fields.prerequisite = v.prerequisite;
      } catch (e) { ctx.log(`ENARE: tabela de vagas indisponível (${e.message})`); needsReviewFlag = true; }
    } else { fields.total_vacancies = withMeta(notFound(), 'api-json', portal); }

    // Ano de ingresso: o edital fala em "edição 2026/2027", sem afirmar o ano de ingresso. Não é inferido.
    fields.year = withMeta(notFound(), 'pdf-text', editalUrl);
    processes.push({
      externalKey: `${edition || 'edicao'}-${track.key}`, name: `ENARE ${edition ? `${edition}/${Number(edition) + 1}` : ''} — ${track.name}`.replace('  ', ' '), type: track.type, group: null,
      institution: source.institution, officialUrl: abs('publicacoes/'), noticeUrl: edital ? editalUrl : null,
      statusNote: discoveredFrom ? `Portal da edição encontrado a partir da página oficial ${discoveredFrom}` : 'Portal da edição configurado (página gov.br indisponível nesta coleta)',
      registrationNote: ed.registration.status === 'ACCEPTED' ? ed.registration.evidence.slice(0, 200) : null,
      fields: validateFields(fields), programs, notices, needsReview: needsReviewFlag
    });
  }
  if (!processes.length) throw new Error('Nenhum processo de residência médica identificado no portal');
  return { processes, complete: true };
}
