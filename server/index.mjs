// Ponto de entrada do servidor MedAI: configuração → banco (migrations + seed de produção) → HTTP.
import http from 'node:http';
import { loadEnvFile, readConfig } from './config.mjs';
import { openDatabase } from './db/index.mjs';
import { migrate } from './db/migrate.mjs';
import { seedProduction } from './db/seed/production.mjs';
import { loadQuestionsFromDb } from './services/study-service.mjs';
import { createApp } from './app.mjs';

loadEnvFile();
const config = readConfig();
process.env.TZ ||= config.timezone; // "hoje" das revisões e das inscrições segue o fuso configurado

export async function prepareDatabase(db, { log = console.log } = {}) {
  await migrate(db, { log });
  if (process.env.AUTO_SEED !== 'false') await seedProduction(db, { log });
  const n = await loadQuestionsFromDb(db);
  log(`banco de questões carregado: ${n} questões`);
}

export async function main() {
  if (!config.databaseUrl) { console.error('Defina DATABASE_URL (veja .env.example).'); process.exit(1); }
  const db = await openDatabase(config.databaseUrl);
  const handler = await createApp({ db, config });
  const server = http.createServer(handler);
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  // Se o banco estiver fora do ar na inicialização, o servidor sobe mesmo assim (API responde 503) e tenta de novo.
  const init = async () => { try { await prepareDatabase(db); return true; } catch (e) { console.error('[db] preparação falhou:', e.code || e.message, '— nova tentativa em 10 s'); setTimeout(init, 10000); return false; } };
  await init();
  server.listen(config.port, config.host, () => console.log(`MedAI: http://${config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${config.port}  (banco: ${db.kind})`));
  const stop = async () => { server.close(); await db.close().catch(() => {}); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
