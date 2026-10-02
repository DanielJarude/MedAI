// Modelo de conhecimento do aluno: métricas por grande área, assunto e subassunto.
// Funções puras, sem DOM nem armazenamento. Derivado apenas de respostas source:'user'.
import { ADAPTIVE_CONFIG } from './adaptive-config.js';
import { TAXONOMY } from './taxonomy.js';

export const DAY = 86400000;
export const MASTERY_STATES = Object.freeze({ NONE: 'SEM DADOS', STARTING: 'INICIANDO', FRAGILE: 'FRÁGIL', DEVELOPING: 'EM DESENVOLVIMENTO', CONSISTENT: 'CONSISTENTE' });
export const TRENDS = Object.freeze({ UP: 'MELHORANDO', STABLE: 'ESTÁVEL', DOWN: 'PRECISA DE ATENÇÃO', NONE: 'DADOS INSUFICIENTES' });

export const toMs = x => typeof x === 'number' ? x : x instanceof Date ? x.getTime() : Date.parse(x);
export const isPersonal = a => a && a.source === 'user';
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const ratio = (list) => list.length ? list.filter(a => a.correct).length / list.length : null;

// Recorrência avaliada no instante `t`, sobre as respostas até o índice `i` (ordem cronológica).
function recurrenceAt(list, i, t, cfg) {
  const { window, minErrors, maxAgeDays } = cfg.recurrence;
  const slice = list.slice(Math.max(0, i - window + 1), i + 1).filter(a => t - a.t <= maxAgeDays * DAY);
  const errors = slice.filter(a => !a.correct).length;
  return { errors, considered: slice.length, recurrent: errors >= minErrors };
}

export function masteryFromAnswers(list, now, cfg = ADAPTIVE_CONFIG, { successfulReviews = 0, recurrent = false } = {}) {
  const m = cfg.mastery;
  if (!list.length) return { mastery: null, evidence: 0, confidence: 0, weightedAccuracy: null };
  let sw = 0, swc = 0;
  for (let k = 0; k < list.length; k++) {
    const a = list[list.length - 1 - k];
    const ageDays = Math.max(0, (now - a.t) / DAY);
    const w = Math.pow(0.5, ageDays / m.halfLifeDays) * Math.pow(m.sequenceDecay, k);
    sw += w; swc += w * (a.correct ? 1 : 0);
  }
  const weightedAccuracy = (swc + m.priorMean * m.priorWeight) / (sw + m.priorWeight);
  const bonus = Math.min(m.reviewBonusMax, successfulReviews * m.reviewBonusPerSuccess);
  const mastery = clamp(weightedAccuracy + bonus - (recurrent ? m.recurrentPenalty : 0));
  return { mastery, evidence: sw, confidence: sw / (sw + m.confidenceK), weightedAccuracy };
}

export function masteryState(n, mastery, recurrent, cfg = ADAPTIVE_CONFIG) {
  const s = cfg.states;
  if (!n) return MASTERY_STATES.NONE;
  if (n < s.minAnswers) return MASTERY_STATES.STARTING;
  if (recurrent || mastery < s.fragileBelow) return MASTERY_STATES.FRAGILE;
  if (mastery >= s.consistentFrom && n >= s.minAnswersConsistent) return MASTERY_STATES.CONSISTENT;
  return MASTERY_STATES.DEVELOPING;
}

export function trendFrom(list, cfg = ADAPTIVE_CONFIG) {
  const { window } = cfg.recent, t = cfg.trend;
  const recent = list.slice(-window), previous = list.slice(-(window + t.previousWindow), -window);
  if (list.length < t.minAnswers || previous.length < t.minPrevious) return { trend: TRENDS.NONE, delta: null };
  const delta = ratio(recent) - ratio(previous);
  return { trend: delta >= t.threshold ? TRENDS.UP : delta <= -t.threshold ? TRENDS.DOWN : TRENDS.STABLE, delta };
}

// Métricas de um nó a partir das respostas pessoais (qualquer ordem) e das revisões do nó.
export function computeMetrics(answers, now, cfg = ADAPTIVE_CONFIG, { reviews = [], contentReviews = [] } = {}) {
  const list = answers.map(a => ({ ...a, t: toMs(a.at) })).filter(a => Number.isFinite(a.t)).sort((x, y) => x.t - y.t);
  const undated = answers.length - list.length; // respostas migradas sem horário: contam no total, não na recência
  const n = answers.length, correct = answers.filter(a => a.correct).length;
  const last = list[list.length - 1];
  const done = reviews.filter(r => r.status === 'done');
  const successfulReviews = done.filter(r => r.outcome === 'success').length;
  const active = reviews.find(r => r.status === 'pending');
  let consecutiveCorrect = 0, consecutiveIncorrect = 0;
  for (let i = list.length - 1; i >= 0 && list[i].correct === list[list.length - 1].correct; i--) list[i].correct ? consecutiveCorrect++ : consecutiveIncorrect++;
  const rec = list.length ? recurrenceAt(list, list.length - 1, now, cfg) : { errors: 0, considered: 0, recurrent: false };
  let recurrentErrorDetectedAt = null;
  if (rec.recurrent) {
    let i = list.length - 1;
    while (i > 0 && recurrenceAt(list, i - 1, list[i - 1].t, cfg).recurrent) i--;
    recurrentErrorDetectedAt = new Date(list[i].t).toISOString();
  }
  const recentList = list.slice(-cfg.recent.window);
  const recentErrors = recentList.filter(a => !a.correct).length;
  const { mastery, confidence, evidence, weightedAccuracy } = masteryFromAnswers(list, now, cfg, { successfulReviews, recurrent: rec.recurrent });
  // Respostas sem horário (v1) entram na contagem, mas não sustentam domínio sozinhas.
  const effectiveMastery = list.length ? mastery : (n ? masteryFromAnswers(answers.map(a => ({ ...a, t: now - 365 * DAY })), now, cfg).mastery : null);
  const { trend, delta } = trendFrom(list, cfg);
  const previous = list.slice(-(cfg.recent.window + cfg.trend.previousWindow), -cfg.recent.window);
  const previousAccuracy = ratio(previous);
  const iso = x => x ? new Date(x.t).toISOString() : null;
  const lastWith = flag => { for (let i = list.length - 1; i >= 0; i--) if (list[i].correct === flag) return list[i]; return null; };
  const lastContent = contentReviews.map(c => toMs(c.at)).filter(Number.isFinite).sort((x, y) => y - x)[0];
  return {
    questionsAnswered: n,
    correctAnswers: correct,
    incorrectAnswers: n - correct,
    accuracy: n ? correct / n : null,
    recentAccuracy: ratio(recentList),
    recentCount: recentList.length,
    recentErrors,
    previousAccuracy,
    weightedAccuracy,
    currentMastery: effectiveMastery,
    dataConfidence: confidence,
    evidence,
    undatedAnswers: undated,
    state: masteryState(n, effectiveMastery ?? 0, rec.recurrent, cfg),
    trend, trendDelta: delta,
    recurrentError: rec.recurrent,
    recurrentErrors: rec.errors,
    recurrentWindow: rec.considered,
    recurrentErrorDetectedAt,
    // Era consistente (janela anterior) e voltou a errar na janela recente.
    regression: previousAccuracy !== null && previousAccuracy >= cfg.states.consistentFrom && recentErrors >= 2,
    recentError: !!last && !last.correct && now - last.t <= cfg.recent.recentErrorDays * DAY,
    lastInteractionAt: iso(last),
    lastCorrectAt: iso(lastWith(true)),
    lastIncorrectAt: iso(lastWith(false)),
    consecutiveCorrect, consecutiveIncorrect,
    reviewCount: done.length,
    successfulReviews,
    nextReviewAt: active ? active.dueAt : null,
    contentReviewedAt: lastContent ? new Date(lastContent).toISOString() : null
  };
}

// Constrói o mapa completo (todas as áreas/assuntos/subassuntos da taxonomia + os que vierem das respostas).
export function buildKnowledge(state, now = Date.now(), cfg = ADAPTIVE_CONFIG) {
  now = toMs(now);
  const answers = (state.answers || []).filter(isPersonal);
  const reviews = (state.reviews || []).filter(r => r.source === 'user');
  const contentReviews = state.contentReviews || [];
  const nodes = {};
  const add = (key, level, label, parentKey, extra = {}) => { if (!nodes[key]) nodes[key] = { key, level, label, parentKey, ...extra }; };
  for (const a of TAXONOMY) {
    add(a.key, 'area', a.label, null);
    for (const t of a.topics) {
      add(t.key, 'topic', t.label, a.key, { area: a.label });
      for (const s of t.subtopics) add(s.key, 'subtopic', s.label, t.key, { area: a.label, topic: t.label });
    }
  }
  for (const x of answers) {
    if (x.areaKey) add(x.areaKey, 'area', x.area || x.areaKey, null);
    if (x.topicKey) add(x.topicKey, 'topic', x.topic || x.topicKey, x.areaKey, { area: x.area });
    if (x.subtopicKey) add(x.subtopicKey, 'subtopic', x.subtopic || x.subtopicKey, x.topicKey, { area: x.area, topic: x.topic });
  }
  for (const node of Object.values(nodes)) {
    const match = node.level === 'subtopic' ? (i => i.subtopicKey === node.key) : node.level === 'topic' ? (i => i.topicKey === node.key) : (i => i.areaKey === node.key || (i.topicKey || '').startsWith(node.key + '/'));
    const nodeReviews = node.level === 'subtopic' ? [] : reviews.filter(match);
    Object.assign(node, computeMetrics(answers.filter(match), now, cfg, { reviews: nodeReviews, contentReviews: contentReviews.filter(match) }));
  }
  return { modelVersion: cfg.modelVersion, computedAt: new Date(now).toISOString(), nodes };
}

export const nodesByLevel = (knowledge, level) => Object.values(knowledge.nodes).filter(n => n.level === level);
export const childrenOf = (knowledge, key) => Object.values(knowledge.nodes).filter(n => n.parentKey === key);

// Caderno de erros: uma entrada por questão errada, preservando o histórico e registrando recuperação.
export function errorNotebook(state, questionById) {
  const answers = (state.answers || []).filter(isPersonal).map(a => ({ ...a, t: toMs(a.at) || 0 })).sort((x, y) => x.t - y.t);
  const byQuestion = new Map();
  for (const a of answers) {
    if (!a.questionId) continue;
    const e = byQuestion.get(a.questionId) || { questionId: a.questionId, attempts: [], errors: [] };
    e.attempts.push(a);
    if (!a.correct) e.errors.push(a);
    byQuestion.set(a.questionId, e);
  }
  const topicErrors = {};
  for (const a of answers) if (!a.correct) topicErrors[a.topicKey] = (topicErrors[a.topicKey] || 0) + 1;
  return [...byQuestion.values()].filter(e => e.errors.length).map(e => {
    const lastError = e.errors[e.errors.length - 1];
    const recovery = e.attempts.find(a => a.correct && a.t > lastError.t);
    const q = questionById.get(e.questionId);
    return {
      questionId: e.questionId, question: q || null,
      title: q?.title || lastError.title || e.questionId,
      area: lastError.area, topic: lastError.topic, topicKey: lastError.topicKey, subtopic: lastError.subtopic,
      firstErrorAt: e.errors[0].at, lastErrorAt: lastError.at,
      errorCount: e.errors.length,
      lastChoice: lastError.choice, correctChoice: q ? q.correct : lastError.correctChoice ?? null,
      topicErrorCount: topicErrors[lastError.topicKey] || 0,
      recoveredAt: recovery ? recovery.at : null
    };
  }).sort((x, y) => toMs(y.lastErrorAt || 0) - toMs(x.lastErrorAt || 0));
}
