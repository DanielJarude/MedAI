import test from 'node:test';
import assert from 'node:assert/strict';
import { NOW, DAY, GOAL, withProfile, runSession } from './fixtures/profiles.mjs';
import { createInitialState, validateGoal, saveDraft, confirmProfile, updateProfile, startSession, recordAnswer, advanceSession, preparationProfile, migrateV1, migrateV2, specialtyId } from '../dist/profile-model.js';
import { createRepository, memoryStorage, KEYS } from '../dist/profile-repository.js';
import { QUESTION_BY_ID } from './fixtures/demo-data.mjs';

const plan = ids => ({ kind: 'adaptive', items: ids.map(id => ({ questionId: id, topicKey: QUESTION_BY_ID.get(id).topicKey, bucket: 'adaptive', reason: 'teste' })) });

test('novo perfil começa vazio e bloqueado até a confirmação', () => {
  const s = createInitialState(NOW);
  assert.equal(s.schemaVersion, 3);
  assert.equal(s.profile, null);
  for (const k of ['answers', 'reviews', 'studySessions', 'contentReviews']) assert.deepEqual(s[k], []);
  assert.equal(preparationProfile(s).answeredQuestions, 0);
  const partial = saveDraft(s, { name: 'Ana', exam: 'ENARE', year: 2027 }, 2);
  assert.equal(confirmProfile(partial, NOW).state.profile, null, 'sem rotina não confirma');
  assert.ok(confirmProfile(partial, NOW).errors.hours);
});

test('validação de campos, limites e datas incompatíveis', () => {
  assert.deepEqual(validateGoal(GOAL, NOW), {});
  const e = validateGoal({ name: ' ', exam: 'X', year: 2050, hours: 0, date: '2028-01-01', specialty: 'x'.repeat(81) }, NOW);
  assert.deepEqual(Object.keys(e).sort(), ['date', 'exam', 'hours', 'name', 'specialty', 'year']);
  assert.match(validateGoal({ ...GOAL, date: '2028-03-01' }, NOW).date, /2027/);
  assert.match(validateGoal({ ...GOAL, year: 2026, date: '2026-01-10' }, NOW).date, /passado/);
  assert.deepEqual(Object.keys(validateGoal({ name: '' }, NOW, 2)).sort(), ['date', 'hours'], 'cada etapa valida seus campos');
  assert.equal(specialtyId('Ainda não decidi'), null);
  assert.equal(specialtyId('Cirurgia Geral'), 'cirurgia-geral');
});

test('respostas únicas, agregados por assunto e histórico de sessão', () => {
  let s = startSession(withProfile(), plan(['has-01', 'ic-01']), 'Sessão', NOW);
  const r1 = recordAnswer(s, 0, NOW + 1000); s = r1.state;
  assert.equal(recordAnswer(s, 1, NOW + 2000).duplicate, true);
  s = advanceSession(s);
  s = recordAnswer(s, 0, NOW + 3000).state;
  const p = preparationProfile(s);
  assert.equal(p.answeredQuestions, 2);
  assert.equal(p.correct, 1);
  assert.equal(p.performanceByTopic['clinica-medica/cardiologia'].answered, 2);
  assert.equal(s.studySessions.length, 1);
  assert.deepEqual(s.studySessions[0].questionIds, ['has-01', 'ic-01']);
});

test('revisão totalmente correta resolve a pendência atual', () => {
  let s = runSession(withProfile(NOW - 2 * DAY), [['pe-01', 0], ['pe-02', 0], ['pn-01', 0]], NOW - DAY);
  const pending = s.reviews.find(r => r.status === 'pending');
  s = runSession(s, [['pe-01', 1], ['pe-02', 1], ['pn-01', 1]], NOW, { kind: 'directed', topicKey: pending.topicKey });
  assert.equal(s.reviews.find(r => r.id === pending.id).status, 'done');
  const next = s.reviews.find(r => r.status === 'pending');
  assert.ok(Date.parse(next.dueAt) > NOW + DAY, 'a próxima é apenas uma revisão programada futura');
});

test('retomada de sessão e registro de interrupção ao iniciar outra', () => {
  let s = startSession(withProfile(), plan(['has-01', 'has-02', 'has-03']), 'Sessão', NOW);
  s = advanceSession(recordAnswer(s, 0, NOW).state);
  const repo = createRepository(memoryStorage());
  repo.save(s);
  const resumed = repo.load(NOW).state;
  assert.equal(resumed.session.index, 1);
  assert.equal(Object.keys(resumed.session.responses).length, 1);
  const other = startSession(resumed, plan(['tr-01']), 'Outra', NOW + 1000);
  assert.equal(other.studySessions[0].status, 'interrompida');
  assert.equal(other.studySessions[1].status, 'em andamento');
  assert.equal(other.answers.length, 1, 'respostas da sessão interrompida permanecem');
});

test('edição da meta preserva histórico', () => {
  const s = runSession(withProfile(), [['has-01', 1], ['ic-01', 0]], NOW);
  const { state } = updateProfile(s, { ...GOAL, exam: 'USP-SP' }, NOW);
  assert.equal(state.profile.exam, 'USP-SP');
  assert.equal(state.answers.length, 2);
  assert.equal(state.profile.completedAt, s.profile.completedAt);
});

test('migração v1 → v3 sem importar métricas fictícias como ações reais', () => {
  const v1 = { logged: true, plan: 'Completo', draftName: 'Bia', profile: { name: 'Bia', exam: 'ENARE', year: 2027, hours: 14, specialty: 'Pediatria', date: '2027-10-17' }, answers: [{ q: 0, correct: false, at: '2026-09-20T10:00:00.000Z' }, { q: 1, correct: true, at: '2026-09-20T10:01:00.000Z' }, { q: 9, correct: true }], reviews: ['Hipertensão arterial', 'Tema inexistente'], session: { index: 2, responses: [1, 1, 2], mode: 'x', done: true } };
  const { state, app } = migrateV1(v1, NOW);
  assert.equal(state.answers.length, 2, 'índice inválido descartado');
  assert.equal(state.answers[0].questionId, 'has-01');
  assert.equal(state.answers[0].choice, null, 'alternativa desconhecida não é inventada');
  assert.equal(state.answers[0].source, 'user');
  assert.equal(state.profile.specialtyId, 'pediatria');
  assert.equal(state.profile.completedAt, null);
  assert.equal(state.reviews.length, 1, 'pendência importada só com erro observado');
  assert.equal(state.reviews[0].topicKey, 'clinica-medica/cardiologia');
  assert.deepEqual(state.demo.legacyReviews, ['Tema inexistente']);
  assert.equal(state.studySessions[0].status, 'concluída');
  assert.deepEqual({ logged: app.logged, plan: app.plan }, { logged: true, plan: 'Completo' });
  assert.equal(preparationProfile(state).answeredQuestions, 2, 'nenhum total fictício (1248) importado');
  // Fila v1 padrão sem erro → fica no compartimento demonstrativo
  assert.deepEqual(migrateV1({ reviews: ['Hipertensão arterial'], answers: [] }, NOW).state.reviews, []);
});

test('migração v2 → v3 conforme schema documentado', () => {
  const v2 = { schemaVersion: 2, logged: true, plan: 'Essencial', profile: { ...GOAL, specialtyId: 'cardiologia', completedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' }, onboarding: { step: 1, draft: {} }, answers: [{ id: 'x1', sessionId: 's1', questionId: 'q-desconhecida', q: 2, topicId: 'hipertensao-arterial', topic: 'Hipertensão arterial', area: 'Clínica Médica', choice: 1, correct: false, at: '2026-09-25T10:00:00.000Z', source: 'user', contentSource: 'demo' }, { id: 'x2', q: 0, topic: 'Hipertensão arterial', correct: true, at: '2026-09-25T10:01:00.000Z', source: 'demo' }], reviews: [{ topicId: 'hipertensao-arterial', topic: 'Hipertensão arterial', reason: 'Erro na sessão', createdAt: '2026-09-25T10:00:00.000Z', source: 'user' }], studySessions: [{ id: 's1', mode: 'Sessão', status: 'em andamento', startedAt: '2026-09-25T09:59:00.000Z', completedAt: null, questionIds: [], source: 'user', contentSource: 'demo' }], demo: { legacyReviews: ['Hipertensão arterial'] } };
  const { state } = migrateV2(v2, NOW);
  assert.equal(state.answers.length, 1, 'resposta source:demo não é importada');
  assert.equal(state.answers[0].questionId, 'has-03');
  assert.equal(state.answers[0].choice, 1);
  assert.equal(state.reviews[0].topicKey, 'clinica-medica/cardiologia');
  assert.equal(state.studySessions[0].status, 'interrompida');
  assert.equal(state.profile.completedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(state.meta.migratedFrom, 'medai-v2');
});

test('persistência de rascunho e perfil, mantendo backup v1', () => {
  const v1raw = JSON.stringify({ logged: true, profile: { name: 'Caio', exam: 'ENARE', year: 2027, hours: 12, date: '2027-10-17' }, answers: [] });
  const storage = memoryStorage({ [KEYS.v1]: v1raw });
  const first = createRepository(storage).load(NOW);
  assert.equal(first.status, 'migrated');
  assert.equal(first.state.profile.name, 'Caio');
  assert.equal(storage.dump()[KEYS.v1], v1raw, 'backup v1 intacto');
  assert.equal(createRepository(storage).load(NOW).status, 'ok', 'migração ocorre uma única vez');
  const repo = createRepository(memoryStorage());
  let s = saveDraft(repo.load(NOW).state, { name: 'Duda', exam: 'UNICAMP', year: 2027 }, 2);
  repo.save(s);
  assert.deepEqual(repo.load(NOW).state.onboarding, { step: 2, draft: { name: 'Duda', exam: 'UNICAMP', year: 2027 } });
});

test('dados inválidos ou armazenamento indisponível não apagam nada silenciosamente', () => {
  const storage = memoryStorage({ [KEYS.user]: '{quebrado', [KEYS.v1]: '{"answers":[]}' });
  const r = createRepository(storage).load(NOW);
  assert.equal(r.status, 'error');
  assert.equal(storage.dump()[KEYS.user], '{quebrado', 'registro original preservado');
  const newer = createRepository(memoryStorage({ [KEYS.user]: JSON.stringify({ schemaVersion: 99 }) })).load(NOW);
  assert.equal(newer.reason, 'newer');
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.equal(createRepository(blocked).load(NOW).reason, 'storage');
  const full = { getItem: () => null, setItem() { throw new Error('QuotaExceeded'); } };
  assert.equal(createRepository(full).save(createInitialState(NOW)).ok, false);
  assert.equal(createRepository(full).resetPersonalData(NOW).ok, false);
  const badLegacy = memoryStorage({ [KEYS.v1]: 'não-json' });
  assert.equal(createRepository(badLegacy).load(NOW).status, 'error');
  assert.equal(badLegacy.dump()[KEYS.user], undefined, 'nada é gravado se a cópia antiga não pôde ser lida');
});
