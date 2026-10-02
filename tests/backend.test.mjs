// Backend e integração: API HTTP real (node:http) sobre PGlite em memória, com relógio controlado.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDatabase, DatabaseUnavailableError } from '../server/db/index.mjs';
import { prepareDatabase } from '../server/index.mjs';
import { createApp } from '../server/app.mjs';
import { readConfig } from '../server/config.mjs';
import { storeCollection } from '../server/radar/store.mjs';
import { accepted } from '../server/radar/extract.mjs';
import { QUESTION_BY_ID } from '../dist/question-bank.js';

const DAY = 86400000;
const GOAL = { name: 'Ana', exam: 'ENARE', year: 2027, specialty: 'Cirurgia Geral', hours: 12, date: '2027-10-17' };

async function startServer({ db, clock } = {}) {
  db ||= await openDatabase('pglite:memory');
  await prepareDatabase(db, { log: () => {} });
  const t = { now: new Date(2026, 9, 1, 12).getTime() };
  const app = await createApp({ db, config: readConfig({}), clock: clock || (() => t.now), log: { error: () => {} } });
  const server = http.createServer(app).listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, t, base, close: () => new Promise(r => server.close(r)), client: () => client(base) };
}

function client(base) {
  let jar = '';
  const call = async (method, path, body, { csrf = true } = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(csrf && method !== 'GET' ? { 'x-medai-request': '1' } : {}), cookie: jar }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) jar = sc.split(';')[0];
    let j = {}; try { j = await r.json(); } catch {}
    return { status: r.status, ...j, headers: r.headers };
  };
  return { call, get cookie() { return jar; } };
}

async function onboard(c, goal = GOAL) {
  await c.call('PUT', '/api/onboarding', { step: 3, draft: goal });
  return c.call('POST', '/api/onboarding/confirm', {});
}
async function answerSession(c, decide) {
  let s = (await c.call('GET', '/api/state')).state;
  const n = s.session.items.length;
  for (let i = 0; i < n; i++) {
    const q = QUESTION_BY_ID.get(s.session.items[i].questionId);
    const r = await c.call('POST', '/api/sessions/current/answers', { index: i, choice: decide(q, i) ? q.correct : (q.correct + 1) % 4 });
    assert.equal(r.status, 200, r.error);
    s = r.state;
    if (i < n - 1) s = (await c.call('POST', '/api/sessions/current/advance', { index: i })).state;
  }
  return c.call('POST', '/api/sessions/current/finish', {});
}

test('conta: cadastro, senha com hash, sessão por cookie, login errado, e-mail duplicado e saída', async () => {
  const s = await startServer(), c = s.client();
  assert.equal((await c.call('POST', '/api/auth/register', { email: 'x', password: 'curta' })).status, 422);
  const r = await c.call('POST', '/api/auth/register', { email: 'Ana@Exemplo.com', password: 'senha-forte-123' });
  assert.equal(r.status, 201);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/); assert.match(r.headers.get('set-cookie'), /SameSite=Lax/);
  const row = (await s.db.query('SELECT email, password_hash FROM users')).rows[0];
  assert.equal(row.email, 'ana@exemplo.com'); assert.match(row.password_hash, /^scrypt\$/); assert.ok(!row.password_hash.includes('senha-forte-123'));
  assert.equal((await c.call('GET', '/api/auth/me')).user.email, 'ana@exemplo.com');
  assert.equal((await s.client().call('POST', '/api/auth/register', { email: 'ana@exemplo.com', password: 'outra-senha-123' })).status, 409);
  assert.equal((await s.client().call('POST', '/api/auth/login', { email: 'ana@exemplo.com', password: 'errada-errada' })).status, 401);
  await c.call('POST', '/api/auth/logout', {});
  assert.equal((await c.call('GET', '/api/state')).status, 401);
  const tokens = (await s.db.query('SELECT token_hash FROM auth_sessions')).rows;
  assert.ok(tokens.every(t => /^[0-9a-f]{64}$/.test(t.token_hash)), 'banco guarda só o hash do token');
  await s.close(); await s.db.close();
});

test('segurança: mutação sem cabeçalho anti-CSRF é recusada; sem login → 401; JSON inválido → 400', async () => {
  const s = await startServer(), c = s.client();
  await c.call('POST', '/api/auth/register', { email: 'b@b.com', password: 'senha-forte-123' });
  assert.equal((await c.call('PUT', '/api/onboarding', { step: 1, draft: {} }, { csrf: false })).status, 403);
  assert.equal((await s.client().call('GET', '/api/state')).status, 401);
  const raw = await fetch(s.base + '/api/onboarding', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-medai-request': '1', cookie: c.cookie }, body: '{quebrado' });
  assert.equal(raw.status, 400);
  const body = await raw.json(); assert.ok(!JSON.stringify(body).includes('at '), 'sem stack trace na resposta');
  await s.close(); await s.db.close();
});

test('usuário sem histórico: estado vazio, sem dados DEMO, desempenho sem números', async () => {
  const s = await startServer(), c = s.client();
  await c.call('POST', '/api/auth/register', { email: 'novo@x.com', password: 'senha-forte-123' });
  const st = (await c.call('GET', '/api/state')).state;
  assert.equal(st.profile, null); assert.deepEqual(st.answers, []); assert.deepEqual(st.reviews, []);
  assert.ok(Object.values(st.knowledge.nodes).every(n => n.questionsAnswered === 0 && n.currentMastery === null));
  assert.equal((await c.call('POST', '/api/sessions', { type: 'recommended' })).status, 409, 'sessão exige meta confirmada');
  await s.close(); await s.db.close();
});

test('fluxo completo: onboarding → sessão → tentativas → domínio → erro recorrente → revisão → prioridade → reentrada', async () => {
  const s = await startServer(), c = s.client();
  await c.call('POST', '/api/auth/register', { email: 'fluxo@x.com', password: 'senha-forte-123' });
  await c.call('PUT', '/api/onboarding', { step: 2, draft: { name: 'Ana', exam: 'ENARE', year: 2027, specialty: 'Cirurgia Geral' } });
  assert.equal((await c.call('GET', '/api/state')).state.onboarding.step, 2, 'rascunho persistido no servidor');
  const conf = await onboard(c);
  assert.equal(conf.state.profile.specialtyId, 'cirurgia-geral');
  assert.equal((await s.db.query('SELECT name, target_date FROM study_goals')).rows[0].target_date, '2027-10-17');

  // Sessão 1 (equilibrada): erra tudo de Clínica Médica.
  const start = await c.call('POST', '/api/sessions', { type: 'recommended' });
  assert.equal(start.status, 201); assert.equal(start.state.session.items.length, 10);
  const fin = await answerSession(c, q => q.areaKey !== 'clinica-medica');
  assert.equal(fin.state.session.done, true);
  assert.equal((await s.db.query('SELECT count(*)::int n FROM question_attempts')).rows[0].n, 10);
  assert.ok((await s.db.query("SELECT 1 FROM topic_mastery WHERE node_key = 'clinica-medica/cardiologia' AND questions_answered > 0")).rows.length);

  // Sessão 2 personalizada: concentra Cardiologia/Nefrologia; erros recorrentes criam revisão para hoje.
  s.t.now += 60 * 60000;
  const s2 = await c.call('POST', '/api/sessions', { type: 'recommended' });
  assert.equal(s2.state.session.kind, 'adaptive');
  const clin = s2.state.session.items.filter(i => i.topicKey.startsWith('clinica-medica/')).length;
  assert.ok(clin >= 4, `sessão personalizada prioriza lacunas (${clin})`);
  await answerSession(c, q => q.areaKey !== 'clinica-medica');
  let st = (await c.call('GET', '/api/state')).state;
  const rev = st.reviews.find(r => r.status === 'pending' && r.topicKey === 'clinica-medica/cardiologia');
  assert.ok(rev, 'revisão criada'); assert.equal(rev.reason, 'Erros recorrentes');
  assert.ok((await s.db.query("SELECT 1 FROM reviews WHERE status = 'pending' AND topic_key = 'clinica-medica/cardiologia'")).rows.length);

  // Revisão direcionada bem-sucedida no dia seguinte → nova revisão espaçada e prioridade menor.
  s.t.now += DAY;
  const { computePriorities } = await import('../dist/adaptive-engine.js');
  const prioBefore = computePriorities(st.knowledge, st.reviews, s.t.now).find(p => p.topicKey === 'clinica-medica/cardiologia').priorityScore;
  assert.equal((await c.call('POST', '/api/sessions', { type: 'directed', topicKey: 'clinica-medica/cardiologia' })).status, 201);
  await answerSession(c, () => true);
  st = (await c.call('GET', '/api/state')).state;
  assert.equal(st.session.resolvedReviews[0].success, true);
  const prioAfter = computePriorities(st.knowledge, st.reviews, s.t.now).find(p => p.topicKey === 'clinica-medica/cardiologia').priorityScore;
  assert.ok(prioAfter < prioBefore, `${prioBefore} → ${prioAfter}`);

  // "Compreendi" não altera domínio.
  const before = st.knowledge.nodes['clinica-medica/cardiologia'].currentMastery;
  const cr = await c.call('POST', '/api/content-reviews', { questionId: 'has-01' });
  assert.equal(cr.state.knowledge.nodes['clinica-medica/cardiologia'].currentMastery, before);

  // Sair e entrar novamente: tudo persiste. Nova instância do servidor sobre o mesmo banco também.
  await c.call('POST', '/api/auth/logout', {});
  const c2 = s.client();
  assert.equal((await c2.call('POST', '/api/auth/login', { email: 'fluxo@x.com', password: 'senha-forte-123' })).status, 200);
  const again = (await c2.call('GET', '/api/state')).state;
  assert.equal(again.answers.length, 23); assert.equal(again.profile.name, 'Ana');
  assert.equal(again.reviews.length, st.reviews.length); assert.equal(again.contentReviews.length, 1);
  await s.close();
  const s3 = await startServer({ db: s.db }), c3 = s3.client();
  await c3.call('POST', '/api/auth/login', { email: 'fluxo@x.com', password: 'senha-forte-123' });
  assert.equal((await c3.call('GET', '/api/state')).state.answers.length, 23, 'reinício do servidor preserva o progresso');

  // Minha meta preserva histórico.
  const up = await c3.call('PUT', '/api/profile', { ...GOAL, hours: 20, specialty: 'Pediatria' });
  assert.equal(up.state.profile.hours, 20); assert.equal(up.state.answers.length, 23);
  await s3.close(); await s.db.close();
});

test('sessão: resposta repetida ou de aba desatualizada não duplica; retomada após recarregar', async () => {
  const s = await startServer(), c = s.client();
  await c.call('POST', '/api/auth/register', { email: 'dup@x.com', password: 'senha-forte-123' });
  await onboard(c);
  await c.call('POST', '/api/sessions', { type: 'recommended' });
  await c.call('POST', '/api/sessions/current/shown', {});
  s.t.now += 30000;
  const a = await c.call('POST', '/api/sessions/current/answers', { index: 0, choice: 0 });
  assert.equal(a.answer.responseMs, 30000);
  const b = await c.call('POST', '/api/sessions/current/answers', { index: 0, choice: 1 });
  assert.equal(b.duplicate, true);
  assert.equal((await s.db.query('SELECT count(*)::int n FROM question_attempts')).rows[0].n, 1);
  assert.equal((await c.call('POST', '/api/sessions/current/finish', {})).status, 409, 'não conclui com questões pendentes');
  const reload = (await c.call('GET', '/api/state')).state;
  assert.equal(reload.session.index, 0); assert.equal(Object.keys(reload.session.responses).length, 1);
  await s.close(); await s.db.close();
});

test('simulado: iniciar, responder, finalizar, resultado e tentativas registradas com o simulado', async () => {
  const s = await startServer(), c = s.client();
  await c.call('POST', '/api/auth/register', { email: 'sim@x.com', password: 'senha-forte-123' });
  await onboard(c);
  const st = await c.call('POST', '/api/sessions', { type: 'simulado' });
  assert.equal(st.state.session.kind, 'simulado'); assert.equal(st.state.session.mode, 'Simulado MedAI — banco inicial');
  const fin = await answerSession(c, (q, i) => i % 2 === 0);
  assert.equal(fin.state.session.done, true);
  const row = (await s.db.query("SELECT simulation_id, status FROM study_sessions WHERE kind = 'simulado'")).rows[0];
  assert.deepEqual(row, { simulation_id: 'medai-banco-inicial-01', status: 'concluída' });
  assert.equal((await s.db.query('SELECT count(*)::int n FROM question_attempts')).rows[0].n, 10);
  const sim = (await s.db.query('SELECT title, official FROM simulations')).rows[0];
  assert.equal(sim.official, false); assert.doesNotMatch(sim.title, /ENARE|oficial/i);
  await s.close(); await s.db.close();
});

test('proveniência: questões chegam com status PROVISIONAL e sem atribuição a prova; MEDICALLY_REVIEWED exige revisão humana', async () => {
  const s = await startServer(), c = s.client();
  await c.call('POST', '/api/auth/register', { email: 'prov@x.com', password: 'senha-forte-123' });
  const { questions } = await c.call('GET', '/api/questions');
  assert.equal(questions.length, 27);
  assert.ok(questions.every(q => q.provenance.validationStatus === 'PROVISIONAL' && q.provenance.examAttribution === null && q.provenance.lastVerifiedAt === null));
  await assert.rejects(() => s.db.query("UPDATE questions SET validation_status = 'MEDICALLY_REVIEWED' WHERE id = 'has-01'"), /revisão humana/);
  await s.close(); await s.db.close();
});

test('importação do navegador: v1 importada uma vez; repetida não duplica; conta com histórico recusa; JSON inválido não grava', async () => {
  const s = await startServer(), c = s.client();
  await c.call('POST', '/api/auth/register', { email: 'imp@x.com', password: 'senha-forte-123' });
  const v1 = JSON.stringify({ logged: true, profile: { name: 'Bia', exam: 'USP-SP', year: 2027, specialty: 'Pediatria', hours: 10, date: '2027-11-20' }, answers: [{ q: 0, correct: true, at: '2026-09-20T10:00:00.000Z' }, { q: 1, correct: false, at: '2026-09-20T10:01:00.000Z' }], reviews: ['Hipertensão arterial'] });
  assert.equal((await c.call('POST', '/api/import/local', { key: 'medai-v1', raw: '{quebrado' })).status, 422);
  assert.equal((await s.db.query('SELECT count(*)::int n FROM question_attempts')).rows[0].n, 0);
  const r = await c.call('POST', '/api/import/local', { key: 'medai-v1', raw: v1 });
  assert.equal(r.import.status, 'imported'); assert.equal(r.import.answers, 2); assert.equal(r.state.profile.name, 'Bia');
  const again = await c.call('POST', '/api/import/local', { key: 'medai-v1', raw: v1 });
  assert.equal(again.import.status, 'already-imported');
  assert.equal((await s.db.query('SELECT count(*)::int n FROM question_attempts')).rows[0].n, 2);
  const other = JSON.stringify({ schemaVersion: 3, profile: null, answers: [{ id: 'z', correct: true, topicKey: 'cirurgia/trauma', at: '2026-09-01T00:00:00Z', source: 'user' }] });
  assert.equal((await c.call('POST', '/api/import/local', { key: 'medai-v3', raw: other })).status, 409);
  await s.close(); await s.db.close();
});

test('reset de estudo mantém conta e Minhas residências; exportação e exclusão de conta', async () => {
  const s = await startServer(), c = s.client();
  await c.call('POST', '/api/auth/register', { email: 'lgpd@x.com', password: 'senha-forte-123' });
  await onboard(c);
  await storeCollection(s.db, { id: 'fuvest-rm-fmusp', name: 'FUVEST' }, { processes: [{ externalKey: 'rm2027', name: 'Residência Médica FMUSP 2027 — FUVEST', officialUrl: 'https://www.fuvest.br/residencia-medica/', fields: { exam_date: { ...accepted('2026-12-06', 'PROVA SERÁ REALIZADA NO dia 06 de dezembro de 2026'), sourceUrl: 'https://www.fuvest.br/e.pdf' } }, notices: [] }], complete: true }, { now: s.t.now });
  const id = (await c.call('GET', '/api/radar/processes')).items[0].id;
  const tr = await c.call('POST', '/api/radar/tracked', { processId: id, specialty: 'Cirurgia Geral' });
  assert.equal(tr.status, 201); assert.equal(tr.items[0].examDate, '2026-12-06'); assert.equal(tr.items[0].officialUrl, 'https://www.fuvest.br/residencia-medica/');
  assert.equal((await c.call('GET', '/api/radar/processes')).items[0].tracked, true);
  assert.equal((await c.call('POST', '/api/radar/tracked', { processId: 'inexistente' })).status, 404);
  assert.equal((await c.call('POST', '/api/me/reset', { confirm: 'apagar' })).status, 422);
  const rs = await c.call('POST', '/api/me/reset', { confirm: 'RESETAR' });
  assert.equal(rs.state.profile, null); assert.deepEqual(rs.state.answers, []);
  assert.equal((await c.call('GET', '/api/radar/tracked')).items.length, 1, 'Minhas residências permanecem');
  const exp = await c.call('GET', '/api/me/export');
  assert.equal(exp.account.email, 'lgpd@x.com'); assert.ok(!JSON.stringify(exp).includes('password'));
  assert.equal((await c.call('POST', '/api/me/delete', { confirm: 'EXCLUIR', password: 'errada-errada' })).status, 403);
  assert.equal((await c.call('POST', '/api/me/delete', { confirm: 'EXCLUIR', password: 'senha-forte-123' })).status, 200);
  assert.equal((await s.db.query('SELECT count(*)::int n FROM users')).rows[0].n, 0);
  assert.equal((await s.db.query('SELECT count(*)::int n FROM tracked_processes')).rows[0].n, 0);
  await s.close(); await s.db.close();
});

test('banco indisponível: API responde 503 com mensagem compreensível e sem detalhes internos', async () => {
  const real = await openDatabase('pglite:memory');
  await prepareDatabase(real, { log: () => {} });
  let down = false;
  const fail = () => { throw new DatabaseUnavailableError(new Error('ECONNREFUSED 10.0.0.1:5432')); };
  const db = { ...real, query: (...a) => down ? fail() : real.query(...a), tx: fn => down ? fail() : real.tx(fn), ping: () => down ? fail() : real.ping() };
  const s = await startServer({ db }), c = s.client();
  await c.call('POST', '/api/auth/register', { email: 'db@x.com', password: 'senha-forte-123' });
  down = true;
  const r = await c.call('GET', '/api/state');
  assert.equal(r.status, 503); assert.equal(r.code, 'DB_UNAVAILABLE'); assert.match(r.error, /indisponível/); assert.doesNotMatch(r.error, /ECONNREFUSED|10\.0\.0\.1/);
  assert.equal((await c.call('GET', '/api/health')).status, 503);
  down = false;
  assert.equal((await c.call('GET', '/api/state')).status, 200);
  await s.close(); await real.close();
});

test('arquivos estáticos: só os do frontend; cabeçalhos de segurança; nada fora de dist/', async () => {
  const s = await startServer();
  const index = await fetch(s.base + '/');
  assert.equal(index.status, 200); assert.match(index.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(s.base + '/../package.json')).status, 404);
  assert.equal((await fetch(s.base + '/server/config.mjs')).status, 404);
  assert.equal((await fetch(s.base + '/.env')).status, 404);
  await s.close(); await s.db.close();
});
