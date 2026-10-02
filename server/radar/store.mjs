// ARMAZENAR: grava o resultado de um coletor preservando proveniência e histórico.
// - Processo identificado por (fonte, chave externa): rodar duas vezes não duplica.
// - Um campo só é sobrescrito quando o coletor o avaliou nesta execução.
// - Toda mudança relevante vira um registro em process_changes (nada é simulado).
import { registrationState, localDate } from '../services/radar-service.mjs';
import { slug } from '../../dist/taxonomy.js';

const COLUMN = { registration_start: 'registration_start', registration_end: 'registration_end', exam_date: 'exam_date', fee: 'fee_cents', total_vacancies: 'total_vacancies', prerequisite: 'prerequisite', published_at: 'published_at', stages: 'stages', year: 'year' };
const DATE_FIELDS = new Set(['registration_start', 'registration_end', 'exam_date']);
const json = v => JSON.stringify(v ?? null);
const norm = v => v instanceof Date ? v.toISOString().slice(0, 10) : v;
const NOTICE_EVENT = { RETIFICACAO: 'EDITAL_RETIFICADO', RESULTADO: 'RESULTADO_PUBLICADO' };

export const processId = (sourceId, externalKey) => `${sourceId}--${slug(externalKey)}`.slice(0, 180);

export async function storeCollection(db, source, collection, { now = Date.now() } = {}) {
  const today = localDate(now), stats = { processes: 0, created: 0, changes: 0, notices: 0, programs: 0, removed: 0, needsReview: 0 };
  const seen = new Set();
  await db.tx(async tx => {
    const change = async (pid, type, field, oldValue, newValue, detail) => {
      stats.changes++;
      await tx.query('INSERT INTO process_changes (process_id, change_type, field, old_value, new_value, detail) VALUES ($1,$2,$3,$4,$5,$6)', [pid, type, field, json(oldValue), json(newValue), detail || null]);
    };
    for (const p of collection.processes) {
      const id = processId(source.id, p.externalKey);
      seen.add(id); stats.processes++;
      if (p.institution) {
        const i = p.institution;
        await tx.query(`INSERT INTO institutions (id, name, acronym, uf, city, official_url) VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, acronym = COALESCE(EXCLUDED.acronym, institutions.acronym), uf = COALESCE(EXCLUDED.uf, institutions.uf),
            city = COALESCE(EXCLUDED.city, institutions.city), official_url = COALESCE(EXCLUDED.official_url, institutions.official_url)`,
          [i.id, i.name, i.acronym || null, i.uf || null, i.city || null, i.officialUrl || null]);
      }
      const before = (await tx.query('SELECT * FROM selection_processes WHERE id = $1 FOR UPDATE', [id])).rows[0];
      const fields = p.fields || {};
      const needsReview = p.needsReview || Object.values(fields).some(f => f.status === 'NEEDS_REVIEW');
      if (needsReview) stats.needsReview++;
      if (!before) {
        await tx.query(`INSERT INTO selection_processes (id, source_id, institution_id, external_key, name, process_type, process_group, official_url, notice_url, status_note, registration_note, review_status, last_verified_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, to_timestamp($13 / 1000.0))`,
          [id, source.id, p.institution?.id || null, p.externalKey, p.name, p.type || null, p.group || null, p.officialUrl, p.noticeUrl || null, p.statusNote || null, p.registrationNote || null, needsReview ? 'NEEDS_REVIEW' : 'OK', now]);
        stats.created++;
        await change(id, 'NOVO_PROCESSO', null, null, null, `Identificado em ${source.name}${p.notices?.length ? ` com ${p.notices.length} documento(s)` : ''}`);
      } else {
        await tx.query(`UPDATE selection_processes SET name = $2, institution_id = COALESCE($3, institution_id), process_type = $4, process_group = $5, official_url = $6, notice_url = COALESCE($7, notice_url),
            status_note = $8, registration_note = $9, review_status = $10, last_verified_at = to_timestamp($11 / 1000.0), removed_at = NULL WHERE id = $1`,
          [id, p.name, p.institution?.id || null, p.type || null, p.group || null, p.officialUrl, p.noticeUrl || null, p.statusNote || null, p.registrationNote || null, needsReview ? 'NEEDS_REVIEW' : 'OK', now]);
        if (before.removed_at) await change(id, 'NOVO_EDITAL', null, null, null, 'Voltou a aparecer na fonte');
      }

      // Documentos: novos, atualizados (mesma identidade, conteúdo/URL diferente) e removidos.
      if (Array.isArray(p.notices)) {
        const existing = new Map((await tx.query('SELECT * FROM notices WHERE process_id = $1', [id])).rows.map(n => [n.doc_key, n]));
        for (const n of p.notices) {
          stats.notices++;
          const old = existing.get(n.docKey);
          existing.delete(n.docKey);
          if (!old) {
            await tx.query(`INSERT INTO notices (process_id, doc_key, kind, title, url, published_at, content_type, content_hash, byte_size, fetched_at, parse_status, parse_error)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id, n.docKey, n.kind, n.title, n.url, n.publishedAt || null, n.contentType || null, n.contentHash || null, n.byteSize || null, n.fetchedAt || null, n.parseStatus || 'NOT_PARSED', n.parseError || null]);
            if (before) await change(id, NOTICE_EVENT[n.kind] || 'NOVO_EDITAL', null, null, { title: n.title, url: n.url }, n.title);
          } else {
            const updated = old.url !== n.url || (n.contentHash && old.content_hash && old.content_hash !== n.contentHash);
            await tx.query(`UPDATE notices SET kind = $2, title = $3, url = $4, published_at = $5, content_type = COALESCE($6, content_type), content_hash = COALESCE($7, content_hash),
                byte_size = COALESCE($8, byte_size), fetched_at = COALESCE($9, fetched_at), parse_status = COALESCE($10, parse_status), parse_error = $11, removed_at = NULL WHERE id = $1`,
              [old.id, n.kind, n.title, n.url, n.publishedAt || null, n.contentType || null, n.contentHash || null, n.byteSize || null, n.fetchedAt || null, n.parseStatus || null, n.parseError || null]);
            if (updated) await change(id, n.kind === 'EDITAL' ? 'EDITAL_RETIFICADO' : 'NOVO_EDITAL', null, { url: old.url }, { url: n.url }, `Documento atualizado: ${n.title}`);
          }
        }
        if (p.noticesComplete !== false) for (const gone of existing.values()) if (!gone.removed_at) {
          await tx.query('UPDATE notices SET removed_at = now() WHERE id = $1', [gone.id]);
          await change(id, 'REMOVIDO_DA_FONTE', null, { title: gone.title, url: gone.url }, null, `Documento não aparece mais na fonte: ${gone.title}`);
        }
      }

      // Campos avaliados nesta execução: valor aceito ou NULL. Evidência sempre registrada.
      for (const [field, f] of Object.entries(fields)) {
        const col = COLUMN[field];
        if (!col) continue;
        const value = f.status === 'ACCEPTED' ? f.value : null;
        const old = before ? norm(before[col]) : undefined;
        await tx.query(`UPDATE selection_processes SET ${col} = $2 WHERE id = $1`, [id, col === 'stages' ? json(value) : value]);
        if (before && JSON.stringify(old ?? null) !== JSON.stringify(value ?? null)) {
          const type = value === null ? 'CAMPO_ALTERADO' : DATE_FIELDS.has(field) && old !== null ? 'DATA_ALTERADA' : 'CAMPO_ALTERADO';
          await change(id, type, field, old ?? null, value, value === null ? (f.status === 'NEEDS_REVIEW' ? 'Dado passou para verificação manual' : 'Dado não encontrado no documento atual') : old === null ? 'Informação publicada' : 'Valor alterado na fonte');
        }
        const notice = f.noticeKey ? (await tx.query('SELECT id FROM notices WHERE process_id = $1 AND doc_key = $2', [id, f.noticeKey])).rows[0] : null;
        await tx.query(`INSERT INTO extracted_fields (process_id, notice_id, field, value, evidence, source_url, method, confidence, status, extracted_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, to_timestamp($10 / 1000.0))
          ON CONFLICT (process_id, field) DO UPDATE SET notice_id = EXCLUDED.notice_id, value = EXCLUDED.value, evidence = EXCLUDED.evidence, source_url = EXCLUDED.source_url,
            method = EXCLUDED.method, confidence = EXCLUDED.confidence, status = EXCLUDED.status, extracted_at = EXCLUDED.extracted_at`,
          [id, notice?.id || null, field, json(f.status === 'ACCEPTED' ? f.value : f.candidates?.length ? { candidates: f.candidates } : null), f.evidence || null, f.sourceUrl || p.officialUrl, f.method || 'text', f.confidence ?? 0, f.status, now]);
      }

      // Programas (vagas por especialidade) só quando o coletor os extraiu desta vez.
      if (Array.isArray(p.programs)) {
        const noticeIds = new Map((await tx.query('SELECT id, doc_key FROM notices WHERE process_id = $1', [id])).rows.map(n => [n.doc_key, n.id]));
        await tx.query('DELETE FROM residency_programs WHERE process_id = $1', [id]);
        for (const g of p.programs) {
          stats.programs++;
          await tx.query(`INSERT INTO residency_programs (process_id, program_key, specialty, specialty_id, program_type, prerequisite, vacancies, evidence, notice_id, institution_name, uf, city, duration, details)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (process_id, program_key) DO NOTHING`,
            [id, g.programKey, g.specialty, g.specialtyId || slug(g.specialty), g.programType || null, g.prerequisite || null, Number.isInteger(g.vacancies) ? g.vacancies : null, g.evidence || null, g.noticeKey ? noticeIds.get(g.noticeKey) || null : null, g.institutionName || null, g.uf || null, g.city || null, g.duration || null, g.details ? json(g.details) : null]);
        }
      }

      // Estado das inscrições, derivado das datas aceitas. Transições observadas entre execuções viram eventos.
      const row = (await tx.query('SELECT registration_start, registration_end, registration_state FROM selection_processes WHERE id = $1', [id])).rows[0];
      const reg = registrationState({ registration_start: norm(row.registration_start), registration_end: norm(row.registration_end) }, today);
      if (before && before.registration_state && before.registration_state !== reg) {
        if (reg === 'OPEN') await change(id, 'INSCRICOES_ABERTAS', 'registration_state', before.registration_state, reg, `Inscrições abertas até ${row.registration_end}`);
        if (reg === 'CLOSED') await change(id, 'INSCRICOES_ENCERRADAS', 'registration_state', before.registration_state, reg, `Inscrições encerradas em ${row.registration_end}`);
      }
      await tx.query('UPDATE selection_processes SET registration_state = $2 WHERE id = $1', [id, reg]);
    }

    // Listagem completa da fonte: processos que sumiram são marcados (não apagados).
    if (collection.complete) {
      const missing = (await tx.query('SELECT id FROM selection_processes WHERE source_id = $1 AND removed_at IS NULL', [source.id])).rows.filter(r => !seen.has(r.id));
      for (const m of missing) {
        stats.removed++;
        await tx.query('UPDATE selection_processes SET removed_at = now() WHERE id = $1', [m.id]);
        await change(m.id, 'REMOVIDO_DA_FONTE', null, null, null, 'O processo não aparece mais na listagem oficial');
      }
    }
  });
  return stats;
}
