// Revisão espaçada V1: determinística, um item ativo por assunto, intervalos em ADAPTIVE_CONFIG.reviews.
import { ADAPTIVE_CONFIG } from './adaptive-config.js';
import { DAY, toMs } from './knowledge-model.js';

export const REVIEW_REASONS = Object.freeze({ RECENT: 'Erro recente', RECURRENT: 'Erros recorrentes', FRAGILE: 'Domínio frágil', SCHEDULED: 'Revisão programada', SAVED: 'Salva por você' });
export const REVIEW_STATUS = Object.freeze({ PENDING: 'PENDENTE', TODAY: 'PARA HOJE', OVERDUE: 'ATRASADA', DONE: 'CONCLUÍDA' });

export const startOfDay = t => { const d = new Date(toMs(t)); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const endOfDay = t => startOfDay(t) + DAY - 1;
const iso = t => new Date(t).toISOString();

export function reviewStatus(r, now) {
  if (r.status === 'done') return REVIEW_STATUS.DONE;
  const due = toMs(r.dueAt);
  if (due < startOfDay(now)) return REVIEW_STATUS.OVERDUE;
  if (due <= endOfDay(now)) return REVIEW_STATUS.TODAY;
  return REVIEW_STATUS.PENDING;
}
export const isDue = (r, now) => r.status === 'pending' && toMs(r.dueAt) <= endOfDay(now);
export const overdueDays = (r, now) => Math.max(0, Math.floor((startOfDay(now) - startOfDay(r.dueAt)) / DAY));
export const activeReview = (reviews, topicKey) => reviews.find(r => r.status === 'pending' && r.source === 'user' && r.topicKey === topicKey) || null;
export const activeReviews = reviews => reviews.filter(r => r.status === 'pending' && r.source === 'user');

function makeReview(reviews, topic, { reason, priority, step, intervalDays, origin = 'motor', now, note }) {
  const t = toMs(now);
  return {
    id: `rv-${reviews.length + 1}-${t.toString(36)}`,
    topicKey: topic.topicKey, topic: topic.topic, areaKey: topic.areaKey, area: topic.area,
    reason, priority, origin, source: 'user', status: 'pending',
    createdAt: iso(t), dueAt: iso(intervalDays === 0 ? t : t + intervalDays * DAY),
    step, intervalDays, completedAt: null, outcome: null, accuracy: null,
    history: [{ at: iso(t), event: 'criada', detail: note || reason }]
  };
}

const replace = (reviews, updated) => reviews.map(r => r.id === updated.id ? updated : r);

// Chamada após cada resposta registrada. `node` são as métricas do assunto já atualizadas com essa resposta.
export function updateReviewsAfterAnswer(reviews, answer, node, now, cfg = ADAPTIVE_CONFIG) {
  const c = cfg.reviews, t = toMs(now);
  if (answer.correct) return { reviews, change: null };
  const topic = { topicKey: answer.topicKey, topic: answer.topic, areaKey: answer.areaKey, area: answer.area };
  const current = activeReview(reviews, answer.topicKey);
  if (current) {
    if (node.recurrentError && current.reason !== REVIEW_REASONS.RECURRENT) {
      const due = Math.min(toMs(current.dueAt), t + c.recurrentDueDays * DAY);
      const up = { ...current, reason: REVIEW_REASONS.RECURRENT, priority: 'alta', step: 0, intervalDays: c.recurrentDueDays, dueAt: iso(due), history: [...current.history, { at: iso(t), event: 'escalada', detail: `${node.recurrentErrors} erros nas últimas ${node.recurrentWindow} questões` }] };
      return { reviews: replace(reviews, up), change: { type: 'escalated', review: up } };
    }
    if (toMs(current.dueAt) > endOfDay(t)) {
      // Novo erro antes da data programada: recua degraus e antecipa a revisão.
      const step = Math.max(0, current.step - c.lapseStepDrop), intervalDays = c.intervalsDays[step];
      const up = { ...current, step, intervalDays, dueAt: iso(Math.min(toMs(current.dueAt), t + intervalDays * DAY)), priority: current.priority === 'baixa' ? 'média' : current.priority, history: [...current.history, { at: iso(t), event: 'antecipada', detail: `Novo erro: intervalo reduzido para ${intervalDays} dia(s)` }] };
      return { reviews: replace(reviews, up), change: { type: 'shortened', review: up } };
    }
    return { reviews, change: null };
  }
  let spec = null;
  if (node.recurrentError) spec = { reason: REVIEW_REASONS.RECURRENT, priority: 'alta', intervalDays: c.recurrentDueDays, note: `${node.recurrentErrors} erros nas últimas ${node.recurrentWindow} questões` };
  else if (node.recentErrors >= c.createOnErrorsInWindow) spec = { reason: REVIEW_REASONS.RECENT, priority: 'média', intervalDays: c.intervalsDays[0], note: `${node.recentErrors} erros nas últimas ${node.recentCount} questões` };
  else if (node.state === 'FRÁGIL') spec = { reason: REVIEW_REASONS.FRAGILE, priority: 'média', intervalDays: c.intervalsDays[0] };
  if (!spec) return { reviews, change: null }; // erro isolado: influencia prioridade, sem criar revisão
  if (spec.reason !== REVIEW_REASONS.RECURRENT && activeReviews(reviews).length >= c.maxActive) return { reviews, change: null };
  const created = makeReview(reviews, topic, { ...spec, step: 0, now: t });
  return { reviews: [...reviews, created], change: { type: 'created', review: created } };
}

// Ao concluir uma sessão: valida revisões vencidas (ou a revisão direcionada) com as respostas do assunto.
// Só revisões existentes antes do início da sessão são validadas: os erros que criam uma revisão
// não podem, na mesma sessão, também reprová-la.
export function resolveReviewsAfterSession(reviews, sessionAnswers, now, cfg = ADAPTIVE_CONFIG, { directedTopicKey = null, isRecurrent = () => false, sessionStartedAt = null } = {}) {
  const c = cfg.reviews, t = toMs(now), started = sessionStartedAt === null ? Infinity : toMs(sessionStartedAt);
  let out = reviews; const resolved = [];
  for (const r of activeReviews(reviews)) {
    if (toMs(r.createdAt) >= started) continue;
    const directed = directedTopicKey === r.topicKey;
    if (!directed && !isDue(r, t)) continue;
    const list = sessionAnswers.filter(a => a.topicKey === r.topicKey);
    if (!list.length || (!directed && list.length < c.minQuestionsToResolve)) continue;
    const accuracy = list.filter(a => a.correct).length / list.length;
    const success = accuracy >= c.successAccuracy;
    const done = { ...r, status: 'done', completedAt: iso(t), outcome: success ? 'success' : 'lapse', accuracy, history: [...r.history, { at: iso(t), event: 'concluída', detail: `${Math.round(accuracy * 100)}% em ${list.length} questão(ões)` }] };
    out = replace(out, done);
    const topic = { topicKey: r.topicKey, topic: r.topic, areaKey: r.areaKey, area: r.area };
    let next = null;
    if (success) {
      const step = r.step + 1;
      if (step < c.intervalsDays.length) next = makeReview(out, topic, { reason: REVIEW_REASONS.SCHEDULED, priority: 'baixa', step, intervalDays: c.intervalsDays[step], now: t, note: `Revisão anterior bem-sucedida; intervalo ampliado para ${c.intervalsDays[step]} dias` });
    } else {
      const step = Math.max(0, r.step - c.lapseStepDrop), recurrent = isRecurrent(r.topicKey);
      next = makeReview(out, topic, { reason: recurrent ? REVIEW_REASONS.RECURRENT : REVIEW_REASONS.RECENT, priority: recurrent ? 'alta' : 'média', step, intervalDays: recurrent ? c.recurrentDueDays : c.intervalsDays[step], now: t, note: 'Revisão com erros; intervalo reduzido' });
    }
    if (next) out = [...out, next];
    resolved.push({ review: done, next, success });
  }
  return { reviews: out, resolved };
}

export function addManualReview(reviews, topic, now) {
  if (activeReview(reviews, topic.topicKey)) return { reviews, created: false };
  const created = makeReview(reviews, topic, { reason: REVIEW_REASONS.SAVED, priority: 'média', step: 0, intervalDays: 0, origin: 'aluno', now });
  return { reviews: [...reviews, created], created: true };
}
