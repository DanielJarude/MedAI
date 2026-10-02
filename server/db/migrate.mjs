// Migrations versionadas: arquivos NNN_nome.sql em ./migrations, aplicados em ordem, cada um em transação.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function migrate(db, { log = () => {} } = {}) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query('SELECT version FROM schema_migrations')).rows.map(r => r.version));
  const files = (await readdir(DIR)).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
  const applied = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (done.has(version)) continue;
    const sql = await readFile(DIR + file, 'utf8');
    await db.tx(async tx => { await tx.exec(sql); await tx.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]); });
    applied.push(version); log(`migration aplicada: ${version}`);
  }
  return applied;
}
