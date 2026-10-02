// Rotina de atualização do Radar (npm run update-notices [fonte...]).
// Para cada fonte automatizada: COLETA → EXTRAÇÃO → VALIDAÇÃO (no coletor) → ARMAZENAMENTO (store.mjs),
// com registro da execução em ingestion_runs. Falha de uma fonte não apaga dados nem afeta as outras.
import { COLLECTORS } from './sources/index.mjs';
import { createFetcher, FetchError } from './fetcher.mjs';
import { createDocumentStore } from './documents.mjs';
import { storeCollection } from './store.mjs';

export async function runUpdate(db, { sourceIds = [], collectors = COLLECTORS, fetcher, userAgent, log = console.log, clock = () => Date.now() } = {}) {
  fetcher ||= createFetcher({ userAgent });
  const results = [];
  for (const c of collectors.filter(c => c.collect && c.source.automated && (!sourceIds.length || sourceIds.includes(c.source.id)))) {
    const run = (await db.query('INSERT INTO ingestion_runs (source_id) VALUES ($1) RETURNING id', [c.source.id])).rows[0].id;
    const errors = [];
    const ctx = { fetcher, docs: createDocumentStore(db, fetcher, { log: m => { errors.push(m); log(m); } }), log: m => { log(`[${c.source.id}] ${m}`); }, now: clock() };
    try {
      const collection = await c.collect(ctx);
      const stats = await storeCollection(db, c.source, collection, { now: clock() });
      const status = errors.length || stats.needsReview ? 'PARTIAL' : 'OK';
      await db.query(`UPDATE ingestion_runs SET finished_at = now(), status = $2, stats = $3, errors = $4 WHERE id = $1`, [run, status, JSON.stringify(stats), JSON.stringify(errors)]);
      await db.query(`UPDATE notice_sources SET last_checked_at = now(), last_status = 'OK', last_error = $2 WHERE id = $1`, [c.source.id, errors.length ? errors.slice(0, 3).join(' | ').slice(0, 500) : null]);
      log(`[${c.source.id}] ${status}: ${stats.processes} processo(s), ${stats.created} novo(s), ${stats.changes} alteração(ões), ${stats.programs} programa(s), ${stats.removed} removido(s)`);
      results.push({ source: c.source.id, status, stats });
    } catch (e) {
      const status = e instanceof FetchError && e.unavailable ? 'UNAVAILABLE' : 'ERROR';
      const message = `${e.message}${e.url ? ` (${e.url})` : ''}`.slice(0, 500);
      errors.push(message);
      await db.query(`UPDATE ingestion_runs SET finished_at = now(), status = 'ERROR', errors = $2 WHERE id = $1`, [run, JSON.stringify(errors)]);
      await db.query(`UPDATE notice_sources SET last_checked_at = now(), last_status = $2, last_error = $3 WHERE id = $1`, [c.source.id, status, message]);
      log(`[${c.source.id}] ${status}: ${message}. Os dados já armazenados foram mantidos.`);
      results.push({ source: c.source.id, status, error: message });
    }
  }
  return results;
}
