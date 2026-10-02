// Consulta do Radar e "Minhas residências". Só devolve o que está no banco, com a fonte de cada dado.
// Campos ausentes chegam como null; a interface mostra "não informado".
import { HttpError } from '../http/http-utils.mjs';
import { slug } from '../../dist/taxonomy.js';

export const localDate = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Estado das inscrições derivado SOMENTE das datas publicadas. Sem datas → UNKNOWN.
export function registrationState(p, today) {
  const start = p.registration_start, end = p.registration_end;
  if (!start && !end) return 'UNKNOWN';
  if (end && today > end) return 'CLOSED';
  if (start && today < start) return 'UPCOMING';
  if (start && end && today >= start && today <= end) return 'OPEN';
  return 'UNKNOWN'; // só uma das datas: não é possível afirmar que está aberta
}

const iso = v => v == null ? null : v instanceof Date ? v.toISOString() : String(v);

function shape(row, { programs = [], notices = [], fields = [], changes = [], tracked = false, today }) {
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    type: row.process_type,
    institution: row.institution_id ? { id: row.institution_id, name: row.institution_name, acronym: row.institution_acronym, uf: row.institution_uf, city: row.institution_city } : null,
    prerequisite: row.prerequisite,
    totalVacancies: row.total_vacancies,
    registrationStart: row.registration_start, registrationEnd: row.registration_end,
    examDate: row.exam_date,
    stages: row.stages,
    feeCents: row.fee_cents,
    officialUrl: row.official_url, noticeUrl: row.notice_url,
    publishedAt: row.published_at,
    statusNote: row.status_note,
    group: row.process_group,
    registrationNote: row.registration_note,
    reviewStatus: row.review_status,
    registrationState: registrationState(row, today),
    lastVerifiedAt: iso(row.last_verified_at), firstSeenAt: iso(row.first_seen_at), removedAt: iso(row.removed_at),
    source: { id: row.source_id, name: row.source_name, organization: row.source_organization, url: row.source_url },
    programs: programs.map(p => ({ specialty: p.specialty, specialtyId: p.specialty_id, programType: p.program_type, prerequisite: p.prerequisite, vacancies: p.vacancies, institution: p.institution_name, uf: p.uf, city: p.city, duration: p.duration, details: p.details, evidence: p.evidence, noticeUrl: p.notice_url || null })),
    notices: notices.map(n => ({ id: n.id, kind: n.kind, title: n.title, url: n.url, publishedAt: n.published_at, contentType: n.content_type, fetchedAt: iso(n.fetched_at), parseStatus: n.parse_status })),
    fields: fields.map(f => ({ field: f.field, value: f.value, evidence: f.evidence, sourceUrl: f.source_url, method: f.method, confidence: f.confidence, status: f.status, extractedAt: iso(f.extracted_at) })),
    changes: changes.map(c => ({ type: c.change_type, field: c.field, oldValue: c.old_value, newValue: c.new_value, detail: c.detail, detectedAt: iso(c.detected_at) })),
    tracked
  };
}

const BASE = `SELECT p.*, i.name AS institution_name, i.acronym AS institution_acronym, i.uf AS institution_uf, i.city AS institution_city,
  s.name AS source_name, s.organization AS source_organization, s.url AS source_url
  FROM selection_processes p JOIN notice_sources s ON s.id = p.source_id LEFT JOIN institutions i ON i.id = p.institution_id`;

export function createRadarService(db, { clock = () => Date.now() } = {}) {
  async function programsFor(ids) {
    if (!ids.length) return new Map();
    const rows = (await db.query(`SELECT rp.*, n.url AS notice_url FROM residency_programs rp LEFT JOIN notices n ON n.id = rp.notice_id WHERE rp.process_id = ANY($1) ORDER BY rp.specialty, rp.program_type NULLS FIRST`, [ids])).rows;
    const m = new Map(); for (const r of rows) { if (!m.has(r.process_id)) m.set(r.process_id, []); m.get(r.process_id).push(r); } return m;
  }
  async function trackedSet(userId) {
    if (!userId) return new Set();
    return new Set((await db.query('SELECT process_id FROM tracked_processes WHERE user_id = $1', [userId])).rows.map(r => r.process_id));
  }

  return {
    async list(filters = {}, userId = null) {
      const today = localDate(clock());
      const where = ['p.removed_at IS NULL'], params = [];
      const $ = v => { params.push(v); return '$' + params.length; };
      const text = v => String(v || '').trim().slice(0, 80);
      if (text(filters.uf)) { const u = $(text(filters.uf)); where.push(`(upper(i.uf) = upper(${u}) OR EXISTS (SELECT 1 FROM residency_programs rp WHERE rp.process_id = p.id AND upper(rp.uf) = upper(${u})))`); }
      if (text(filters.institution)) { const v = $(text(filters.institution)); where.push(`(i.id = ${v} OR i.name ILIKE '%' || ${v} || '%' OR i.acronym ILIKE ${v})`); }
      if (/^\d{4}$/.test(String(filters.year || ''))) where.push(`p.year = ${$(Number(filters.year))}`);
      if (filters.open === '1' || filters.open === 'true') { const t = $(today); where.push(`p.registration_start <= ${t} AND p.registration_end >= ${t}`); }
      const specialty = text(filters.specialty);
      if (specialty) { const id = $(slug(specialty)), name = $(specialty); where.push(`EXISTS (SELECT 1 FROM residency_programs rp WHERE rp.process_id = p.id AND (rp.specialty_id = ${id} OR rp.specialty ILIKE '%' || ${name} || '%'))`); }
      const rows = (await db.query(`${BASE} WHERE ${where.join(' AND ')} ORDER BY p.registration_end NULLS LAST, p.name`, params)).rows;
      const ids = rows.map(r => r.id), tracked = await trackedSet(userId);
      // Personalização: a especialidade desejada só reordena. Nada é escondido e nenhuma compatibilidade é afirmada.
      const preferred = userId ? (await db.query('SELECT specialty, specialty_id FROM study_goals WHERE user_id = $1', [userId])).rows[0] || null : null;
      const prefId = preferred?.specialty_id || null;
      const summary = new Map((await db.query('SELECT process_id, count(*)::int AS programs, count(DISTINCT specialty_id)::int AS specialties, count(vacancies)::int AS known, sum(vacancies)::int AS vacancies FROM residency_programs WHERE process_id = ANY($1) GROUP BY process_id', [ids])).rows.map(r => [r.process_id, r]));
      const pref = prefId ? new Map((await db.query('SELECT process_id, min(specialty) AS specialty, count(*)::int AS programs, count(vacancies)::int AS known, sum(vacancies)::int AS vacancies FROM residency_programs WHERE process_id = ANY($1) AND specialty_id = $2 GROUP BY process_id', [ids, prefId])).rows.map(r => [r.process_id, r])) : new Map();
      const items = rows.map(r => {
        const item = shape(r, { tracked: tracked.has(r.id), today });
        const sm = summary.get(r.id), pf = pref.get(r.id);
        item.programSummary = sm ? { programs: sm.programs, specialties: sm.specialties } : null;
        // Vagas da especialidade só são somadas quando todos os programas informam o número.
        item.preferredProgram = pf ? { specialty: pf.specialty, programs: pf.programs, vacancies: pf.known === pf.programs ? pf.vacancies : null } : null;
        item.mentionsPreferredSpecialty = !!pf;
        return item;
      });
      if (prefId) items.sort((a, b) => Number(b.mentionsPreferredSpecialty) - Number(a.mentionsPreferredSpecialty));
      const filterValues = (await db.query(`SELECT i.uf, p.year FROM selection_processes p LEFT JOIN institutions i ON i.id = p.institution_id WHERE p.removed_at IS NULL
        UNION SELECT rp.uf, NULL FROM residency_programs rp JOIN selection_processes p ON p.id = rp.process_id WHERE p.removed_at IS NULL`)).rows;
      return {
        today, items,
        personalization: prefId ? { specialty: preferred.specialty, specialtyId: prefId, note: 'Processos que citam sua especialidade aparecem primeiro. Isso não confirma vagas nem que você atende aos pré-requisitos: confira o edital.' } : null,
        filters: { ufs: [...new Set(filterValues.map(r => r.uf).filter(Boolean))].sort(), years: [...new Set(filterValues.map(r => r.year).filter(Boolean))].sort() },
        sources: await this.sources()
      };
    },

    async detail(id, userId = null) {
      const row = (await db.query(`${BASE} WHERE p.id = $1`, [String(id).slice(0, 200)])).rows[0];
      if (!row) throw new HttpError(404, 'Processo não encontrado.');
      const [programs, notices, fields, changes, tracked] = await Promise.all([
        programsFor([row.id]).then(m => m.get(row.id) || []),
        db.query('SELECT * FROM notices WHERE process_id = $1 ORDER BY published_at DESC NULLS LAST, id DESC', [row.id]).then(r => r.rows),
        db.query('SELECT * FROM extracted_fields WHERE process_id = $1 ORDER BY field', [row.id]).then(r => r.rows),
        db.query('SELECT * FROM process_changes WHERE process_id = $1 ORDER BY detected_at DESC, id DESC LIMIT 50', [row.id]).then(r => r.rows),
        trackedSet(userId)
      ]);
      const out = shape(row, { programs, notices, fields, changes, tracked: tracked.has(row.id), today: localDate(clock()) });
      const bySpec = new Map();
      for (const p of out.programs) { const g = bySpec.get(p.specialtyId) || { specialty: p.specialty, specialtyId: p.specialtyId, programs: 0, known: 0, vacancies: 0 }; g.programs++; if (Number.isInteger(p.vacancies)) { g.known++; g.vacancies += p.vacancies; } bySpec.set(p.specialtyId, g); }
      out.specialtySummary = [...bySpec.values()].map(g => ({ specialty: g.specialty, specialtyId: g.specialtyId, programs: g.programs, vacancies: g.known === g.programs ? g.vacancies : null })).sort((a, b) => a.specialty.localeCompare(b.specialty, 'pt-BR'));
      return out;
    },

    async sources() {
      const rows = (await db.query(`SELECT s.*, (SELECT count(*)::int FROM selection_processes p WHERE p.source_id = s.id AND p.removed_at IS NULL) AS processes,
        (SELECT row_to_json(r) FROM (SELECT status, started_at, finished_at, stats FROM ingestion_runs WHERE source_id = s.id ORDER BY id DESC LIMIT 1) r) AS last_run
        FROM notice_sources s ORDER BY s.automated DESC, s.name`)).rows;
      return rows.map(s => ({ id: s.id, name: s.name, organization: s.organization, url: s.url, type: s.source_type, accessMethod: s.access_method, automated: s.automated, notes: s.notes, lastCheckedAt: iso(s.last_checked_at), lastStatus: s.last_status, lastError: s.last_error, processes: s.processes, lastRun: s.last_run }));
    },

    async tracked(userId) {
      const rows = (await db.query(`${BASE} JOIN tracked_processes t ON t.process_id = p.id AND t.user_id = $1 ORDER BY t.created_at DESC`, [userId])).rows;
      const today = localDate(clock());
      const specs = new Map((await db.query('SELECT process_id, specialty, created_at FROM tracked_processes WHERE user_id = $1', [userId])).rows.map(r => [r.process_id, r]));
      return { today, items: rows.map(r => ({ ...shape(r, { tracked: true, today }), trackedSpecialty: specs.get(r.id)?.specialty || null, trackedAt: iso(specs.get(r.id)?.created_at) })) };
    },

    async track(userId, { processId, specialty }) {
      const exists = (await db.query('SELECT 1 FROM selection_processes WHERE id = $1', [String(processId || '').slice(0, 200)])).rows.length;
      if (!exists) throw new HttpError(404, 'Processo não encontrado.');
      await db.query('INSERT INTO tracked_processes (user_id, process_id, specialty) VALUES ($1,$2,$3) ON CONFLICT (user_id, process_id) DO UPDATE SET specialty = EXCLUDED.specialty', [userId, processId, specialty ? String(specialty).slice(0, 120) : null]);
      return this.tracked(userId);
    },

    async untrack(userId, processId) {
      await db.query('DELETE FROM tracked_processes WHERE user_id = $1 AND process_id = $2', [userId, processId]);
      return this.tracked(userId);
    }
  };
}
