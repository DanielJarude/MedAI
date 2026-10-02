// Configuração por variáveis de ambiente. Lê um arquivo .env local (opcional) sem sobrescrever o ambiente.
// Segredos ficam só no servidor; nada daqui é enviado ao navegador.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function loadEnvFile(path = ROOT + '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    production,
    port: Number(env.PORT) || 4173,
    host: env.HOST || '127.0.0.1',
    databaseUrl: env.DATABASE_URL || (production ? null : 'pglite:./data/pglite'),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    sessionDays: Number(env.SESSION_DAYS) || 30,
    timezone: env.TZ || 'America/Sao_Paulo',
    radarUserAgent: env.RADAR_USER_AGENT || 'MedAI-Radar/1.0 (coleta de editais publicos; contato: configure RADAR_CONTACT)',
    radarContact: env.RADAR_CONTACT || null,
    searchProvider: env.SEARCH_PROVIDER || null,
    searchApiKey: env.SEARCH_API_KEY || null
  };
}
