import test from 'node:test';
import assert from 'node:assert/strict';
import { NOW, DAY, GOAL, withProfile, runSession, profileA, profileB, profileC, profileCRecovered } from './fixtures/profiles.mjs';
import { QUESTIONS, QUESTION_BY_ID, DEMO_INDICATORS } from './fixtures/demo-data.mjs';
import { ADAPTIVE_CONFIG, mergeConfig } from '../dist/adaptive-config.js';
import { buildKnowledge, computeMetrics, MASTERY_STATES, TRENDS, errorNotebook } from '../dist/knowledge-model.js';
import { computePriorities, buildSessionPlan, todayFocus, buildTutorContext, scaleQuotas } from '../dist/adaptive-engine.js';
import { updateReviewsAfterAnswer, resolveReviewsAfterSession, reviewStatus, REVIEW_STATUS, REVIEW_REASONS } from '../dist/review-scheduler.js';
import { updateProfile, markContentReviewed, startSession, recordAnswer, preparationProfile } from '../dist/profile-model.js';
import { createRepository, memoryStorage, KEYS } from '../dist/profile-repository.js';

const CARDIO = 'clinica-medica/cardiologia', NEFRO = 'clinica-medica/nefrologia', OBST = 'ginecologia-e-obstetricia/obstetricia';
const prio = (s, key, now = NOW) => computePriorities(buildKnowledge(s, now), s.reviews, now).find(p => p.topicKey === key);
const node = (s, key, now = NOW) => buildKnowledge(s, now).nodes[key];
const active = (s, key) => s.reviews.find(r => r.topicKey === key && r.status === 'pending');
const topicCount = items => items.reduce((m, i) => (m[i.topicKey] = (m[i.topicKey] || 0) + 1, m), {});

test('A) novo usuário sem histórico → sessão equilibrada, sem personalização', () => {
  const s = profileA();
  assert.equal(s.answers.length, 0);
  const plan = buildSessionPlan(s, buildKnowledge(s, NOW), QUESTIONS, NOW);
  assert.equal(plan.personalized, false);
  assert.match(plan.message, /Estamos conhecendo seu desempenho/);
  assert.equal(plan.items.length, ADAPTIVE_CONFIG.session.defaultSize);
  const areas = new Set(plan.items.map(i => QUESTION_BY_ID.get(i.questionId).areaKey));
  assert.equal(areas.size, 5, 'todas as cinco grandes áreas aparecem');
  assert.ok(Math.max(...Object.values(topicCount(plan.items))) <= 2, 'nenhum assunto domina a sessão inicial');
  assert.equal(new Set(plan.items.map(i => i.questionId)).size, plan.items.length, 'sem questões repetidas');
  const focus = todayFocus(s, buildKnowledge(s, NOW), NOW);
  assert.equal(focus.items.length, 0);
  assert.match(focus.message, /primeira sessão/);
});

test('B) erros repetidos em Cardiologia → prioridade sobe para o topo', () => {
  const base = withProfile(NOW - 5 * DAY);
  let s = runSession(base, [['tr-01', 1], ['ep-01', 1], ['neo-01', 1], ['pe-01', 1], ['has-01', 1]], NOW - 4 * DAY);
  const before = prio(s, CARDIO).priorityScore;
  s = runSession(s, [['ic-01', 0], ['ic-02', 0], ['sca-01', 0], ['sca-02', 0]], NOW - 1 * DAY);
  const after = prio(s, CARDIO);
  assert.ok(after.priorityScore > before + 30, `${before} → ${after.priorityScore}`);
  assert.equal(after.level, 'alta');
  assert.equal(computePriorities(buildKnowledge(s, NOW), s.reviews, NOW)[0].topicKey, CARDIO);
  assert.match(after.priorityReason, /Você errou 4 das últimas 5 questões deste assunto\./);
  // Perfil B: Cardiologia e Nefrologia são as duas maiores prioridades
  const b = profileB(), top = computePriorities(buildKnowledge(b, NOW), b.reviews, NOW).slice(0, 2).map(p => p.topicKey);
  assert.deepEqual(new Set(top), new Set([CARDIO, NEFRO]));
});

test('C) melhora posterior → domínio sobe e tendência indica recuperação', () => {
  const before = node(profileC(), OBST), after = node(profileCRecovered(), OBST);
  assert.equal(before.state, MASTERY_STATES.FRAGILE);
  assert.ok(after.currentMastery > before.currentMastery + 0.25, `${before.currentMastery} → ${after.currentMastery}`);
  assert.equal(after.trend, TRENDS.UP);
  assert.notEqual(after.state, MASTERY_STATES.FRAGILE);
  assert.equal(after.recurrentError, false);
  const p = prio(profileCRecovered(), OBST);
  assert.equal(p.reasonCode, 'recovering');
  assert.ok(p.priorityScore < prio(profileC(), OBST).priorityScore);
  // Também em sequência no mesmo dia: 4 erros e depois 6 acertos consecutivos (exemplo da especificação)
  const t0 = NOW - DAY, mk = (i, c) => ({ correct: c, at: new Date(t0 + i * 60000).toISOString() });
  const m = computeMetrics([0, 1, 2, 3].map(i => mk(i, false)).concat([4, 5, 6, 7, 8, 9].map(i => mk(i, true))), NOW);
  assert.equal(m.trend, TRENDS.UP);
  assert.equal(m.recurrentError, false);
  assert.ok(m.currentMastery > 0.6);
});

test('D) erro isolado → sem revisão e sem prioridade exagerada', () => {
  let s = withProfile(NOW - 10 * DAY);
  s = runSession(s, [['has-01', 1], ['has-02', 1], ['has-03', 1], ['ic-01', 1], ['ic-02', 1]], NOW - 9 * DAY);
  s = runSession(s, [['sca-01', 1], ['sca-02', 1], ['has-01', 1], ['ic-01', 1], ['sca-01', 0]], NOW - 1 * DAY);
  const n = node(s, CARDIO), p = prio(s, CARDIO);
  assert.equal(n.recurrentError, false);
  assert.equal(active(s, CARDIO), undefined, 'um erro em 10 não cria revisão');
  assert.notEqual(p.level, 'alta');
  assert.ok(p.priorityScore < ADAPTIVE_CONFIG.priority.levels.medium, `score ${p.priorityScore}`);
});

test('E) erros recorrentes → revisão "Erros recorrentes" disponível hoje, sem duplicar', () => {
  const s = runSession(withProfile(NOW - DAY), [['lra-01', 0], ['lra-02', 0], ['drc-01', 0], ['drc-02', 1]], NOW - 2 * 3600000);
  const n = node(s, NEFRO), r = active(s, NEFRO);
  assert.equal(n.recurrentError, true);
  assert.ok(n.recurrentErrorDetectedAt);
  assert.ok(r);
  assert.equal(r.reason, REVIEW_REASONS.RECURRENT);
  assert.equal(r.priority, 'alta');
  assert.equal(reviewStatus(r, NOW), REVIEW_STATUS.TODAY);
  assert.equal(s.reviews.filter(x => x.topicKey === NEFRO && x.status === 'pending').length, 1, 'uma revisão ativa por assunto');
  // A revisão criada nesta sessão não é "reprovada" pelos próprios erros que a criaram.
  assert.equal(s.reviews.filter(x => x.topicKey === NEFRO && x.status === 'done').length, 0);
});

test('F) revisão concluída com sucesso → próximo intervalo aumenta', () => {
  let s = runSession(withProfile(NOW - 3 * DAY), [['lra-01', 0], ['lra-02', 0], ['drc-01', 0]], NOW - 2 * DAY);
  const first = active(s, NEFRO);
  s = runSession(s, [['lra-01', 1], ['lra-02', 1], ['drc-01', 1]], NOW, { kind: 'directed', topicKey: NEFRO, mode: 'Revisão direcionada' });
  const done = s.reviews.find(r => r.id === first.id), next = active(s, NEFRO);
  assert.equal(done.status, 'done');
  assert.equal(done.outcome, 'success');
  assert.equal(next.reason, REVIEW_REASONS.SCHEDULED);
  assert.ok(next.intervalDays > first.intervalDays, `${first.intervalDays} → ${next.intervalDays}`);
  // Segunda revisão bem-sucedida amplia de novo
  s = runSession(s, [['drc-02', 1], ['lra-02', 1], ['lra-01', 1]], toMs(next.dueAt) + 3600000);
  const third = active(s, NEFRO);
  assert.ok(third.intervalDays > next.intervalDays, `${next.intervalDays} → ${third.intervalDays}`);
  assert.deepEqual([first.intervalDays, next.intervalDays, third.intervalDays], [0, 3, 7]);
});

test('G) novo erro após revisão → intervalo diminui', () => {
  let s = runSession(withProfile(NOW - 20 * DAY), [['lra-01', 0], ['lra-02', 0], ['drc-01', 0]], NOW - 20 * DAY);
  s = runSession(s, [['lra-01', 1], ['lra-02', 1], ['drc-01', 1]], NOW - 19 * DAY, { kind: 'directed', topicKey: NEFRO });
  const r1 = active(s, NEFRO);
  s = runSession(s, [['drc-02', 1], ['lra-01', 1], ['lra-02', 1]], toMs(r1.dueAt) + 3600000);
  const scheduled = active(s, NEFRO);
  assert.equal(scheduled.intervalDays, 7);
  // Erro antes da data: intervalo encurta e a revisão é antecipada
  const errAt = toMs(scheduled.createdAt) + DAY;
  const s2 = runSession(s, [['drc-01', 0]], errAt);
  const shortened = active(s2, NEFRO);
  assert.ok(shortened.intervalDays < scheduled.intervalDays, `${scheduled.intervalDays} → ${shortened.intervalDays}`);
  assert.ok(toMs(shortened.dueAt) < toMs(scheduled.dueAt));
  // Revisão com erros também reduz o intervalo da próxima
  const failed = resolveReviewsAfterSession(s.reviews, [{ topicKey: NEFRO, correct: false }, { topicKey: NEFRO, correct: false }, { topicKey: NEFRO, correct: true }], toMs(scheduled.dueAt) + 3600000, ADAPTIVE_CONFIG, { sessionStartedAt: toMs(scheduled.dueAt) });
  assert.equal(failed.resolved[0].success, false);
  assert.ok(failed.resolved[0].next.intervalDays < scheduled.intervalDays);
});

test('H) revisão vencida → sobe na prioridade', () => {
  const s = runSession(withProfile(NOW - 30 * DAY), [['pe-01', 0], ['pe-02', 0], ['pn-01', 1], ['pn-02', 1], ['pe-01', 1]], NOW - 20 * DAY);
  const r = active(s, OBST);
  assert.ok(r, 'revisão criada por 2 erros recentes');
  const early = prio(s, OBST, toMs(r.dueAt) - DAY);
  const due = prio(s, OBST, NOW);
  assert.equal(reviewStatus(r, NOW), REVIEW_STATUS.OVERDUE);
  assert.equal(due.reviewDue, 'overdue');
  assert.ok(due.factors.review > 0 && early.factors.review === 0);
  assert.ok(due.priorityScore > early.priorityScore, `${early.priorityScore} → ${due.priorityScore}`);
  assert.ok(due.reasons.some(x => x.text === 'Esta revisão está vencida.'));
  const plan = buildSessionPlan(runSession(s, [['tr-01', 1], ['ep-01', 1], ['neo-01', 1]], NOW - 10 * DAY), buildKnowledge(s, NOW), QUESTIONS, NOW);
  assert.equal(plan.items[0].topicKey, OBST, 'revisões vencidas abrem a sessão');
});

test('I) assunto com apenas 1 questão correta não aparece como 100% dominado', () => {
  const s = runSession(withProfile(NOW - DAY), [['tr-01', 1]], NOW - 3600000);
  const n = node(s, 'cirurgia/trauma');
  assert.equal(n.accuracy, 1);
  assert.ok(n.currentMastery < 0.7, `domínio ${n.currentMastery}`);
  assert.equal(n.state, MASTERY_STATES.STARTING);
  assert.equal(n.trend, TRENDS.NONE);
  assert.match(prio(s, 'cirurgia/trauma').priorityReason, /apenas 1 questão/);
  // Mesmo com muitos acertos, o domínio não chega a 100%
  const many = computeMetrics(Array.from({ length: 40 }, (_, i) => ({ correct: true, at: new Date(NOW - i * 60000).toISOString() })), NOW);
  assert.ok(many.currentMastery < 1);
});

test('J) dados DEMO nunca contaminam métricas pessoais', () => {
  const s = profileA();
  const tainted = { ...s, answers: [{ questionId: 'has-01', topicKey: CARDIO, areaKey: 'clinica-medica', correct: true, at: new Date(NOW).toISOString(), source: 'demo' }], reviews: [{ topicKey: CARDIO, status: 'pending', source: 'demo', dueAt: new Date(NOW).toISOString() }] };
  const k = buildKnowledge(tainted, NOW);
  assert.equal(k.nodes[CARDIO].questionsAnswered, 0);
  assert.equal(k.nodes['clinica-medica'].questionsAnswered, 0);
  assert.equal(preparationProfile(tainted).answeredQuestions, 0);
  assert.equal(buildSessionPlan(tainted, k, QUESTIONS, NOW).personalized, false);
  assert.equal(todayFocus(tainted, k, NOW).items.length, 0);
  // Os indicadores ilustrativos existem, mas não aparecem em nenhum total pessoal
  assert.ok(DEMO_INDICATORS.totalQuestions > 0);
  const b = profileB();
  assert.equal(preparationProfile(b).answeredQuestions, b.answers.length);
  assert.notEqual(preparationProfile(b).answeredQuestions, DEMO_INDICATORS.totalQuestions + b.answers.length);
});

test('K) recarregar navegador → histórico pessoal permanece', () => {
  const storage = memoryStorage();
  const s = profileB();
  assert.ok(createRepository(storage).save(s).ok);
  const loaded = createRepository(storage).load(NOW);
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.state.answers.length, s.answers.length);
  assert.deepEqual(loaded.state.reviews, s.reviews);
  assert.deepEqual(loaded.state.profile, s.profile);
  assert.equal(loaded.state.knowledge.nodes[CARDIO].questionsAnswered, s.knowledge.nodes[CARDIO].questionsAnswered);
  assert.equal(JSON.parse(storage.dump()[KEYS.user]).schemaVersion, 3);
  assert.ok(JSON.parse(storage.dump()[KEYS.user]).knowledge.nodes[CARDIO], 'modelo de conhecimento persistido');
});

test('L) editar Minha meta → não apaga histórico acadêmico', () => {
  const s = profileB();
  const { state: edited, errors } = updateProfile(s, { ...GOAL, hours: 20, specialty: 'Pediatria' }, NOW);
  assert.deepEqual(errors, {});
  assert.equal(edited.profile.hours, 20);
  assert.equal(edited.profile.specialtyId, 'pediatria');
  for (const k of ['answers', 'reviews', 'studySessions', 'contentReviews']) assert.deepEqual(edited[k], s[k]);
  assert.deepEqual(edited.knowledge.nodes[CARDIO], s.knowledge.nodes[CARDIO]);
});

test('M) reset manual → apaga somente os dados pessoais previstos', () => {
  const legacyV1 = JSON.stringify({ logged: true, profile: { name: 'Antigo', exam: 'ENARE', year: 2027, hours: 10, date: '2027-10-17' }, answers: [{ q: 0, correct: true, at: '2026-09-01T10:00:00.000Z' }] });
  const storage = memoryStorage({ [KEYS.v1]: legacyV1, [KEYS.app]: JSON.stringify({ schemaVersion: 1, logged: true, plan: 'Completo', ui: { topicKey: null } }), 'outro-app': 'x' });
  const repo = createRepository(storage);
  assert.ok(repo.save(profileB()).ok);
  const r = repo.resetPersonalData(NOW);
  assert.ok(r.ok);
  const after = createRepository(storage).load(NOW);
  assert.equal(after.status, 'ok', 'não reimporta a cópia v1 depois do reset');
  assert.equal(after.state.profile, null);
  for (const k of ['answers', 'reviews', 'studySessions', 'contentReviews']) assert.equal(after.state[k].length, 0);
  assert.equal(after.state.knowledge.nodes[CARDIO].questionsAnswered, 0);
  assert.equal(after.app.plan, 'Completo', 'configuração da aplicação preservada');
  assert.equal(storage.dump()[KEYS.v1], legacyV1, 'cópia antiga intacta');
  assert.equal(storage.dump()['outro-app'], 'x');
});

test('"Compreendi" marca conteúdo revisado sem aumentar domínio', () => {
  let s = runSession(withProfile(NOW - DAY), [['ic-01', 0], ['ic-02', 1], ['sca-01', 0]], NOW - 3600000);
  const before = node(s, CARDIO);
  s = { ...s, session: { ...s.session, id: 'x' } };
  s = markContentReviewed(s, 'ic-01', NOW);
  const after = node(s, CARDIO);
  assert.equal(after.currentMastery, before.currentMastery);
  assert.equal(after.questionsAnswered, before.questionsAnswered);
  assert.ok(after.contentReviewedAt);
});

test('Caderno de erros preserva o erro e registra recuperação', () => {
  let s = runSession(withProfile(NOW - 3 * DAY), [['pe-01', 0], ['pe-02', 0]], NOW - 2 * DAY);
  s = runSession(s, [['pe-01', 1]], NOW - DAY);
  const nb = errorNotebook(s, QUESTION_BY_ID);
  const pe1 = nb.find(e => e.questionId === 'pe-01'), pe2 = nb.find(e => e.questionId === 'pe-02');
  assert.equal(pe1.errorCount, 1);
  assert.ok(pe1.recoveredAt, 'acerto posterior registra recuperação');
  assert.equal(pe2.recoveredAt, null);
  assert.equal(pe1.topicErrorCount, 2);
  assert.equal(pe1.lastChoice, (QUESTION_BY_ID.get('pe-01').correct + 1) % 4);
  assert.equal(pe1.correctChoice, QUESTION_BY_ID.get('pe-01').correct);
});

test('Sessão personalizada: ordem por cotas, diversidade mínima e explicação', () => {
  const s = profileB(), plan = buildSessionPlan(s, buildKnowledge(s, NOW), QUESTIONS, NOW);
  assert.equal(plan.personalized, true);
  assert.equal(plan.items.length, 10);
  const counts = topicCount(plan.items);
  assert.ok(Object.keys(counts).length >= 4, 'pelo menos 4 assuntos');
  assert.ok(Math.max(...Object.values(counts)) <= Math.ceil(10 * ADAPTIVE_CONFIG.session.maxTopicShare));
  assert.equal(plan.items[0].bucket, 'review');
  assert.ok((counts[CARDIO] || 0) + (counts[NEFRO] || 0) >= 6, 'prioridades altas ocupam a maior parte');
  assert.ok(plan.items.every(i => i.reason && i.reason.length > 10));
  assert.deepEqual(scaleQuotas(30, ADAPTIVE_CONFIG.session.quotas), { review: 8, high: 12, development: 6, maintenance: 4 });
  // Determinístico
  assert.deepEqual(buildSessionPlan(s, buildKnowledge(s, NOW), QUESTIONS, NOW).items, plan.items);
});

test('Explicabilidade: mensagens compreensíveis para cada situação', () => {
  const b = profileB(), k = buildKnowledge(b, NOW);
  const ps = computePriorities(k, b.reviews, NOW);
  assert.match(ps.find(p => p.topicKey === NEFRO).priorityReason, /Você errou 3 das últimas 5/);
  assert.match(ps.find(p => p.topicKey === 'cirurgia/abdome-agudo').priorityReason, /Você respondeu apenas 2 questões/);
  // Regressão de assunto antes consistente
  let s = runSession(withProfile(NOW - 10 * DAY), [['has-01', 1], ['has-02', 1], ['has-03', 1], ['ic-01', 1], ['ic-02', 1], ['sca-01', 1], ['sca-02', 1]], NOW - 9 * DAY);
  s = runSession(s, [['has-01', 1], ['ic-01', 0], ['has-02', 1], ['sca-02', 0], ['has-03', 1]], NOW - DAY);
  assert.ok(prio(s, CARDIO).reasons.some(r => /era consistente, mas houve 2 erros recentes/.test(r.text)));
});

test('Pesos centralizados: alterar a configuração muda o resultado sem alterar o código', () => {
  const s = profileB(), k = buildKnowledge(s, NOW);
  const def = computePriorities(k, s.reviews, NOW).find(p => p.topicKey === 'cirurgia/abdome-agudo');
  const cfg = mergeConfig({ priority: { weights: { lowEvidence: 40 } } });
  const alt = computePriorities(k, s.reviews, NOW, cfg).find(p => p.topicKey === 'cirurgia/abdome-agudo');
  assert.ok(alt.priorityScore > def.priorityScore);
  // Fatores futuros desativados: providers são ignorados
  const withProvider = computePriorities(k, s.reviews, NOW, ADAPTIVE_CONFIG, { examRelevance: () => 3 }).find(p => p.topicKey === 'cirurgia/abdome-agudo');
  assert.equal(withProvider.factors.examRelevance, 1);
  assert.equal(withProvider.priorityScore, def.priorityScore);
  const enabled = mergeConfig({ priority: { relevance: { examRelevance: { enabled: true } } } });
  assert.equal(computePriorities(k, s.reviews, NOW, enabled, { examRelevance: () => 1.5 }).find(p => p.topicKey === 'cirurgia/abdome-agudo').factors.examRelevance, 1.5);
});

test('Contexto do tutor preparado sem IA real', () => {
  const s = profileB(), q = QUESTION_BY_ID.get('ic-01');
  const ctx = buildTutorContext(s, buildKnowledge(s, NOW), q, 0, NOW, QUESTION_BY_ID);
  assert.equal(ctx.provider, 'demo');
  assert.equal(ctx.topic.key, CARDIO);
  assert.equal(ctx.studentAnswer.correct, false);
  assert.ok(ctx.recentErrors.length > 0);
  assert.ok(ctx.mainGaps.some(g => g.topic === 'Cardiologia'));
});

test('Registro completo de cada resposta', () => {
  let s = startSession(withProfile(), { kind: 'adaptive', items: [{ questionId: 'pe-02', topicKey: OBST, bucket: 'review', reason: 'x' }] }, 'Sessão', NOW);
  s = { ...s, session: { ...s.session, shownAt: { 0: new Date(NOW).toISOString() } } };
  const { state, answer } = recordAnswer(s, 1, NOW + 42000);
  assert.deepEqual({ q: answer.questionId, t: answer.topic, sub: answer.subtopic, c: answer.choice, cc: answer.correctChoice, ok: answer.correct, ms: answer.responseMs, at: answer.attempt, rev: answer.isReview, src: answer.source, cs: answer.contentSource, sid: answer.sessionId },
    { q: 'pe-02', t: 'Obstetrícia', sub: 'Pré-eclâmpsia', c: 1, cc: 2, ok: false, ms: 42000, at: 1, rev: true, src: 'user', cs: 'demo', sid: s.session.id });
  assert.ok(answer.at);
  assert.equal(recordAnswer(state, 2, NOW + 50000).duplicate, true, 'clique repetido não duplica');
});

const toMs = x => Date.parse(x);
