// Utilidades HTTP sem dependências: roteador, leitura de JSON com limite, cookies, cabeçalhos de
// segurança, limitação de taxa e respostas de erro sem detalhes internos.

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  };
  return {
    get: (p, h) => add('GET', p, h), post: (p, h) => add('POST', p, h), put: (p, h) => add('PUT', p, h), delete: (p, h) => add('DELETE', p, h),
    match(method, path) {
      let allowed = false;
      for (const r of routes) {
        const m = r.re.exec(path);
        if (!m) continue;
        if (r.method !== method) { allowed = true; continue; }
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { handler: r.handler, params };
      }
      return allowed ? { methodNotAllowed: true } : null;
    }
  };
}

export async function readJson(req, limitBytes = 1024 * 1024) {
  const type = String(req.headers['content-type'] || '');
  if (!type.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Envie os dados como JSON.');
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limitBytes) throw new HttpError(413, 'Requisição grande demais.');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, 'Requisição grande demais.');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch { throw new HttpError(400, 'JSON inválido.'); }
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k) { try { out[k] = decodeURIComponent(v); } catch { out[k] = v; } }
  }
  return out;
}

export function cookie(name, value, { maxAgeSeconds, secure }) {
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', maxAgeSeconds !== undefined ? `Max-Age=${maxAgeSeconds}` : null, secure ? 'Secure' : null].filter(Boolean).join('; ');
}

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
});

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(payload);
}

// Janela deslizante simples em memória, por chave (ex.: IP + rota). Adequada a um único processo.
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    hit(key, now = Date.now()) {
      const list = (hits.get(key) || []).filter(t => now - t < windowMs);
      list.push(now); hits.set(key, list);
      if (hits.size > 10000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
      return list.length <= max;
    },
    reset(key) { hits.delete(key); }
  };
}

export const clientIp = req => req.socket?.remoteAddress || 'unknown';
