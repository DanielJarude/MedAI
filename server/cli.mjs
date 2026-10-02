// Comandos de manutenção: npm run db:migrate | db:seed | db:seed:dev
import { loadEnvFile, readConfig } from './config.mjs';
import { openDatabase } from './db/index.mjs';
import { migrate } from './db/migrate.mjs';
import { seedProduction } from './db/seed/production.mjs';

loadEnvFile();
const config = readConfig();
const command = process.argv[2];
const db = await openDatabase(config.databaseUrl);
try {
  if (command === 'migrate') { const done = await migrate(db, { log: console.log }); console.log(done.length ? `${done.length} migration(s) aplicada(s).` : 'Schema já atualizado.'); }
  else if (command === 'seed') { await migrate(db); await seedProduction(db, { log: console.log }); }
  else if (command === 'seed-dev') {
    if (config.production) throw new Error('Seed de desenvolvimento recusado com NODE_ENV=production.');
    const { seedDevelopment } = await import('./db/seed/development.mjs');
    await migrate(db); await seedProduction(db); await seedDevelopment(db, { log: console.log });
  } else { console.log('Uso: node server/cli.mjs migrate|seed|seed-dev'); process.exitCode = 1; }
} catch (e) { console.error(e.message); process.exitCode = 1; } finally { await db.close(); }
