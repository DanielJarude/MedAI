// Regras do perfil de preparação: validação, onboarding, sessões, respostas, aprendizado e migrações.
// Funções puras: recebem o estado e devolvem um novo estado. Sem DOM e sem armazenamento.
import { ADAPTIVE_CONFIG } from './adaptive-config.js';
import { QUESTION_BY_ID, LEGACY_QUESTION_IDS, TAXONOMY, slug } from './demo-data.js';
import { buildKnowledge, isPersonal, toMs } from './knowledge-model.js';
import { updateReviewsAfterAnswer, resolveReviewsAfterSession, addManualReview, startOfDay, REVIEW_REASONS } from './review-scheduler.js';

export const SCHEMA_VERSION = 3;
export const APP_CONFIG_VERSION = 1;
export const EXAMS = ['ENARE', 'USP-SP', 'UNICAMP', 'SUS-SP', 'Outra prova'];
const iso = t => new Date(toMs(t)).toISOString();

export function createInitialState(now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: null,
    onboarding: { step: 1, draft: {} },
    answers: [], reviews: [], contentReviews: [], studySessions: [], session: null,
    knowledge: buildKnowledge({ answers: [], reviews: [] }, now),
    demo: { legacyReviews: [] },
    meta: { createdAt: iso(now), migratedFrom: null, migratedAt: null }
  };
}

// Configuração da aplicação (demonstração): separada dos dados pessoais e preservada no reset.
export const createAppConfig = () => ({ schemaVersion: APP_CONFIG_VERSION, logged: false, plan: 'Essencial', ui: { topicKey: null } });

export const specialtyId = label => { const s = String(label || '').trim(); return !s || slug(s) === 'ainda-nao-decidi' ? null : slug(s); };

const STEP_FIELDS = { 1: ['name', 'exam', 'year', 'specialty'], 2: ['hours', 'date'] };
export function validateGoal(d, now = Date.now(), step = null) {
  const e = {}, fields = step ? STEP_FIELDS[step] || [] : [...STEP_FIELDS[1], ...STEP_FIELDS[2]];
  const has = f => fields.includes(f);
  const name = String(d.name ?? '').trim(), year = Number(d.year), hours = Number(d.hours);
  if (has('name') && (!name || name.length > 35)) e.name = name ? 'Use até 35 caracteres.' : 'Informe como podemos chamar você.';
  if (has('exam') && !EXAMS.includes(d.exam)) e.exam = 'Escolha uma prova-alvo.';
  if (has('year') && (!Number.isInteger(year) || year < 2026 || year > 2040)) e.year = 'Informe um ano entre 2026 e 2040.';
  if (has('specialty') && String(d.specialty ?? '').length > 80) e.specialty = 'Use até 80 caracteres.';
  if (has('hours') && (!Number.isInteger(hours) || hours < 1 || hours > 80)) e.hours = 'Informe de 1 a 80 horas por semana.';
  if (has('date')) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d.date ?? ''));
    const t = m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
    if (!m || !Number.isFinite(t)) e.date = 'Informe uma data válida.';
    else if (Number(m[1]) !== year) e.date = `A data-meta precisa estar em ${Number.isInteger(year) ? year : 'no ano da prova'}.`;
    else if (t < startOfDay(now)) e.date = 'A data-meta não pode estar no passado.';
  }
  return e;
}

const cleanGoal = d => ({ name: String(d.name).trim(), exam: d.exam, year: Number(d.year), specialty: String(d.specialty || '').trim(), specialtyId: specialtyId(d.specialty), hours: Number(d.hours), date: d.date });

export function saveDraft(state, patch, step) {
  return { ...state, onboarding: { step: step ?? state.onboarding.step, draft: { ...state.onboarding.draft, ...patch } } };
}

export function confirmProfile(state, now = Date.now()) {
  const draft = state.onboarding.draft, errors = validateGoal(draft, now);
  if (Object.keys(errors).length) return { state, errors };
  return { state: { ...state, profile: { ...cleanGoal(draft), completedAt: iso(now), updatedAt: iso(now) }, onboarding: { step: 1, draft: {} } }, errors: {} };
}

// Minha meta: altera somente o objetivo; respostas, revisões, sessões e conhecimento permanecem.
export function updateProfile(state, data, now = Date.now()) {
  const errors = validateGoal(data, now);
  if (Object.keys(errors).length) return { state, errors };
  return { state: { ...state, profile: { ...state.profile, ...cleanGoal(data), updatedAt: iso(now) } }, errors: {} };
}

export const refreshKnowledge = (state, now = Date.now(), cfg = ADAPTIVE_CONFIG) => ({ ...state, knowledge: buildKnowledge(state, now, cfg) });

// ---------- Sessões ----------
export function startSession(state, plan, mode, now = Date.now()) {
  let studySessions = state.studySessions;
  if (state.session && !state.session.done) studySessions = studySessions.map(s => s.id === state.session.id ? { ...s, status: 'interrompida', completedAt: iso(now) } : s);
  const id = `s-${toMs(now).toString(36)}-${studySessions.length + 1}`;
  const session = { id, mode, kind: plan.kind, topicKey: plan.topicKey || null, personalized: !!plan.personalized, message: plan.message || '', composition: plan.composition || null, items: plan.items, index: 0, responses: {}, shownAt: {}, startedAt: iso(now), done: false };
  const record = { id, mode, kind: plan.kind, status: 'em andamento', startedAt: iso(now), completedAt: null, questionIds: plan.items.map(i => i.questionId), source: 'user', contentSource: 'demo' };
  return { ...state, session, studySessions: [...studySessions, record] };
}

export function markShown(state, now = Date.now()) {
  const s = state.session;
  if (!s || s.done || s.shownAt[s.index]) return state;
  return { ...state, session: { ...s, shownAt: { ...s.shownAt, [s.index]: iso(now) } } };
}

export const currentItem = state => state.session ? state.session.items[state.session.index] : null;
export const currentQuestion = state => { const it = currentItem(state); return it ? QUESTION_BY_ID.get(it.questionId) : null; };
export const currentResponse = state => state.session ? state.session.responses[state.session.index] : undefined;

// Registra a resposta, atualiza o modelo de conhecimento e a fila de revisão. Clique repetido não duplica.
export function recordAnswer(state, choice, now = Date.now(), cfg = ADAPTIVE_CONFIG) {
  const s = state.session;
  if (!s || s.done || s.responses[s.index] !== undefined) return { state, duplicate: true };
  const item = currentItem(state), q = QUESTION_BY_ID.get(item.questionId);
  if (!q || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return { state, duplicate: true };
  const at = iso(now), shown = s.shownAt[s.index];
  const responseMs = shown ? Math.max(0, toMs(now) - toMs(shown)) : null;
  const attempt = state.answers.filter(a => isPersonal(a) && a.questionId === q.id).length + 1;
  const answer = {
    id: `a-${toMs(now).toString(36)}-${state.answers.length + 1}`, sessionId: s.id, mode: s.mode, bucket: item.bucket,
    questionId: q.id, areaKey: q.areaKey, area: q.area, topicKey: q.topicKey, topic: q.topic, subtopicKey: q.subtopicKey, subtopic: q.subtopic,
    choice, correctChoice: q.correct, correct: choice === q.correct, at, responseMs, attempt,
    isReview: item.bucket === 'review' || s.kind === 'directed', source: 'user', contentSource: 'demo'
  };
  let next = { ...state, answers: [...state.answers, answer], session: { ...s, responses: { ...s.responses, [s.index]: { choice, at, responseMs, answerId: answer.id } } } };
  next = refreshKnowledge(next, now, cfg);
  const { reviews, change } = updateReviewsAfterAnswer(next.reviews, answer, next.knowledge.nodes[q.topicKey], now, cfg);
  next = { ...next, reviews };
  if (change) next = refreshKnowledge(next, now, cfg);
  return { state: next, answer, reviewChange: change };
}

export function advanceSession(state) {
  const s = state.session;
  if (!s || s.responses[s.index] === undefined || s.index >= s.items.length - 1) return state;
  return { ...state, session: { ...s, index: s.index + 1 } };
}

export function finishSession(state, now = Date.now(), cfg = ADAPTIVE_CONFIG) {
  const s = state.session;
  if (!s || s.done || Object.keys(s.responses).length < s.items.length) return { state, resolved: [] };
  const ids = new Set(Object.values(s.responses).map(r => r.answerId));
  const sessionAnswers = state.answers.filter(a => ids.has(a.id));
  const { reviews, resolved } = resolveReviewsAfterSession(state.reviews, sessionAnswers, now, cfg, { directedTopicKey: s.kind === 'directed' ? s.topicKey : null, isRecurrent: k => !!state.knowledge.nodes[k]?.recurrentError, sessionStartedAt: s.startedAt });
  const next = { ...state, reviews, session: { ...s, done: true, completedAt: iso(now), resolvedReviews: resolved.map(r => ({ topic: r.review.topic, success: r.success, nextDueAt: r.next?.dueAt || null })) }, studySessions: state.studySessions.map(x => x.id === s.id ? { ...x, status: 'concluída', completedAt: iso(now) } : x) };
  return { state: refreshKnowledge(next, now, cfg), resolved };
}

// "Compreendi" marca conteúdo revisado; não altera o domínio (comprovado só por questões posteriores).
export function markContentReviewed(state, questionId, now = Date.now()) {
  const q = QUESTION_BY_ID.get(questionId);
  if (!q || state.contentReviews.some(c => c.questionId === questionId && c.sessionId === state.session?.id)) return state;
  const entry = { questionId, sessionId: state.session?.id || null, areaKey: q.areaKey, topicKey: q.topicKey, subtopicKey: q.subtopicKey, at: iso(now), source: 'user' };
  return refreshKnowledge({ ...state, contentReviews: [...state.contentReviews, entry] }, now);
}

export function saveForReview(state, questionId, now = Date.now()) {
  const q = QUESTION_BY_ID.get(questionId);
  if (!q) return { state, created: false };
  const { reviews, created } = addManualReview(state.reviews, { topicKey: q.topicKey, topic: q.topic, areaKey: q.areaKey, area: q.area }, now);
  return { state: created ? refreshKnowledge({ ...state, reviews }, now) : state, created };
}

// Visão estruturada do perfil. Totais derivados dos eventos pessoais, nunca de DEMO_INDICATORS.
export function preparationProfile(state) {
  const answers = state.answers.filter(isPersonal), correct = answers.filter(a => a.correct).length;
  const performanceByTopic = {};
  for (const a of answers) { const p = performanceByTopic[a.topicKey] ||= { topic: a.topic, area: a.area, answered: 0, correct: 0 }; p.answered++; if (a.correct) p.correct++; }
  return {
    goal: state.profile,
    studiedTopics: Object.keys(performanceByTopic),
    answeredQuestions: answers.length, correct, errors: answers.length - correct,
    accuracy: answers.length ? correct / answers.length : null,
    performanceByTopic,
    pendingReviews: state.reviews.filter(r => r.source === 'user' && r.status === 'pending'),
    sessionHistory: state.studySessions
  };
}

// ---------- Migrações ----------
const labelIndex = new Map(TAXONOMY.flatMap(a => [[slug(a.label), { a }], ...a.topics.flatMap(t => [[slug(t.label), { a, t }], ...t.subtopics.map(s => [slug(s.label), { a, t, s }])])]));
function resolveTopic(label) {
  const hit = labelIndex.get(slug(label || ''));
  if (hit?.t) return { areaKey: hit.a.key, area: hit.a.label, topicKey: hit.t.key, topic: hit.t.label, subtopicKey: hit.s?.key || null, subtopic: hit.s?.label || null };
  const k = slug(label || 'outros');
  return { areaKey: 'outros', area: 'Outros', topicKey: `outros/${k}`, topic: label || 'Outros', subtopicKey: null, subtopic: null };
}
function fromQuestion(q) { return { areaKey: q.areaKey, area: q.area, topicKey: q.topicKey, topic: q.topic, subtopicKey: q.subtopicKey, subtopic: q.subtopic }; }

function migrateProfile(p) {
  if (!p || typeof p !== 'object' || !p.name) return null;
  return { name: String(p.name).trim().slice(0, 35), exam: EXAMS.includes(p.exam) ? p.exam : 'Outra prova', year: Number(p.year) || null, specialty: String(p.specialty || ''), specialtyId: p.specialtyId !== undefined ? p.specialtyId : specialtyId(p.specialty), hours: Number(p.hours) || null, date: p.date || null, completedAt: p.completedAt || null, updatedAt: p.updatedAt || null };
}

function legacyReviewsToV3(labels, answers, now) {
  let reviews = [], legacy = [];
  for (const label of labels) {
    const t = resolveTopic(label);
    const err = answers.find(a => !a.correct && a.topicKey === t.topicKey);
    if (err && !reviews.some(r => r.topicKey === t.topicKey)) reviews.push({ id: `rv-m${reviews.length + 1}`, ...t, reason: REVIEW_REASONS.RECENT, priority: 'média', origin: 'migração', source: 'user', status: 'pending', createdAt: iso(now), dueAt: iso(now), step: 0, intervalDays: 0, completedAt: null, outcome: null, accuracy: null, history: [{ at: iso(now), event: 'migrada', detail: 'Pendência importada da versão anterior com erro observado' }] });
    else legacy.push(label);
  }
  return { reviews, legacy };
}

export function migrateV1(raw, now = Date.now()) {
  const base = createInitialState(now);
  const answers = (Array.isArray(raw.answers) ? raw.answers : []).filter(a => a && LEGACY_QUESTION_IDS[a.q]).map((a, i) => {
    const q = QUESTION_BY_ID.get(LEGACY_QUESTION_IDS[a.q]);
    return { id: `a-v1-${i + 1}`, sessionId: null, mode: null, bucket: null, questionId: q.id, ...fromQuestion(q), choice: null, correctChoice: q.correct, correct: !!a.correct, at: a.at && Number.isFinite(Date.parse(a.at)) ? a.at : null, responseMs: null, attempt: null, isReview: false, source: 'user', contentSource: 'demo', migratedFrom: 'v1' };
  });
  const { reviews, legacy } = legacyReviewsToV3(Array.isArray(raw.reviews) ? raw.reviews.filter(x => typeof x === 'string') : [], answers, now);
  const studySessions = raw.session ? [{ id: 'v1-ultima', mode: raw.session.mode || null, kind: 'legado', status: raw.session.done ? 'concluída' : 'interrompida', startedAt: null, completedAt: null, questionIds: LEGACY_QUESTION_IDS, source: 'user', contentSource: 'demo' }] : [];
  const state = { ...base, profile: migrateProfile(raw.profile), onboarding: { step: 1, draft: raw.draftName ? { name: raw.draftName } : {} }, answers, reviews, studySessions, demo: { legacyReviews: legacy }, meta: { ...base.meta, migratedFrom: 'medai-v1', migratedAt: iso(now) } };
  return { state: refreshKnowledge(state, now), app: { ...createAppConfig(), logged: !!raw.logged, plan: raw.plan || 'Essencial' } };
}

// v2 conforme ARQUITETURA.md da etapa anterior. Campos ausentes viram null; nada é inventado.
export function migrateV2(raw, now = Date.now()) {
  const base = createInitialState(now);
  const answers = (Array.isArray(raw.answers) ? raw.answers : []).filter(a => a && a.source !== 'demo').map((a, i) => {
    const q = QUESTION_BY_ID.get(a.questionId) || QUESTION_BY_ID.get(LEGACY_QUESTION_IDS[a.q]);
    const topic = q ? fromQuestion(q) : resolveTopic(a.topic);
    return { id: a.id || `a-v2-${i + 1}`, sessionId: a.sessionId ?? null, mode: null, bucket: null, questionId: q?.id || a.questionId || null, ...topic, choice: Number.isInteger(a.choice) ? a.choice : null, correctChoice: q?.correct ?? null, correct: !!a.correct, at: a.at || null, responseMs: null, attempt: null, isReview: false, source: 'user', contentSource: a.contentSource || 'demo', migratedFrom: 'v2' };
  });
  const reviews = (Array.isArray(raw.reviews) ? raw.reviews : []).filter(r => r && r.source === 'user').map((r, i) => ({ id: `rv-v2-${i + 1}`, ...resolveTopic(r.topic), reason: /erro/i.test(r.reason || '') ? REVIEW_REASONS.RECENT : REVIEW_REASONS.SAVED, priority: 'média', origin: 'migração', source: 'user', status: 'pending', createdAt: r.createdAt || iso(now), dueAt: r.createdAt || iso(now), step: 0, intervalDays: 0, completedAt: null, outcome: null, accuracy: null, history: [{ at: iso(now), event: 'migrada', detail: r.reason || 'Pendência da versão anterior' }] }))
    .filter((r, i, all) => all.findIndex(x => x.topicKey === r.topicKey) === i);
  const studySessions = (Array.isArray(raw.studySessions) ? raw.studySessions : []).map(s => ({ ...s, status: s.status === 'em andamento' || !s.completedAt ? 'interrompida' : s.status, kind: s.kind || 'legado' }));
  const draft = raw.onboarding?.draft || {};
  const state = { ...base, profile: migrateProfile(raw.profile), onboarding: { step: [1, 2, 3].includes(raw.onboarding?.step) ? raw.onboarding.step : 1, draft }, answers, reviews, studySessions, demo: { legacyReviews: [...(raw.demo?.legacyReviews || [])] }, meta: { ...base.meta, migratedFrom: 'medai-v2', migratedAt: iso(now) } };
  return { state: refreshKnowledge(state, now), app: { ...createAppConfig(), logged: raw.logged !== false, plan: raw.plan || 'Essencial' } };
}

// Garante campos de um registro v3 (inclusive gravado por versão anterior desta mesma série).
export function normalizeState(raw, now = Date.now()) {
  const base = createInitialState(now);
  const s = { ...base, ...raw, onboarding: { ...base.onboarding, ...(raw.onboarding || {}) }, demo: { ...base.demo, ...(raw.demo || {}) }, meta: { ...base.meta, ...(raw.meta || {}) } };
  for (const k of ['answers', 'reviews', 'contentReviews', 'studySessions']) if (!Array.isArray(s[k])) s[k] = [];
  return refreshKnowledge(s, now);
}
