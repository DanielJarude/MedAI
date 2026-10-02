// Comandos de estudo executados no servidor com as mesmas funções puras do motor adaptativo.
// Cada comando: trava o perfil do usuário → carrega o estado do banco → aplica o motor → grava as diferenças.
import { QUESTIONS, QUESTION_BY_ID, loadQuestionBank } from '../../dist/question-bank.js';
import { saveDraft, confirmProfile, updateProfile, startSession, markShown, recordAnswer, advanceSession, finishSession, markContentReviewed, saveForReview, migrateV1, migrateV2, normalizeState, SCHEMA_VERSION } from '../../dist/profile-model.js';
import { buildSessionPlan, directedPlan, simuladoPlan } from '../../dist/adaptive-engine.js';
import { loadState, saveState, resetStudyData } from '../repositories/state-repository.mjs';
import { HttpError } from '../http/http-utils.mjs';
import { INITIAL_SIMULATION_ID } from '../db/seed/production.mjs';
import { createHash } from 'node:crypto';

const DRAFT_FIELDS = { name: 35, exam: 40, year: 4, specialty: 80, hours: 2, date: 10 };

// Carrega as questões ativas (com proveniência) do banco para o registro usado pelo motor.
export async function loadQuestionsFromDb(db) {
  const rows = (await db.query(`SELECT q.*, a.label AS area, t.label AS topic, s.label AS subtopic,
      src.source_type, src.source_name, src.source_url, src.source_date, src.exam_attribution, src.notes AS source_notes
    FROM questions q JOIN topics a ON a.key = q.area_key JOIN topics t ON t.key = q.topic_key LEFT JOIN topics s ON s.key = q.subtopic_key
    JOIN question_sources src ON src.id = q.source_id WHERE q.active ORDER BY q.position, q.id`)).rows;
  const list = rows.map(r => ({
    id: r.id, areaKey: r.area_key, area: r.area, topicKey: r.topic_key, topic: r.topic, subtopicKey: r.subtopic_key, subtopic: r.subtopic,
    title: r.title, stem: r.stem, options: r.options, correct: r.correct_index, explain: r.explanation, analysis: r.analysis, key: r.key_point,
    ref: r.question_references?.[0]?.url || null,
    provenance: {
      sourceType: r.source_type, sourceName: r.source_name, sourceUrl: r.source_url, sourceDate: r.source_date, examAttribution: r.exam_attribution,
      lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at).toISOString() : null, validationStatus: r.validation_status,
      references: r.question_references || [], notes: r.source_notes
    }
  }));
  loadQuestionBank(list);
  return list.length;
}

export function createStudyService(db, { clock = () => Date.now() } = {}) {
  const locks = new Map();
  // Serializa comandos do mesmo usuário neste processo; FOR UPDATE protege entre processos.
  async function withUserLock(userId, fn) {
    const prev = locks.get(userId) || Promise.resolve();
    let release;
    const next = new Promise(r => { release = r; });
    locks.set(userId, prev.then(() => next));
    await prev;
    try { return await fn(); } finally { release(); if (locks.get(userId) === next || locks.size > 5000) locks.delete(userId); }
  }

  async function mutate(userId, fn) {
    return withUserLock(userId, () => db.tx(async tx => {
      await tx.query('SELECT 1 FROM student_profiles WHERE user_id = $1 FOR UPDATE', [userId]);
      const now = clock();
      const loaded = await loadState(tx, userId, now);
      if (!loaded) throw new HttpError(404, 'Perfil não encontrado.');
      const out = await fn(loaded.state, now, loaded) || {};
      const next = out.state || loaded.state;
      if (next !== loaded.state) await saveState(tx, userId, loaded.state, next, loaded.storedKnowledge);
      return { ...out, state: next };
    }));
  }

  const requireSession = state => { if (!state.session || state.session.done) throw new HttpError(409, 'Não há sessão em andamento.'); };

  return {
    async getState(userId) { const l = await loadState(db, userId, clock()); if (!l) throw new HttpError(404, 'Perfil não encontrado.'); return l; },

    saveDraft: (userId, { step, draft }) => mutate(userId, state => {
      if (state.profile) throw new HttpError(409, 'O perfil já foi criado. Use Minha meta para alterar o objetivo.');
      const clean = {};
      for (const [k, max] of Object.entries(DRAFT_FIELDS)) if (draft && draft[k] !== undefined && draft[k] !== null) clean[k] = typeof draft[k] === 'number' ? draft[k] : String(draft[k]).slice(0, max);
      const s = Number(step);
      return { state: saveDraft(state, clean, [1, 2, 3].includes(s) ? s : state.onboarding.step) };
    }),

    confirmProfile: userId => mutate(userId, (state, now) => {
      if (state.profile) return { state };
      const r = confirmProfile(state, now);
      if (Object.keys(r.errors).length) throw new HttpError(422, 'Revise os dados da sua meta.', { errors: r.errors });
      return { state: r.state };
    }),

    updateProfile: (userId, data) => mutate(userId, (state, now) => {
      if (!state.profile) throw new HttpError(409, 'Conclua a configuração inicial primeiro.');
      const r = updateProfile(state, data || {}, now);
      if (Object.keys(r.errors).length) throw new HttpError(422, 'Revise os dados da sua meta.', { errors: r.errors });
      return { state: r.state };
    }),

    startSession: (userId, { type, topicKey }) => mutate(userId, (state, now) => {
      if (!state.profile) throw new HttpError(409, 'Conclua a configuração inicial primeiro.');
      if (!QUESTIONS.length) throw new HttpError(503, 'O banco de questões não está disponível no momento.');
      let plan, mode;
      if (type === 'directed') {
        plan = directedPlan(state, QUESTIONS, String(topicKey || ''));
        if (!plan.items.length) throw new HttpError(422, 'Ainda não há questões deste assunto no banco.');
        mode = `Revisão direcionada · ${state.knowledge.nodes[plan.topicKey]?.label || plan.topicKey}`;
      } else if (type === 'simulado') {
        plan = simuladoPlan(state, QUESTIONS); mode = 'Simulado MedAI — banco inicial';
      } else {
        plan = buildSessionPlan(state, state.knowledge, QUESTIONS, now);
        mode = plan.personalized ? 'Sessão personalizada' : 'Sessão inicial equilibrada';
      }
      let next = startSession(state, plan, mode, now);
      if (plan.kind === 'simulado') {
        const id = next.session.id;
        next = { ...next, session: { ...next.session, simulationId: INITIAL_SIMULATION_ID }, studySessions: next.studySessions.map(s => s.id === id ? { ...s, simulationId: INITIAL_SIMULATION_ID } : s) };
      }
      return { state: next };
    }),

    markShown: userId => mutate(userId, (state, now) => { requireSession(state); return { state: markShown(state, now) }; }),

    answer: (userId, { index, choice }) => mutate(userId, (state, now) => {
      requireSession(state);
      if (Number(index) !== state.session.index) return { state, duplicate: true }; // aba desatualizada ou clique repetido
      const r = recordAnswer(state, Number(choice), now);
      if (r.duplicate) return { state, duplicate: true };
      return { state: r.state, answer: r.answer, reviewChange: r.reviewChange ? { type: r.reviewChange.type, reason: r.reviewChange.review.reason, detail: r.reviewChange.review.history.at(-1)?.detail || null } : null };
    }),

    advance: (userId, { index }) => mutate(userId, state => {
      requireSession(state);
      if (Number(index) !== state.session.index) return { state };
      return { state: advanceSession(state) };
    }),

    finish: userId => mutate(userId, (state, now) => {
      requireSession(state);
      const r = finishSession(state, now);
      if (r.state === state) throw new HttpError(409, 'Responda todas as questões antes de concluir.');
      return { state: r.state };
    }),

    contentReviewed: (userId, { questionId }) => mutate(userId, (state, now) => {
      if (!QUESTION_BY_ID.has(questionId)) throw new HttpError(404, 'Questão não encontrada.');
      return { state: markContentReviewed(state, questionId, now) };
    }),

    saveForReview: (userId, { questionId }) => mutate(userId, (state, now) => {
      if (!QUESTION_BY_ID.has(questionId)) throw new HttpError(404, 'Questão não encontrada.');
      const r = saveForReview(state, questionId, now);
      return { state: r.state, created: r.created };
    }),

    reset: userId => withUserLock(userId, () => db.tx(async tx => { await resetStudyData(tx, userId, clock()); })),

    // Importação do progresso salvo no navegador (localStorage). Nunca apaga o dado local.
    importLocal: (userId, { key, raw }) => mutate(userId, (state, now, loaded) => {
      const fingerprint = createHash('sha256').update(String(raw)).digest('hex');
      if (loaded.localImport?.fingerprint === fingerprint) return { state, import: { status: 'already-imported', importedAt: loaded.localImport.importedAt } };
      if (state.answers.length || state.studySessions.length) throw new HttpError(409, 'Sua conta já tem histórico de estudo. Para evitar duplicação, a importação automática só é feita em contas sem histórico. Os dados deste navegador continuam intactos.');
      const local = parseLocal(key, raw, now);
      let merged = { ...local, onboarding: local.profile ? { step: 1, draft: {} } : local.onboarding, meta: { ...local.meta, importedFromBrowserAt: new Date(now).toISOString(), browserKey: key } };
      if (state.profile && local.profile) merged = { ...merged, profile: state.profile }; // a meta da conta prevalece
      if (state.profile && !local.profile) merged = { ...merged, profile: state.profile, onboarding: state.onboarding };
      // Uma sessão local em andamento é registrada como interrompida (a execução não é retomada no servidor).
      if (merged.session && !merged.session.done) merged = { ...merged, studySessions: merged.studySessions.map(s => s.id === merged.session.id ? { ...s, status: 'interrompida', completedAt: s.completedAt || new Date(now).toISOString() } : s), session: null };
      else merged = { ...merged, session: null };
      merged = normalizeState(merged, now);
      return { state: merged, import: { status: 'imported', fingerprint, answers: merged.answers.length, reviews: merged.reviews.length, sessions: merged.studySessions.length, profile: !!local.profile }, localImport: { fingerprint, importedAt: new Date(now).toISOString(), key } };
    }).then(async out => {
      if (out.localImport) await db.query('UPDATE student_profiles SET local_import = $2 WHERE user_id = $1', [userId, JSON.stringify(out.localImport)]);
      return out;
    }),

    async exportData(userId) {
      const { state } = await this.getState(userId);
      const user = (await db.query('SELECT email, created_at, last_login_at FROM users WHERE id = $1', [userId])).rows[0];
      const tracked = (await db.query('SELECT process_id, specialty, created_at FROM tracked_processes WHERE user_id = $1', [userId])).rows;
      const { knowledge, ...events } = state;
      return { exportedAt: new Date(clock()).toISOString(), account: user, study: events, trackedProcesses: tracked };
    }
  };
}

// ---------- Importação: validação defensiva do JSON vindo do navegador ----------
const str = (v, max = 200) => typeof v === 'string' ? v.slice(0, max) : null;
const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null;
const int = v => Number.isInteger(v) ? v : null;

function sanitizeAnswers(list) {
  return (Array.isArray(list) ? list : []).slice(0, 20000).filter(a => a && typeof a === 'object' && typeof a.correct === 'boolean').map((a, i) => ({
    id: str(a.id, 80) || `a-imp-${i + 1}`, sessionId: str(a.sessionId, 80), mode: str(a.mode, 80), bucket: str(a.bucket, 40),
    questionId: str(a.questionId, 80), areaKey: str(a.areaKey, 120), area: str(a.area, 120), topicKey: str(a.topicKey, 160), topic: str(a.topic, 120),
    subtopicKey: str(a.subtopicKey, 200), subtopic: str(a.subtopic, 120), choice: int(a.choice), correctChoice: int(a.correctChoice), correct: a.correct,
    at: date(a.at), responseMs: Number.isFinite(a.responseMs) && a.responseMs >= 0 ? Math.round(a.responseMs) : null, attempt: int(a.attempt), isReview: !!a.isReview,
    source: a.source === 'user' ? 'user' : 'demo', contentSource: str(a.contentSource, 40) || 'demo', ...(a.migratedFrom ? { migratedFrom: str(a.migratedFrom, 10) } : {})
  })).filter(a => a.topicKey).filter((a, i, all) => all.findIndex(x => x.id === a.id) === i);
}

function sanitizeV3(raw) {
  const reviews = (Array.isArray(raw.reviews) ? raw.reviews : []).slice(0, 5000).filter(r => r && typeof r === 'object' && typeof r.topicKey === 'string' && date(r.dueAt)).map((r, i) => ({
    id: str(r.id, 80) || `rv-imp-${i + 1}`, topicKey: str(r.topicKey, 160), topic: str(r.topic, 120), areaKey: str(r.areaKey, 120), area: str(r.area, 120),
    reason: str(r.reason, 60) || 'Erro recente', priority: ['alta', 'média', 'baixa'].includes(r.priority) ? r.priority : 'média', origin: str(r.origin, 20) || 'migração',
    source: r.source === 'user' ? 'user' : 'demo', status: r.status === 'done' ? 'done' : 'pending', createdAt: date(r.createdAt) || date(r.dueAt), dueAt: date(r.dueAt),
    step: Math.max(0, Math.min(10, int(r.step) ?? 0)), intervalDays: int(r.intervalDays) ?? 0, completedAt: date(r.completedAt), outcome: ['success', 'lapse'].includes(r.outcome) ? r.outcome : null,
    accuracy: Number.isFinite(r.accuracy) ? r.accuracy : null, history: (Array.isArray(r.history) ? r.history : []).slice(0, 50).map(h => ({ at: date(h?.at), event: str(h?.event, 30), detail: str(h?.detail, 200) }))
  })).filter((r, i, all) => all.findIndex(x => x.id === r.id) === i);
  const studySessions = (Array.isArray(raw.studySessions) ? raw.studySessions : []).slice(0, 5000).filter(s => s && typeof s === 'object').map((s, i) => ({
    id: str(s.id, 80) || `s-imp-${i + 1}`, mode: str(s.mode, 80), kind: str(s.kind, 30) || 'legado', status: ['em andamento', 'concluída', 'interrompida'].includes(s.status) ? s.status : 'interrompida',
    startedAt: date(s.startedAt), completedAt: date(s.completedAt), questionIds: (Array.isArray(s.questionIds) ? s.questionIds : []).filter(x => typeof x === 'string').slice(0, 200), source: 'user', contentSource: 'demo'
  })).filter((s, i, all) => all.findIndex(x => x.id === s.id) === i);
  const contentReviews = (Array.isArray(raw.contentReviews) ? raw.contentReviews : []).slice(0, 5000).filter(c => c && typeof c.questionId === 'string' && date(c.at)).map(c => ({
    questionId: str(c.questionId, 80), sessionId: str(c.sessionId, 80), areaKey: str(c.areaKey, 120), topicKey: str(c.topicKey, 160), subtopicKey: str(c.subtopicKey, 200), at: date(c.at), source: 'user'
  }));
  const p = raw.profile && typeof raw.profile === 'object' && typeof raw.profile.name === 'string' ? raw.profile : null;
  const profile = p ? { name: p.name.trim().slice(0, 35), exam: str(p.exam, 40) || 'Outra prova', year: int(p.year), specialty: str(p.specialty, 80) || '', specialtyId: str(p.specialtyId, 80), hours: int(p.hours), date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : null, completedAt: date(p.completedAt), updatedAt: date(p.updatedAt) } : null;
  const draft = raw.onboarding?.draft && typeof raw.onboarding.draft === 'object' ? Object.fromEntries(Object.entries(raw.onboarding.draft).filter(([k]) => k in DRAFT_FIELDS).map(([k, v]) => [k, typeof v === 'number' ? v : String(v).slice(0, DRAFT_FIELDS[k])])) : {};
  return {
    schemaVersion: SCHEMA_VERSION, profile, onboarding: { step: [1, 2, 3].includes(raw.onboarding?.step) ? raw.onboarding.step : 1, draft },
    answers: sanitizeAnswers(raw.answers), reviews, contentReviews, studySessions, session: null,
    demo: { legacyReviews: (Array.isArray(raw.demo?.legacyReviews) ? raw.demo.legacyReviews : []).filter(x => typeof x === 'string').slice(0, 50) },
    meta: { createdAt: date(raw.meta?.createdAt), migratedFrom: str(raw.meta?.migratedFrom, 20), migratedAt: date(raw.meta?.migratedAt) }
  };
}

export function parseLocal(key, raw, now) {
  if (typeof raw !== 'string' || raw.length > 5 * 1024 * 1024) throw new HttpError(413, 'Dados locais grandes demais para importar.');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new HttpError(422, 'Os dados salvos neste navegador estão em formato inválido e não foram importados. Nada foi apagado.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(422, 'Os dados salvos neste navegador estão em formato inválido.');
  if (!['medai-v3', 'medai-v2', 'medai-v1'].includes(key)) throw new HttpError(422, 'Origem de dados local desconhecida.');
  if (key === 'medai-v3' && Number(parsed.schemaVersion) > SCHEMA_VERSION) throw new HttpError(422, 'Os dados locais foram gravados por uma versão mais nova do MedAI.');
  // v1/v2 passam pelas migrações já existentes; o resultado (e o v3) é revalidado campo a campo.
  let engineShaped;
  try { engineShaped = key === 'medai-v3' ? parsed : key === 'medai-v2' ? migrateV2(parsed, now).state : migrateV1(parsed, now).state; }
  catch { throw new HttpError(422, 'Não foi possível interpretar os dados locais. Nada foi apagado.'); }
  return normalizeState(sanitizeV3(engineShaped), now);
}
