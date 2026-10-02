// Radar: extração, validação, coletores (com páginas/documentos de teste), armazenamento, mudanças e falhas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDate, parseRange, parseMoney, extractField, validateFields, accepted, STATUS } from '../server/radar/extract.mjs';
import { nextFlightObjects, rssItems, links } from '../server/radar/html.mjs';
import { parseRobots, isAllowed, createFetcher, FetchError } from '../server/radar/fetcher.mjs';
import { pdfToText, ParseError } from '../server/radar/documents.mjs';
import { extractEditalFields, extractCronogramaFields, programsFromVagas, collect as collectEnare } from '../server/radar/sources/enare.mjs';
import { extractFuvestFields, extractFuvestPrograms, collect as collectFuvest } from '../server/radar/sources/fuvest.mjs';
import { extractAremgFields, findCategories, collect as collectAremg } from '../server/radar/sources/aremg.mjs';
import { storeCollection } from '../server/radar/store.mjs';
import { runUpdate } from '../server/radar/update.mjs';
import { createRadarService, registrationState } from '../server/services/radar-service.mjs';
import { openDatabase } from '../server/db/index.mjs';
import { migrate } from '../server/db/migrate.mjs';
import { seedProduction } from '../server/db/seed/production.mjs';

const fx = name => readFileSync(new URL(`./fixtures/radar/${name}`, import.meta.url), 'utf8');
const NOW = new Date(2026, 9, 1, 12).getTime();
const DAY = 86400000;

async function freshDb() { const db = await openDatabase('pglite:memory'); await migrate(db); await seedProduction(db); return db; }

// ---------- Extração ----------
test('datas, períodos e valores em formatos de edital; data impossível é recusada', () => {
  assert.equal(parseDate('13/09/2026'), '2026-09-13');
  assert.equal(parseDate('06 de dezembro de 2026 (domingo)'), '2026-12-06');
  assert.equal(parseDate('31/02/2026'), null, 'não "corrige" data inexistente');
  assert.deepEqual(parseRange('06/10 a 15/10/2026'), { start: '2026-10-06', end: '2026-10-15' });
  assert.deepEqual(parseRange('06 de outubro de 2026 ... 26 de outubro de 2026'), { start: '2026-10-06', end: '2026-10-26' });
  assert.equal(parseMoney('R$ 620,00'), 62000);
  assert.equal(parseMoney('R$1.250,50'), 125050);
  assert.equal(parseMoney('sem valor'), null);
});

test('campo ausente → NOT_FOUND; valores divergentes (documento ambíguo) → NEEDS_REVIEW sem valor', () => {
  const pat = [{ re: /prova em (\d{2}\/\d{2}\/\d{4})/g, parse: m => parseDate(m[1]) }];
  assert.equal(extractField('nenhuma data aqui', pat).status, STATUS.NOT_FOUND);
  assert.equal(extractField('nenhuma data aqui', pat).value, null);
  const one = extractField('A prova em 22/11/2026. Repetindo: prova em 22/11/2026.', pat);
  assert.equal(one.status, STATUS.ACCEPTED); assert.equal(one.value, '2026-11-22'); assert.match(one.evidence, /prova em 22\/11\/2026/);
  const two = extractField('prova em 22/11/2026 ... prova em 29/11/2026', pat);
  assert.equal(two.status, STATUS.NEEDS_REVIEW); assert.equal(two.value, null); assert.deepEqual(two.candidates, ['2026-11-22', '2026-11-29']);
});

test('validação: início depois do fim, prova antes das inscrições e taxa implausível vão para verificação', () => {
  const v = validateFields({ registration_start: accepted('2026-10-20', 'a'), registration_end: accepted('2026-10-06', 'b'), exam_date: accepted('2026-01-01', 'c'), fee: accepted(5, 'd') });
  for (const k of ['registration_start', 'registration_end', 'fee']) assert.equal(v[k].status, STATUS.NEEDS_REVIEW, k);
  assert.equal(v.exam_date.status, STATUS.NEEDS_REVIEW);
});

test('ENARE: edital e cronograma oficiais (trechos reais) → período, taxa e prova com evidência', () => {
  const e = extractEditalFields(fx('enare-edital02.txt')), c = extractCronogramaFields(fx('enare-cronograma.txt'));
  assert.deepEqual(e.registration.value, { start: '2026-06-15', end: '2026-07-05' });
  assert.equal(e.fee.value, 33000); assert.match(e.fee.evidence, /R\$ 330,00/);
  assert.deepEqual(c.registration.value, { start: '2026-06-15', end: '2026-07-05' });
  assert.equal(c.exam.value, '2026-09-13'); assert.match(c.exam.evidence, /Aplicação da Prova Objetiva/);
});

test('FUVEST: período de inscrição não é confundido com o período de isenção de taxa', () => {
  const x = extractFuvestFields(fx('fuvest-edital.txt'));
  assert.equal(x.registration.status, STATUS.ACCEPTED);
  assert.deepEqual(x.registration.value, { start: '2026-10-06', end: '2026-10-26' });
  assert.equal(x.fee.value, 62000); assert.equal(x.exam.value, '2026-12-06'); assert.equal(x.year.value, 2027);
  const p = extractFuvestPrograms(fx('fuvest-edital.txt'), 'k');
  assert.equal(p.rows.length, 7);
  assert.deepEqual(p.rows.find(r => r.details.codigo === '005'), { ...p.rows.find(r => r.details.codigo === '005'), specialty: 'Anestesiologia', vacancies: 35 });
  const four = extractFuvestPrograms('149 Cirurgia Geral Aprovado 24 1544/21 3 anos 1 0 23 23\n107 Endocrinologia e Metabologia – Ano\nAdicional Aprovado 4 2026/806 1 ano 0 1 1\n087 Cirurgia Geral – Programa Avançado Aprovado 6 943/23 2 anos 0 2 2', 'k');
  assert.deepEqual(four.rows.map(r => [r.specialty, r.vacancies]), [['Cirurgia Geral', 23], ['Endocrinologia e Metabologia – Ano Adicional', 1], ['Cirurgia Geral – Programa Avançado', 2]], 'retorno FA e nome em duas linhas');
  assert.equal(four.rows[2].specialtyId, 'cirurgia-geral-programa-avancado', 'programa avançado não é confundido com acesso direto');
  const glued = extractFuvestPrograms('102 Medicina Nuclear – Ano Adicional Aprovado 6 416/21 1ano 4 0 4\n024 Medicina Paliativa Aprovado 16 300/24 2 anos 14 1 15', 'k');
  assert.deepEqual(glued.rows.map(r => [r.details.codigo, r.vacancies, r.duration]), [['102', 4, '1 ano'], ['024', 15, '2 anos']], 'linhas vizinhas nunca são misturadas');
  const bad = extractFuvestPrograms('090 Acupuntura Aprovado 6 395/21 2 anos 0 2 9', 'k');
  assert.equal(bad.rows.length, 0, 'linha cuja soma não fecha é descartada'); assert.equal(bad.rejected.length, 1);
});

test('AREMG: cronograma e taxa do edital da instituição; ano de ingresso declarado', () => {
  const x = extractAremgFields(fx('aremg-edital.txt'));
  assert.deepEqual(x.registration.value, { start: '2026-10-06', end: '2026-10-15' });
  assert.equal(x.exam.value, '2026-11-22'); assert.equal(x.published.value, '2026-09-21');
  assert.equal(x.fee.value, 30000); assert.match(x.fee.evidence, /por programa/);
  assert.equal(x.year.value, 2027);
});

test('tabela de vagas ENARE: total somado só quando todas as linhas têm número; requisito único ou "varia"', () => {
  const row = (inst, esp, vagas, req = 'GRADUAÇÃO EM MEDICINA') => ({ 'UF': 'MT', 'Cidade': 'Rondonópolis', 'Instituição': inst, 'Especialidade': esp, 'Requisito': req, 'Tipo de Residência': 'acesso direto', 'Duração': '3 anos', 'Vagas Ofertadas Total': vagas });
  const ok = programsFromVagas([row('A', 'CIRURGIA GERAL', 4), row('B', 'PEDIATRIA', 2)], { noticeKey: 'k', tableUrl: 'https://x/t.json' });
  assert.equal(ok.total.value, 6); assert.equal(ok.prerequisite.value, 'GRADUAÇÃO EM MEDICINA'); assert.equal(ok.programs[0].specialtyId, 'cirurgia-geral');
  const missing = programsFromVagas([row('A', 'CIRURGIA GERAL', 4), row('B', 'PEDIATRIA', undefined)], { noticeKey: 'k', tableUrl: 'u' });
  assert.equal(missing.total.status, STATUS.NEEDS_REVIEW); assert.equal(missing.total.value, null);
  assert.equal(missing.programs[1].vacancies, null, 'processo sem vagas informadas fica null, nunca 0 inventado');
  const varies = programsFromVagas([row('A', 'X', 1, 'R1'), row('B', 'Y', 1, 'R2')], { noticeKey: 'k', tableUrl: 'u' });
  assert.equal(varies.prerequisite.status, STATUS.NOT_FOUND); assert.match(varies.prerequisite.evidence, /varia/);
});

test('HTML: dados Next.js, RSS e links; robots.txt', () => {
  const html = `<script>self.__next_f.push([1,${JSON.stringify('x:[{"id":"1","titulo":"Edital n.º 02","dataPublicacao":"2026-05-29","urlDocumento":"/docs/a.pdf?v=1","destinatarios":["medica-acesso-direto"]}]')}])</script>`;
  assert.equal(nextFlightObjects(html, ['id', 'titulo', 'dataPublicacao', 'urlDocumento'])[0].titulo, 'Edital n.º 02');
  assert.equal(rssItems('<rss><item><title><![CDATA[Residência Médica]]></title><link>https://a/b</link></item></rss>')[0].title, 'Residência Médica');
  assert.equal(links('<a href="/x.pdf">Edital &amp; anexo</a>', 'https://s.br/p/')[0].url, 'https://s.br/x.pdf');
  const rules = parseRobots('User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n\nUser-agent: OutroBot\nDisallow: /', 'MedAI-Radar/1.0');
  assert.equal(isAllowed(rules, '/residencia-medica/'), true);
  assert.equal(isAllowed(rules, '/wp-admin/x'), false);
  assert.equal(isAllowed(rules, '/wp-admin/admin-ajax.php'), true);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow: /', 'MedAI-Radar/1.0'), '/qualquer'), false);
});

test('PDF inválido e PDF sem texto são recusados de forma explícita', async () => {
  await assert.rejects(() => pdfToText(Buffer.from('<html>não é pdf</html>')), ParseError);
  await assert.rejects(() => pdfToText(Buffer.from('%PDF-1.4\nlixo corrompido')), ParseError);
});

// ---------- Fetcher com transporte simulado ----------
const page = (body, status = 200, headers = {}) => ({ status, headers: { 'content-type': 'text/html', ...headers }, body: Buffer.from(body) });
function fakeFetcher(routes) {
  const calls = [];
  const transport = async url => { calls.push(url); const r = routes[url] ?? routes[new URL(url).pathname]; if (typeof r === 'function') return { url, ...r() }; if (!r) return { url, ...page('não encontrado', 404) }; return { url, ...r }; };
  return { fetcher: createFetcher({ userAgent: 'MedAI-Radar/test', minIntervalMs: 0, transport }), calls };
}

test('fetcher: robots.txt que proíbe impede a coleta; HTTP 500/403 viram erro da fonte', async () => {
  const { fetcher } = fakeFetcher({ 'https://a.br/robots.txt': page('User-agent: *\nDisallow: /'), 'https://b.br/robots.txt': page('', 404), 'https://b.br/x': page('erro', 500), 'https://b.br/y': page('proibido', 403) });
  await assert.rejects(() => fetcher.get('https://a.br/edital.pdf'), e => e.code === 'ROBOTS');
  await assert.rejects(() => fetcher.get('https://b.br/x'), e => e instanceof FetchError && e.status === 500 && e.unavailable);
  await assert.rejects(() => fetcher.get('https://b.br/y'), e => e.status === 403 && !e.unavailable);
});

// Documentos simulados: o coletor só recebe texto, como se o PDF tivesse sido baixado e interpretado.
const fakeDocs = map => ({ async get(url) { const t = map[url]; if (t === undefined) throw new FetchError('HTTP 404', { status: 404, url }); return t === null ? { url, text: null, parseStatus: 'FAILED', parseError: 'PDF ilegível', contentHash: 'h', byteSize: 1 } : { url, text: t, parseStatus: 'PARSED', contentHash: 'h-' + t.length, byteSize: t.length, contentType: 'application/pdf', fetchedAt: new Date(NOW).toISOString() }; } });
const ctxOf = (fetcher, docs) => ({ fetcher, docs, log: () => {}, now: NOW });

function enareRoutes({ editalText = fx('enare-edital02.txt'), vagas = [{ 'UF': 'MG', 'Cidade': 'Uberaba', 'Instituição': 'HC-UFTM', 'Especialidade': 'CIRURGIA GERAL', 'Requisito': 'GRADUAÇÃO EM MEDICINA', 'Tipo de Residência': 'acesso direto', 'Vagas Ofertadas Total': 3 }] } = {}) {
  const P = 'https://enare2026.conhecimento.fgv.br/';
  const pubs = [
    { id: '1', titulo: 'Edital n.º 02 (Retificado em 29/06/2026)', descricao: 'Edital de Residência Médica (Acesso Direto)', dataPublicacao: '2026-05-29', tipoDocumento: 'edital', destinatarios: ['medica-acesso-direto'], urlDocumento: '/docs/ed02.pdf?v=1' },
    { id: '2', titulo: 'Anexo III - Cronograma Previsto', descricao: '', dataPublicacao: '2026-05-29', tipoDocumento: 'anexo', destinatarios: ['medica-acesso-direto'], urlDocumento: '/docs/crono.pdf?v=1' },
    { id: '3', titulo: 'Anexo II - Vagas ofertadas', descricao: '', dataPublicacao: '2026-06-10', tipoDocumento: 'anexo', destinatarios: ['medica-acesso-direto'], urlDocumento: '/vagas/medica-acesso-direto/' },
    { id: '4', titulo: '1ª Retificação do Edital n.º 02', descricao: '', dataPublicacao: '2026-06-29', tipoDocumento: 'retificacao', destinatarios: ['medica-acesso-direto'], urlDocumento: '/docs/ret1.pdf?v=1' }
  ];
  return {
    routes: {
      'https://www.gov.br/robots.txt': page('User-agent: *\nDisallow: /ebserh/*?'), [`${P}robots.txt`]: page('User-agent: *\nAllow: /'),
      'https://www.gov.br/hubrasil/pt-br/ensino-e-pesquisa/exame-nacional-de-residencia-enare': page('<a href="https://enare2026.conhecimento.fgv.br/">Portal</a>'),
      [`${P}publicacoes/`]: page(`<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(pubs))}])</script>`),
      [`${P}vagas/medica-acesso-direto/`]: page('<script>"/data/tabelas/vagas-medica-acesso-direto.json?v=abc" "Atualizado em: ","31 de agosto de 2026"</script>'),
      [`${P}data/tabelas/vagas-medica-acesso-direto.json?v=abc`]: { status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify(vagas)) }
    },
    docs: { [`${P}docs/ed02.pdf?v=1`]: editalText, [`${P}docs/crono.pdf?v=1`]: fx('enare-cronograma.txt') }
  };
}

test('ENARE fim a fim (descoberta → publicações → PDFs → vagas JSON) e proveniência de cada campo', async () => {
  const r = enareRoutes(), { fetcher } = fakeFetcher(r.routes);
  const out = await collectEnare(ctxOf(fetcher, fakeDocs(r.docs)));
  const p = out.processes.find(x => x.externalKey === '2026-medica-acesso-direto');
  assert.equal(out.processes.length, 1, 'só a trilha com publicações vira processo');
  assert.equal(p.fields.registration_start.value, '2026-06-15'); assert.equal(p.fields.registration_end.value, '2026-07-05');
  assert.equal(p.fields.fee.value, 33000); assert.equal(p.fields.exam_date.value, '2026-09-13'); assert.equal(p.fields.total_vacancies.value, 3);
  assert.equal(p.fields.year.status, STATUS.NOT_FOUND, 'ano de ingresso não declarado não é inferido');
  for (const f of Object.values(p.fields)) assert.ok(f.sourceUrl?.startsWith('https://'), 'todo campo aponta para um documento oficial');
  assert.ok(p.notices.some(n => n.kind === 'RETIFICACAO'));
  assert.equal(p.notices.find(n => n.url.includes('ed02')).docKey, 'https://enare2026.conhecimento.fgv.br/docs/ed02.pdf', 'identidade do documento ignora ?v=');
});

test('ENARE: edital ilegível (PDF inválido) → processo marcado para verificação, sem datas inventadas', async () => {
  const r = enareRoutes({ editalText: null }), { fetcher } = fakeFetcher(r.routes);
  const p = (await collectEnare(ctxOf(fetcher, fakeDocs(r.docs)))).processes[0];
  assert.equal(p.needsReview, true);
  assert.equal(p.fields.fee.status, STATUS.NOT_FOUND); assert.equal(p.fields.fee.value, null);
  assert.equal(p.fields.registration_start.value, '2026-06-15', 'o cronograma (outro documento oficial) ainda informa o período');
});

test('FUVEST fim a fim: página oficial → edital → campos, programas e link oficial', async () => {
  const pdf = 'https://www.fuvest.br/wp-content/uploads/rm2027-edital-02-2026.pdf';
  const { fetcher } = fakeFetcher({ 'https://www.fuvest.br/robots.txt': page('User-agent: *\nDisallow: /wp-admin/'), 'https://www.fuvest.br/feed/': page('<rss><item><title>Residência Médica – Nº 02/2026</title><link>https://www.fuvest.br/residencia-medica/</link></item></rss>'), 'https://www.fuvest.br/residencia-medica/': page(`<a href="${pdf}">Edital do Processo Seletivo – Publicado em 18/09/2026</a>`) });
  const p = (await collectFuvest(ctxOf(fetcher, fakeDocs({ [pdf]: fx('fuvest-edital.txt') })))).processes[0];
  assert.equal(p.name, 'Residência Médica FMUSP 2027 — FUVEST');
  assert.equal(p.fields.registration_start.value, '2026-10-06'); assert.equal(p.fields.published_at.value, '2026-09-18');
  assert.equal(p.programs.length, 7); assert.equal(p.fields.total_vacancies.value, 56);
  assert.equal(p.noticeUrl, pdf);
});

test('FUVEST: página sem documentos → erro explícito (nada inventado)', async () => {
  const { fetcher } = fakeFetcher({ 'https://www.fuvest.br/robots.txt': page('', 404), 'https://www.fuvest.br/residencia-medica/': page('<p>em breve</p>') });
  await assert.rejects(() => collectFuvest(ctxOf(fetcher, fakeDocs({}))), /Nenhum documento/);
});

test('AREMG fim a fim: categorias da página → editais por instituição (JSON em windows-1252) → um processo por edital', async () => {
  const pdf = 'https://www.galaxcms.com.br/up_crud_comum/601/HospitalTeste-EditalPSUMG2027.pdf';
  const html = '<a class="w-inline-block link-categoria-processo link-categoria" href="#" data-id="107"><div>Processo Seletivo Unificado de Residência Médica de Minas Gerais - PSU MG 2027</div></a><a class="w-inline-block link-categoria-edital" data-id="106" data-tipo="1"><div>Processo Seletivo Unificado de Residência Médica de Minas Gerais - PSU MG 2027</div></a>';
  assert.deepEqual(findCategories(html), { process: { id: '107', text: 'Processo Seletivo Unificado de Residência Médica de Minas Gerais - PSU MG 2027' }, editais: { id: '106', text: 'Processo Seletivo Unificado de Residência Médica de Minas Gerais - PSU MG 2027' }, year: 2027 });
  const json = obj => ({ status: 200, headers: { 'content-type': 'text/html; charset=ISO-8859-1' }, body: Buffer.from(JSON.stringify(obj), 'latin1') });
  const { fetcher } = fakeFetcher({
    'https://www.aremg.org.br/robots.txt': page('', 404), 'https://www.aremg.org.br/processos-atuais': page(html),
    'https://www.aremg.org.br/ajaxCarregaProcesso.ajax.php?id=107': json({ html: '<a href="detalhes-do-processo/retificacao/2380"><div>22/09/2026 - Retificação Nº 1 aos Editais | PSU MG 2027</div></a>' }),
    'https://www.aremg.org.br/ajaxCarregaCategoriaEdital.ajax.php?id=106&tipo=1': json({ html: `<a href="${pdf}"><div>Hospital Teste - Edital PSU MG 2027</div></a>` })
  });
  const out = await collectAremg(ctxOf(fetcher, fakeDocs({ [pdf]: fx('aremg-edital.txt') })));
  const p = out.processes[0];
  assert.equal(p.group, 'PSU-MG 2027'); assert.equal(p.institution.name, 'Hospital Teste');
  assert.equal(p.fields.exam_date.value, '2026-11-22'); assert.equal(p.fields.total_vacancies.status, STATUS.NOT_FOUND);
  assert.match(p.statusNote, /Retificação Nº 1/); assert.ok(p.notices.some(n => n.kind === 'RETIFICACAO'));
});

// ---------- Armazenamento, deduplicação, mudanças, remoções ----------
const SOURCE = { id: 'fuvest-rm-fmusp', name: 'FUVEST' };
const proc = (over = {}) => ({ externalKey: 'rm2027-fmusp', name: 'Residência Médica FMUSP 2027 — FUVEST', officialUrl: 'https://www.fuvest.br/residencia-medica/', institution: { id: 'fmusp', name: 'FMUSP', uf: 'SP' },
  fields: { registration_start: { ...accepted('2026-10-06', 'trecho'), sourceUrl: 'https://www.fuvest.br/e.pdf', noticeKey: 'e' }, registration_end: { ...accepted('2026-10-26', 'trecho'), sourceUrl: 'https://www.fuvest.br/e.pdf' }, total_vacancies: { status: 'NOT_FOUND', value: null, evidence: null, confidence: 0 } },
  programs: [{ programKey: 'p1', specialty: 'Cirurgia Geral', vacancies: null }],
  notices: [{ docKey: 'e', kind: 'EDITAL', title: 'Edital', url: 'https://www.fuvest.br/e.pdf' }], ...over });

test('armazenamento: idempotente, sem duplicação; ausência vira NULL; mudança de data, retificação e remoção ficam no histórico', async () => {
  const db = await freshDb();
  await storeCollection(db, SOURCE, { processes: [proc()], complete: true }, { now: NOW });
  await storeCollection(db, SOURCE, { processes: [proc()], complete: true }, { now: NOW + 1000 });
  assert.equal((await db.query('SELECT count(*)::int n FROM selection_processes')).rows[0].n, 1);
  assert.equal((await db.query('SELECT count(*)::int n FROM notices')).rows[0].n, 1);
  assert.equal((await db.query('SELECT count(*)::int n FROM residency_programs')).rows[0].n, 1);
  const row = (await db.query('SELECT * FROM selection_processes')).rows[0];
  assert.equal(row.total_vacancies, null); assert.equal(row.fee_cents, null);
  assert.equal((await db.query("SELECT count(*)::int n FROM process_changes WHERE change_type = 'NOVO_PROCESSO'")).rows[0].n, 1);

  const changed = proc({ fields: { ...proc().fields, registration_end: { ...accepted('2026-10-28', 'novo trecho'), sourceUrl: 'https://www.fuvest.br/e2.pdf' } }, notices: [...proc().notices, { docKey: 'r1', kind: 'RETIFICACAO', title: 'Retificação 1', url: 'https://www.fuvest.br/r1.pdf' }] });
  await storeCollection(db, SOURCE, { processes: [changed], complete: true }, { now: NOW + 2000 });
  const changes = (await db.query('SELECT change_type, field, old_value, new_value FROM process_changes ORDER BY id')).rows;
  assert.ok(changes.some(c => c.change_type === 'DATA_ALTERADA' && c.field === 'registration_end' && c.old_value === '2026-10-26' && c.new_value === '2026-10-28'));
  assert.ok(changes.some(c => c.change_type === 'EDITAL_RETIFICADO'));

  await storeCollection(db, SOURCE, { processes: [proc({ notices: [{ docKey: 'r1', kind: 'RETIFICACAO', title: 'Retificação 1', url: 'https://www.fuvest.br/r1.pdf' }] })], complete: true }, { now: NOW + 3000 });
  assert.ok((await db.query("SELECT 1 FROM process_changes WHERE change_type = 'REMOVIDO_DA_FONTE'")).rows.length, 'edital removido registrado');
  assert.ok((await db.query("SELECT removed_at FROM notices WHERE doc_key = 'e'")).rows[0].removed_at);

  await storeCollection(db, SOURCE, { processes: [], complete: true }, { now: NOW + 4000 });
  assert.ok((await db.query('SELECT removed_at FROM selection_processes')).rows[0].removed_at, 'processo que sumiu da fonte é marcado, não apagado');
  const radar = createRadarService(db, { clock: () => NOW });
  assert.equal((await radar.list({})).items.length, 0, 'Radar sem resultados quando nada está ativo');
  await db.close();
});

test('estado das inscrições: transição observada entre coletas gera INSCRICOES_ABERTAS', async () => {
  const db = await freshDb();
  await storeCollection(db, SOURCE, { processes: [proc()], complete: true }, { now: NOW });
  assert.equal(registrationState({ registration_start: '2026-10-06', registration_end: '2026-10-26' }, '2026-10-01'), 'UPCOMING');
  await storeCollection(db, SOURCE, { processes: [proc()], complete: true }, { now: NOW + 6 * DAY });
  const c = (await db.query("SELECT change_type FROM process_changes WHERE change_type = 'INSCRICOES_ABERTAS'")).rows;
  assert.equal(c.length, 1);
  assert.equal(registrationState({ registration_start: null, registration_end: '2026-10-26' }, '2026-10-10'), 'UNKNOWN', 'só uma data: não afirma inscrições abertas');
  await db.close();
});

test('falha de fonte (HTTP 503 / fora do ar) preserva dados existentes e registra o erro', async () => {
  const db = await freshDb();
  await storeCollection(db, SOURCE, { processes: [proc()], complete: true }, { now: NOW });
  const down = { source: { id: 'fuvest-rm-fmusp', name: 'FUVEST', automated: true }, collect: async () => { throw new FetchError('HTTP 503', { status: 503, url: 'https://www.fuvest.br/residencia-medica/' }); } };
  const res = await runUpdate(db, { collectors: [down], fetcher: {}, log: () => {} });
  assert.equal(res[0].status, 'UNAVAILABLE');
  const src = (await db.query("SELECT last_status, last_error FROM notice_sources WHERE id = 'fuvest-rm-fmusp'")).rows[0];
  assert.equal(src.last_status, 'UNAVAILABLE'); assert.match(src.last_error, /503/);
  assert.equal((await db.query('SELECT count(*)::int n FROM selection_processes WHERE removed_at IS NULL')).rows[0].n, 1);
  assert.equal((await db.query("SELECT status FROM ingestion_runs ORDER BY id DESC LIMIT 1")).rows[0].status, 'ERROR');
  await db.close();
});

test('API do Radar: filtros, especialidade prioriza sem esconder, detalhe com evidência e fonte', async () => {
  const db = await freshDb();
  await storeCollection(db, SOURCE, { processes: [proc({ programs: [{ programKey: 'p1', specialty: 'Cirurgia Geral', vacancies: 2, uf: 'SP' }] })], complete: true }, { now: NOW });
  await storeCollection(db, { id: 'enare', name: 'ENARE' }, { processes: [{ externalKey: 'x', name: 'ENARE — Teste', officialUrl: 'https://enare2026.conhecimento.fgv.br/publicacoes/', fields: {}, programs: [{ programKey: 'q', specialty: 'PEDIATRIA', vacancies: 1, uf: 'MG' }], notices: [] }], complete: true }, { now: NOW });
  const radar = createRadarService(db, { clock: () => NOW });
  assert.equal((await radar.list({})).items.length, 2);
  assert.equal((await radar.list({ specialty: 'Cirurgia Geral' })).items.length, 1);
  assert.equal((await radar.list({ uf: 'MG' })).items[0].name, 'ENARE — Teste', 'UF dos programas também filtra');
  assert.equal((await radar.list({ open: '1' })).items.length, 0);
  const d = await radar.detail('fuvest-rm-fmusp--rm2027-fmusp');
  assert.equal(d.officialUrl, 'https://www.fuvest.br/residencia-medica/');
  assert.ok(d.fields.find(f => f.field === 'registration_start').evidence);
  assert.equal(d.totalVacancies, null);
  assert.equal(d.feeCents, null);
  await db.close();
});
