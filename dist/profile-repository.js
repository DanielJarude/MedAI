// Adaptador de persistência. Único módulo que toca o armazenamento; trocar por uma API no futuro.
// Chaves separadas: dados pessoais (medai-v3) e configuração da aplicação (medai-app).
// Dados DEMO não são persistidos: vivem em demo-data.js.
import { SCHEMA_VERSION, createInitialState, createAppConfig, migrateV1, migrateV2, normalizeState } from './profile-model.js';

export const KEYS = Object.freeze({ user: 'medai-v3', app: 'medai-app', v2: 'medai-v2', v1: 'medai-v1' });

export function memoryStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, dump: () => Object.fromEntries(m) };
}

export function createRepository(storage) {
  const read = key => storage.getItem(key);
  const write = (key, value) => { try { storage.setItem(key, JSON.stringify(value)); return { ok: true }; } catch (error) { return { ok: false, error }; } };
  const persistable = state => { const { knowledge, ...rest } = state; return { ...rest, knowledge: { modelVersion: knowledge.modelVersion, computedAt: knowledge.computedAt, nodes: knowledge.nodes } }; };

  function loadApp() {
    try { const raw = read(KEYS.app); return raw ? { ...createAppConfig(), ...JSON.parse(raw) } : null; } catch { return null; }
  }

  // Nunca apaga nem sobrescreve um registro que não conseguiu ler.
  function load(now = Date.now()) {
    let raw;
    try { raw = read(KEYS.user); } catch (error) { return { status: 'error', reason: 'storage', error }; }
    if (raw !== null && raw !== undefined) {
      let parsed;
      try { parsed = JSON.parse(raw); } catch (error) { return { status: 'error', reason: 'json', error }; }
      if (!parsed || typeof parsed !== 'object') return { status: 'error', reason: 'json' };
      if (Number(parsed.schemaVersion) > SCHEMA_VERSION) return { status: 'error', reason: 'newer', schemaVersion: parsed.schemaVersion };
      return { status: 'ok', state: normalizeState(parsed, now), app: loadApp() || createAppConfig() };
    }
    for (const [key, migrate] of [[KEYS.v2, migrateV2], [KEYS.v1, migrateV1]]) {
      let legacy;
      try { legacy = read(key); } catch (error) { return { status: 'error', reason: 'storage', error }; }
      if (legacy === null || legacy === undefined) continue;
      let parsed;
      try { parsed = JSON.parse(legacy); } catch (error) { return { status: 'error', reason: 'json', key, error }; }
      const { state, app } = migrate(parsed || {}, now);
      const appCfg = loadApp() || app;
      // A chave antiga permanece intacta como cópia de recuperação.
      const saved = write(KEYS.user, persistable(state));
      if (saved.ok) write(KEYS.app, appCfg);
      return { status: 'migrated', from: key, state, app: appCfg, saveError: saved.ok ? null : saved.error };
    }
    return { status: 'new', state: createInitialState(now), app: loadApp() || createAppConfig() };
  }

  return {
    load,
    save: state => write(KEYS.user, persistable(state)),
    saveApp: app => write(KEYS.app, app),
    // Reset de desenvolvimento: substitui SOMENTE os dados pessoais por um perfil vazio.
    // Mantém medai-app (plano demo, login demo) e as cópias medai-v1/medai-v2, que não são reimportadas
    // porque medai-v3 passa a existir.
    resetPersonalData(now = Date.now()) {
      const fresh = createInitialState(now);
      const saved = write(KEYS.user, persistable(fresh));
      return saved.ok ? { ok: true, state: fresh } : { ok: false, error: saved.error };
    }
  };
}
