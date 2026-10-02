// Cliente da API do MedAI. Substitui o antigo acesso ao localStorage como fonte dos dados pessoais.
// Todas as mutações passam por uma fila: chegam ao servidor e são aplicadas na tela na ordem em que foram feitas.

export class ApiError extends Error {
  constructor(status, message, data = {}) { super(message); this.status = status; this.data = data; }
  get offline() { return this.status === 0 || this.status === 503; }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-MedAI-Request': '1' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch { throw new ApiError(0, 'Sem conexão com o servidor do MedAI. Verifique sua internet e tente novamente. Nada foi perdido.'); }
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Não foi possível concluir a ação.', data);
  return data;
}

let queue = Promise.resolve();
const serial = fn => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

export const api = {
  me: () => request('GET', '/api/auth/me'),
  register: (email, password) => request('POST', '/api/auth/register', { email, password }),
  login: (email, password) => request('POST', '/api/auth/login', { email, password }),
  logout: () => request('POST', '/api/auth/logout', {}),
  questions: () => request('GET', '/api/questions'),
  state: () => request('GET', '/api/state'),
  saveDraft: (step, draft) => serial(() => request('PUT', '/api/onboarding', { step, draft })),
  confirmProfile: () => serial(() => request('POST', '/api/onboarding/confirm', {})),
  updateProfile: data => serial(() => request('PUT', '/api/profile', data)),
  startSession: (type, topicKey) => serial(() => request('POST', '/api/sessions', { type, topicKey })),
  markShown: () => serial(() => request('POST', '/api/sessions/current/shown', {})),
  answer: (index, choice) => serial(() => request('POST', '/api/sessions/current/answers', { index, choice })),
  advance: index => serial(() => request('POST', '/api/sessions/current/advance', { index })),
  finish: () => serial(() => request('POST', '/api/sessions/current/finish', {})),
  contentReviewed: questionId => serial(() => request('POST', '/api/content-reviews', { questionId })),
  saveForReview: questionId => serial(() => request('POST', '/api/reviews', { questionId })),
  importLocal: (key, raw) => serial(() => request('POST', '/api/import/local', { key, raw })),
  reset: confirm => serial(() => request('POST', '/api/me/reset', { confirm })),
  deleteAccount: (confirm, password) => serial(() => request('POST', '/api/me/delete', { confirm, password })),
  radar: params => request('GET', '/api/radar/processes?' + new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false))),
  radarDetail: id => request('GET', '/api/radar/processes/' + encodeURIComponent(id)),
  tracked: () => request('GET', '/api/radar/tracked'),
  track: (processId, specialty) => serial(() => request('POST', '/api/radar/tracked', { processId, specialty })),
  untrack: processId => serial(() => request('DELETE', '/api/radar/tracked/' + encodeURIComponent(processId)))
};

// ---------- Progresso antigo salvo neste navegador (antes da conta) ----------
// Só lê. Nunca apaga ou altera as chaves antigas; registra apenas uma marcação de "já oferecido".
const LOCAL_KEYS = ['medai-v3', 'medai-v2', 'medai-v1'];
const MARK = 'medai-import';

async function sha256(text) {
  // crypto.subtle só existe em contexto seguro (https ou localhost). Fora dele, uma impressão simples basta
  // para a marcação local; o servidor confere a duplicação com SHA-256 de qualquer forma.
  if (!globalThis.crypto?.subtle) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return 'fnv-' + (h >>> 0).toString(16) + '-' + text.length; }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function findLocalProgress() {
  let storage;
  try { storage = window.localStorage; } catch { return null; }
  for (const key of LOCAL_KEYS) {
    let raw;
    try { raw = storage.getItem(key); } catch { return null; }
    if (!raw) continue;
    let summary = { answers: 0, profile: false, valid: true };
    try { const p = JSON.parse(raw); summary = { answers: Array.isArray(p.answers) ? p.answers.length : 0, profile: !!p.profile?.name, valid: true }; } catch { summary.valid = false; }
    if (!summary.valid || (!summary.answers && !summary.profile)) return null;
    let mark = {};
    try { mark = JSON.parse(storage.getItem(MARK) || '{}'); } catch { mark = {}; }
    const fingerprint = await sha256(raw);
    return { key, raw, fingerprint, ...summary, dismissed: mark.dismissed === fingerprint, imported: mark.imported === fingerprint };
  }
  return null;
}

export function markLocalProgress(fingerprint, kind) {
  try {
    const mark = JSON.parse(window.localStorage.getItem(MARK) || '{}');
    window.localStorage.setItem(MARK, JSON.stringify({ ...mark, [kind]: fingerprint, at: new Date().toISOString() }));
  } catch { /* armazenamento bloqueado: a oferta pode reaparecer, sem risco de duplicação (o servidor confere) */ }
}
