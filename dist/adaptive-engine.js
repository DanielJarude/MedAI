// Motor adaptativo V1: prioridade explicável, foco do dia, montagem de sessão e contexto do tutor.
// Determinístico (sem aleatoriedade) e sem IA generativa.
import { ADAPTIVE_CONFIG } from './adaptive-config.js';
import { DAY, MASTERY_STATES, TRENDS, toMs, isPersonal, nodesByLevel } from './knowledge-model.js';
import { activeReview, isDue, overdueDays, reviewStatus, REVIEW_STATUS } from './review-scheduler.js';
import { TAXONOMY } from './demo-data.js';

export const BUCKETS = Object.freeze({ review: 'Revisão', high: 'Prioridade alta', development: 'Desenvolvimento', maintenance: 'Manutenção', balanced: 'Mapeamento inicial', directed: 'Revisão direcionada', simulado: 'Simulado' });
const pct = x => Math.round(x * 100);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Fatores futuros (neutros nesta versão): funções (topicNode) => multiplicador.
 * @typedef {{ examRelevance?: (node:object)=>number, specialtyRelevance?: (node:object)=>number }} RelevanceProviders
 */
function relevanceFactor(cfg, providers, name, node) {
  if (!cfg.priority.relevance[name]?.enabled || typeof providers[name] !== 'function') return 1;
  const v = Number(providers[name](node));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

// Função central de prioridade. Retorna score 0–100, motivo principal e todos os fatores.
export function topicPriority(node, review, now, cfg = ADAPTIVE_CONFIG, { otherMean = null, providers = {} } = {}) {
  const w = cfg.priority.weights, t = toMs(now), n = node.questionsAnswered;
  const factors = {};
  factors.masteryGap = (1 - (node.currentMastery ?? cfg.mastery.priorMean)) * w.masteryGap;
  factors.recentErrors = node.recentCount ? (node.recentErrors / node.recentCount) * w.recentErrors : 0;
  factors.recurrent = node.recurrentError ? w.recurrent : 0;
  let reviewDue = null;
  if (review && isDue(review, t)) {
    const late = overdueDays(review, t);
    reviewDue = late > 0 ? 'overdue' : 'today';
    factors.review = late > 0 ? Math.min(w.overdueMax, w.reviewOverdue + late * w.overduePerDay) : w.reviewDueToday;
  } else factors.review = 0;
  const sinceDays = node.lastInteractionAt ? (t - toMs(node.lastInteractionAt)) / DAY : null;
  factors.staleness = sinceDays === null ? 0 : Math.min(1, sinceDays / cfg.priority.staleAfterDays) * w.staleness;
  factors.lowEvidence = (1 - (node.dataConfidence || 0)) * w.lowEvidence;
  factors.examRelevance = relevanceFactor(cfg, providers, 'examRelevance', node);
  factors.specialtyRelevance = relevanceFactor(cfg, providers, 'specialtyRelevance', node);
  const base = factors.masteryGap + factors.recentErrors + factors.recurrent + factors.review + factors.staleness + factors.lowEvidence;
  const priorityScore = Math.round(Math.min(100, Math.max(0, base * factors.examRelevance * factors.specialtyRelevance)));
  const L = cfg.priority.levels;
  const level = priorityScore >= L.high ? 'alta' : priorityScore >= L.medium ? 'média' : 'baixa';
  const reasons = explainReasons(node, review, reviewDue, sinceDays, otherMean, cfg);
  return { topicKey: node.key, topic: node.label, area: node.area, areaKey: node.parentKey, priorityScore, level, priorityReason: reasons[0].text, reasonCode: reasons[0].code, reasons, factors, state: node.state, reviewDue, node, review };
}

// Explicabilidade: lista ordenada de motivos compreensíveis pelo aluno.
export function explainReasons(node, review, reviewDue, sinceDays, otherMean, cfg = ADAPTIVE_CONFIG) {
  const r = [], n = node.questionsAnswered;
  if (node.recurrentError) r.push({ code: 'recurrent', label: plural(node.recurrentErrors, 'erro recente', 'erros recentes'), text: `Você errou ${node.recurrentErrors} das últimas ${node.recurrentWindow} questões deste assunto.` });
  if (reviewDue === 'overdue') r.push({ code: 'review-overdue', label: 'Revisão vencida', text: 'Esta revisão está vencida.' });
  if (reviewDue === 'today') r.push({ code: 'review-today', label: 'Revisão para hoje', text: `Revisão programada para hoje (${review.reason.toLowerCase()}).` });
  if (node.regression && !node.recurrentError) r.push({ code: 'regression', label: plural(node.recentErrors, 'erro recente', 'erros recentes'), text: `Seu desempenho era consistente, mas houve ${plural(node.recentErrors, 'erro recente', 'erros recentes')}.` });
  else if (!node.recurrentError && node.recentErrors >= 2) r.push({ code: 'recent-errors', label: plural(node.recentErrors, 'erro recente', 'erros recentes'), text: `Erros recentes neste assunto: ${node.recentErrors} das últimas ${node.recentCount} questões.` });
  if (n >= cfg.states.minAnswers && node.state === MASTERY_STATES.FRAGILE && !node.recurrentError) {
    if (otherMean !== null && node.currentMastery < otherMean - cfg.priority.belowOthersMargin) r.push({ code: 'below-others', label: 'Abaixo dos demais', text: 'Seu desempenho neste tema está abaixo dos demais.' });
    else r.push({ code: 'fragile', label: 'Domínio frágil', text: `Domínio ainda frágil: ${pct(node.correctAnswers / n)}% de acerto em ${plural(n, 'questão', 'questões')}.` });
  }
  if (n === 0) r.push({ code: 'no-data', label: 'Sem dados', text: 'Você ainda não respondeu questões deste assunto.' });
  else if (n < cfg.states.minAnswersConsistent) r.push({ code: 'low-data', label: 'Poucos dados', text: `Você respondeu apenas ${plural(n, 'questão', 'questões')} deste assunto.` });
  if (sinceDays !== null && sinceDays >= cfg.priority.staleAfterDays) r.push({ code: 'stale', label: 'Sem prática recente', text: `Sem praticar este assunto há ${Math.floor(sinceDays)} dias.` });
  if (node.trend === TRENDS.UP && !node.recurrentError) r.push({ code: 'recovering', label: 'Em recuperação', text: `Você acertou ${plural(node.consecutiveCorrect, 'questão seguida', 'questões seguidas')}; seu desempenho recente melhorou.` });
  if (node.recentError && !r.length) r.push({ code: 'isolated-error', label: 'Erro isolado', text: 'Houve um erro recente isolado; o restante do histórico está bom.' });
  if (node.state === MASTERY_STATES.CONSISTENT) r.push({ code: 'maintenance', label: 'Manutenção', text: 'Desempenho consistente; questões de manutenção mantêm o conteúdo ativo.' });
  if (!r.length) r.push({ code: 'developing', label: 'Em desenvolvimento', text: `Em desenvolvimento: ${pct(node.correctAnswers / Math.max(1, n))}% de acerto em ${plural(n, 'questão', 'questões')}.` });
  return r;
}

export function computePriorities(knowledge, reviews, now, cfg = ADAPTIVE_CONFIG, providers = {}) {
  const topics = nodesByLevel(knowledge, 'topic');
  const withData = topics.filter(t => t.questionsAnswered >= cfg.states.minAnswers && t.currentMastery !== null);
  return topics.map(node => {
    const others = withData.filter(o => o.key !== node.key);
    const otherMean = others.length ? others.reduce((s, o) => s + o.currentMastery, 0) / others.length : null;
    return topicPriority(node, activeReview(reviews || [], node.key), now, cfg, { otherMean, providers });
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.topicKey.localeCompare(b.topicKey));
}

export const personalAnswerCount = state => (state.answers || []).filter(isPersonal).length;

// Bloco "Foco de hoje" da Visão Geral.
export function todayFocus(state, knowledge, now, cfg = ADAPTIVE_CONFIG, limit = 3) {
  const answered = personalAnswerCount(state);
  if (!answered) return { ready: false, items: [], message: 'Faça sua primeira sessão para começarmos a mapear seus pontos fortes e lacunas.' };
  const items = computePriorities(knowledge, state.reviews, now, cfg).filter(p => p.reasonCode !== 'maintenance').slice(0, limit);
  return { ready: answered >= cfg.session.minAnswersForPersonalization, items, message: answered < cfg.session.minAnswersForPersonalization ? `Ainda estamos conhecendo seu desempenho (${plural(answered, 'resposta', 'respostas')}). O foco fica mais preciso a cada sessão.` : '' };
}

// Um assunto pode estar em "review" e "high" ao mesmo tempo; "development" e "maintenance" são exclusivos.
function inBucket(p, bucket, now) {
  const review = !!(p.review && isDue(p.review, now)), high = p.node.recurrentError || p.level === 'alta';
  if (bucket === 'review') return review;
  if (bucket === 'high') return high;
  if (review || high) return false;
  return bucket === (p.state === MASTERY_STATES.CONSISTENT ? 'maintenance' : 'development');
}
const bucketOf = (p, now) => ['review', 'high', 'maintenance', 'development'].find(b => inBucket(p, b, now));

// Distribui `size` entre as cotas pelo método do maior resto.
export function scaleQuotas(size, quotas) {
  const keys = Object.keys(quotas), total = keys.reduce((s, k) => s + quotas[k], 0);
  const raw = keys.map(k => ({ k, v: size * quotas[k] / total }));
  const out = Object.fromEntries(raw.map(x => [x.k, Math.floor(x.v)]));
  let left = size - Object.values(out).reduce((s, v) => s + v, 0);
  for (const x of [...raw].sort((a, b) => (b.v % 1) - (a.v % 1) || keys.indexOf(a.k) - keys.indexOf(b.k))) { if (left <= 0) break; out[x.k]++; left--; }
  return out;
}

// Ordem de questões dentro de um assunto: erros ainda não recuperados → nunca respondidas → menos recentes.
function orderQuestions(questions, answers, preferErrors) {
  const last = new Map(), lastResult = new Map();
  for (const a of answers) { const t = toMs(a.at) || 0; if (!last.has(a.questionId) || t >= last.get(a.questionId)) { last.set(a.questionId, t); lastResult.set(a.questionId, a.correct); } }
  return [...questions].sort((x, y) => {
    const ex = preferErrors && lastResult.get(x.id) === false ? 0 : 1, ey = preferErrors && lastResult.get(y.id) === false ? 0 : 1;
    if (ex !== ey) return ex - ey;
    const nx = last.has(x.id) ? 1 : 0, ny = last.has(y.id) ? 1 : 0;
    if (nx !== ny) return nx - ny;
    return (last.get(x.id) || 0) - (last.get(y.id) || 0);
  });
}

function pickRoundRobin(groups, count, chosen, perTopic, cap) {
  const picked = [];
  let progress = true;
  while (picked.length < count && progress) {
    progress = false;
    for (const g of groups) {
      if (picked.length >= count) break;
      if ((perTopic[g.topicKey] || 0) >= cap) continue;
      const q = g.queue.find(x => !chosen.has(x.id));
      if (!q) continue;
      chosen.add(q.id); perTopic[g.topicKey] = (perTopic[g.topicKey] || 0) + 1;
      picked.push({ questionId: q.id, topicKey: g.topicKey, bucket: g.bucket, reason: g.reason });
      progress = true;
    }
  }
  return picked;
}

// Sessão inicial equilibrada: alterna grandes áreas e assuntos.
export function balancedPlan(bank, answers, size) {
  const groups = [];
  const maxTopics = Math.max(...TAXONOMY.map(a => a.topics.length));
  for (let i = 0; i < maxTopics; i++) for (const a of TAXONOMY) {
    const t = a.topics[i]; if (!t) continue;
    const qs = bank.filter(q => q.topicKey === t.key);
    if (qs.length) groups.push({ topicKey: t.key, bucket: 'balanced', reason: 'Mapeamento inicial do seu desempenho.', queue: orderQuestions(qs, answers, false) });
  }
  return pickRoundRobin(groups, size, new Set(), {}, Infinity);
}

export function buildSessionPlan(state, knowledge, bank, now, { size, cfg = ADAPTIVE_CONFIG, providers = {} } = {}) {
  size = Math.min(size || cfg.session.defaultSize, bank.length);
  const answers = (state.answers || []).filter(isPersonal);
  if (answers.length < cfg.session.minAnswersForPersonalization) {
    const items = balancedPlan(bank, answers, size);
    return { personalized: false, kind: 'balanced', items, composition: { balanced: items.length }, message: 'Estamos conhecendo seu desempenho. Suas próximas sessões serão personalizadas conforme você responde questões.' };
  }
  const priorities = computePriorities(knowledge, state.reviews, now, cfg, providers);
  const quotas = scaleQuotas(size, cfg.session.quotas);
  const cap = Math.max(1, Math.ceil(size * cfg.session.maxTopicShare));
  const chosen = new Set(), perTopic = {}, items = [];
  const groupsFor = bucket => priorities.filter(p => inBucket(p, bucket, now)).map(p => ({ topicKey: p.topicKey, bucket, reason: p.priorityReason, queue: orderQuestions(bank.filter(q => q.topicKey === p.topicKey), answers, bucket === 'review' || bucket === 'high') }));
  const order = ['review', 'high', 'development', 'maintenance'];
  let carry = 0;
  for (const b of order) {
    const got = pickRoundRobin(groupsFor(b), quotas[b] + carry, chosen, perTopic, cap);
    carry = quotas[b] + carry - got.length; items.push(...got);
  }
  // Sobras: primeiro assuntos em desenvolvimento/manutenção (diversidade), depois qualquer assunto; por último, sem teto.
  const all = priorities.map(p => ({ topicKey: p.topicKey, bucket: bucketOf(p, now), reason: p.priorityReason, queue: orderQuestions(bank.filter(q => q.topicKey === p.topicKey), answers, false) }));
  const calm = all.filter(g => g.bucket === 'development' || g.bucket === 'maintenance');
  if (items.length < size) items.push(...pickRoundRobin(calm, size - items.length, chosen, perTopic, cap));
  if (items.length < size) items.push(...pickRoundRobin(all, size - items.length, chosen, perTopic, cap));
  if (items.length < size) items.push(...pickRoundRobin(all, size - items.length, chosen, perTopic, Infinity));
  const composition = {};
  for (const it of items) composition[it.bucket] = (composition[it.bucket] || 0) + 1;
  return { personalized: true, kind: 'adaptive', items, composition, priorities: priorities.slice(0, 5), message: '' };
}

export function directedPlan(state, bank, topicKey, cfg = ADAPTIVE_CONFIG) {
  const answers = (state.answers || []).filter(isPersonal);
  const queue = orderQuestions(bank.filter(q => q.topicKey === topicKey), answers, true);
  return { personalized: true, kind: 'directed', topicKey, items: queue.slice(0, cfg.session.directedSize).map(q => ({ questionId: q.id, topicKey, bucket: 'directed', reason: 'Revisão direcionada deste assunto.' })) };
}

export function simuladoPlan(state, bank, cfg = ADAPTIVE_CONFIG) {
  const items = balancedPlan(bank, (state.answers || []).filter(isPersonal), Math.min(cfg.session.simuladoSize, bank.length)).map(i => ({ ...i, bucket: 'simulado', reason: 'Distribuição equilibrada entre áreas.' }));
  return { personalized: false, kind: 'simulado', items };
}

export const masteryLabel = node => node.questionsAnswered === 0 ? 'Sem dados' : node.state === MASTERY_STATES.STARTING ? `Iniciando · ${plural(node.questionsAnswered, 'questão', 'questões')}` : `${pct(node.currentMastery)}% · ${node.state.toLowerCase()}`;
export const trendLabel = node => ({ [TRENDS.UP]: '↑ MELHORANDO', [TRENDS.STABLE]: '→ ESTÁVEL', [TRENDS.DOWN]: '↓ PRECISA DE ATENÇÃO' })[node.trend] || 'Dados insuficientes';
export { reviewStatus, REVIEW_STATUS };

/**
 * Contexto preparado para um tutor futuro. Nesta versão o tutor é DEMONSTRATIVO e nenhuma API é chamada.
 * @typedef {Object} TutorContext
 * @property {number} schemaVersion
 * @property {'demo'} provider
 * @property {{key:string,label:string,area:string,subtopic:string}} topic
 * @property {{id:string,title:string,stem:string,options:string[],correct:number}} question
 * @property {{choice:number|null,correct:boolean}|null} studentAnswer
 * @property {{value:number|null,state:string,questionsAnswered:number,recentAccuracy:number|null,trend:string}} topicMastery
 * @property {{questionId:string,title:string,at:string}[]} recentErrors
 * @property {{topic:string,reason:string,score:number}[]} mainGaps
 */
export function buildTutorContext(state, knowledge, question, studentChoice, now, questionById) {
  const node = knowledge.nodes[question.topicKey] || {};
  const errors = (state.answers || []).filter(a => isPersonal(a) && !a.correct && a.topicKey === question.topicKey).slice(-3).reverse();
  return {
    schemaVersion: 1, provider: 'demo',
    topic: { key: question.topicKey, label: question.topic, area: question.area, subtopic: question.subtopic },
    question: { id: question.id, title: question.title, stem: question.stem, options: question.options, correct: question.correct },
    studentAnswer: studentChoice === undefined || studentChoice === null ? null : { choice: studentChoice, correct: studentChoice === question.correct },
    topicMastery: { value: node.currentMastery ?? null, state: node.state || MASTERY_STATES.NONE, questionsAnswered: node.questionsAnswered || 0, recentAccuracy: node.recentAccuracy ?? null, trend: node.trend || TRENDS.NONE },
    recentErrors: errors.map(a => ({ questionId: a.questionId, title: questionById.get(a.questionId)?.title || a.questionId, at: a.at })),
    mainGaps: computePriorities(knowledge, state.reviews, now).filter(p => p.node.questionsAnswered > 0 && p.level !== 'baixa').slice(0, 3).map(p => ({ topic: p.topic, reason: p.priorityReason, score: p.priorityScore }))
  };
}
