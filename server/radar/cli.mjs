// npm run update-notices [id-da-fonte ...]
import { loadEnvFile, readConfig } from '../config.mjs';
import { openDatabase } from '../db/index.mjs';
import { migrate } from '../db/migrate.mjs';
import { seedProduction } from '../db/seed/production.mjs';
import { runUpdate } from './update.mjs';

loadEnvFile();
const config = readConfig();
process.env.TZ ||= config.timezone;
const db = await openDatabase(config.databaseUrl);
try {
  await migrate(db); await seedProduction(db);
  const results = await runUpdate(db, { sourceIds: process.argv.slice(2), userAgent: config.radarContact ? `${config.radarUserAgent} ${config.radarContact}` : config.radarUserAgent });
  if (results.some(r => r.status === 'ERROR' || r.status === 'UNAVAILABLE')) process.exitCode = 2;
} finally { await db.close(); }
