// Ponte entre o estado do motor adaptativo (objeto usado por profile-model.js) e as tabelas normalizadas.
// O motor continua puro: o servidor carrega o estado do banco, aplica a função do motor e grava só o que mudou.
import { SCHEMA_VERSION, createInitialState, normalizeState } from '../../dist/profile-model.js';

const iso = v => v == null ? null : v instanceof Date ? v.toISOString() : String(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const json = v => JSON.stringify(v ?? null);

export async function loadState(q, userId, now = Date.now()) {
  const p = (await q.query('SELECT * FROM student_profiles WHERE user_id = $1', [userId])).rows[0];
  if (!p) return null;
  const g = (await q.query('SELECT * FROM study_goals WHERE user_id = $1', [userId])).rows[0];
  const answers = (await q.query('SELECT data FROM question_attempts WHERE user_id = $1 ORDER BY seq', [userId])).rows.map(r => r.data);
  const reviews = (await q.query('SELECT data FROM reviews WHERE user_id = $1 ORDER BY seq', [userId])).rows.map(r => r.data);
  const contentReviews = (await q.query('SELECT data FROM content_reviews WHERE user_id = $1 ORDER BY seq', [userId])).rows.map(r => r.data);
  const sessions = (await q.query('SELECT id, record, runtime, simulation_id FROM study_sessions WHERE user_id = $1 ORDER BY seq', [userId])).rows;
  const current = p.current_session_id ? sessions.find(s => s.id === p.current_session_id)?.runtime || null : null;
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    profile: g ? { name: g.name, exam: g.exam, year: g.year, specialty: g.specialty, specialtyId: g.specialty_id, hours: g.hours, date: g.target_date, completedAt: iso(g.completed_at), updatedAt: iso(g.updated_at) } : null,
    onboarding: { step: p.onboarding_step, draft: p.onboarding_draft || {} },
    answers, reviews, contentReviews,
    studySessions: sessions.map(s => s.record),
    session: current,
    demo: { legacyReviews: p.legacy?.legacyReviews || [] },
    meta: { ...createInitialState(now).meta, ...(p.meta || {}) }
  };
  // O snapshot de conhecimento é sempre recalculado a partir dos eventos (fonte única de verdade);
  // a cópia gravada em topic_mastery serve para consulta/auditoria e é atualizada quando muda.
  const stored = (await q.query('SELECT node_key, model_version, metrics FROM topic_mastery WHERE user_id = $1', [userId])).rows;
  const storedKnowledge = { modelVersion: stored[0]?.model_version ?? null, nodes: Object.fromEntries(stored.map(r => [r.node_key, r.metrics])) };
  return { state: normalizeState(raw, now), version: p.state_version, localImport: p.local_import, storedKnowledge };
}

// Grava as diferenças entre `before` e `after`. Eventos (respostas, "Compreendi") são apenas inseridos.
export async function saveState(q, userId, before, after, storedKnowledge = before.knowledge) {
  if (!same(before.profile, after.profile)) {
    if (after.profile) {
      const g = after.profile;
      await q.query(`INSERT INTO study_goals (user_id, name, exam, year, specialty, specialty_id, hours, target_date, completed_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, exam = EXCLUDED.exam, year = EXCLUDED.year, specialty = EXCLUDED.specialty,
          specialty_id = EXCLUDED.specialty_id, hours = EXCLUDED.hours, target_date = EXCLUDED.target_date, completed_at = EXCLUDED.completed_at, updated_at = EXCLUDED.updated_at`,
        [userId, g.name, g.exam, g.year ?? null, g.specialty || '', g.specialtyId ?? null, g.hours ?? null, g.date || null, g.completedAt || null, g.updatedAt || null]);
    } else await q.query('DELETE FROM study_goals WHERE user_id = $1', [userId]);
  }

  const known = new Set(before.answers.map(a => a.id));
  for (const a of after.answers) {
    if (known.has(a.id)) continue;
    await q.query(`INSERT INTO question_attempts (id, user_id, session_id, question_id, topic_key, correct, choice, answered_at, response_ms, is_review, source, data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (user_id, id) DO NOTHING`,
      [a.id, userId, a.sessionId ?? null, a.questionId ?? null, a.topicKey ?? null, !!a.correct, Number.isInteger(a.choice) ? a.choice : null, a.at || null, Number.isFinite(a.responseMs) ? Math.round(a.responseMs) : null, !!a.isReview, a.source || 'user', json(a)]);
  }

  const prevReviews = new Map(before.reviews.map(r => [r.id, r]));
  for (const r of after.reviews) {
    if (same(prevReviews.get(r.id), r)) continue;
    await q.query(`INSERT INTO reviews (id, user_id, topic_key, status, reason, priority, due_at, created_at, completed_at, data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (user_id, id) DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, priority = EXCLUDED.priority, due_at = EXCLUDED.due_at, completed_at = EXCLUDED.completed_at, data = EXCLUDED.data`,
      [r.id, userId, r.topicKey, r.status, r.reason, r.priority, r.dueAt || null, r.createdAt || null, r.completedAt || null, json(r)]);
  }

  const prevContent = new Set(before.contentReviews.map(c => `${c.questionId}|${c.sessionId || ''}`));
  for (const c of after.contentReviews) {
    if (prevContent.has(`${c.questionId}|${c.sessionId || ''}`)) continue;
    await q.query('INSERT INTO content_reviews (user_id, question_id, session_id, at, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [userId, c.questionId, c.sessionId || '', c.at, json(c)]);
  }

  const prevSessions = new Map(before.studySessions.map(s => [s.id, s]));
  const runtimeChanged = !same(before.session, after.session);
  for (const s of after.studySessions) {
    const isCurrent = after.session?.id === s.id;
    if (same(prevSessions.get(s.id), s) && !(isCurrent && runtimeChanged)) continue;
    await q.query(`INSERT INTO study_sessions (id, user_id, mode, kind, status, simulation_id, started_at, completed_at, question_ids, record, runtime)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (user_id, id) DO UPDATE SET status = EXCLUDED.status, completed_at = EXCLUDED.completed_at, record = EXCLUDED.record,
        runtime = COALESCE(EXCLUDED.runtime, study_sessions.runtime)`,
      [s.id, userId, s.mode ?? null, s.kind || 'legado', s.status, s.simulationId ?? null, s.startedAt || null, s.completedAt || null, json(s.questionIds || []), json(s), isCurrent ? json(after.session) : null]);
  }

  await persistKnowledge(q, userId, storedKnowledge, after.knowledge);

  const draftName = after.profile?.name || after.onboarding?.draft?.name || null;
  await q.query(`UPDATE student_profiles SET display_name = $2, onboarding_step = $3, onboarding_draft = $4, current_session_id = $5, legacy = $6, meta = $7,
      state_version = state_version + 1, updated_at = now() WHERE user_id = $1`,
    [userId, draftName, after.onboarding?.step || 1, json(after.onboarding?.draft || {}), after.session?.id || null, json({ legacyReviews: after.demo?.legacyReviews || [] }), json(after.meta || {})]);
}

// Snapshot derivado em topic_mastery: só os nós cujas métricas mudaram.
async function persistKnowledge(q, userId, before, after) {
  for (const [key, node] of Object.entries(after.nodes)) {
    if (same(before?.nodes?.[key], node) && before?.modelVersion === after.modelVersion) continue;
    await q.query(`INSERT INTO topic_mastery (user_id, node_key, level, mastery, state, trend, questions_answered, model_version, computed_at, metrics)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (user_id, node_key) DO UPDATE SET mastery = EXCLUDED.mastery, state = EXCLUDED.state, trend = EXCLUDED.trend, questions_answered = EXCLUDED.questions_answered,
        model_version = EXCLUDED.model_version, computed_at = EXCLUDED.computed_at, metrics = EXCLUDED.metrics`,
      [userId, key, node.level, node.currentMastery ?? null, node.state, node.trend ?? null, node.questionsAnswered || 0, after.modelVersion, after.computedAt, json(node)]);
  }
}

// Reset: apaga somente os dados de estudo (conta e Minhas residências permanecem).
export async function resetStudyData(q, userId, now = Date.now()) {
  for (const t of ['question_attempts', 'reviews', 'content_reviews', 'study_sessions', 'topic_mastery', 'study_goals']) await q.query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]);
  const fresh = createInitialState(now);
  await q.query(`UPDATE student_profiles SET onboarding_step = 1, onboarding_draft = '{}'::jsonb, current_session_id = NULL, legacy = '{}'::jsonb, meta = $2, local_import = NULL,
    state_version = state_version + 1, updated_at = now() WHERE user_id = $1`, [userId, json(fresh.meta)]);
}
