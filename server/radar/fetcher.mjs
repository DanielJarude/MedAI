// Coleta HTTP educada: identificação por User-Agent, respeito ao robots.txt, intervalo mínimo por host,
// limite de tamanho, tempo máximo, requisições condicionais (ETag/Last-Modified) e verificação TLS SEMPRE ativa.
// Não contorna autenticação, CAPTCHA nem proteção anti-robô: 401/403/429 viram erro da fonte.
import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Certificados intermediários públicos que alguns servidores oficiais deixam de enviar (cadeia incompleta).
// A cadeia continua validada até uma raiz confiável do Node. Ver DATA_SOURCES.md.
const CERT_DIR = fileURLToPath(new URL('./certs/', import.meta.url));
const EXTRA_CA = readdirSync(CERT_DIR).filter(f => f.endsWith('.pem')).map(f => readFileSync(CERT_DIR + f, 'utf8'));
const agent = new https.Agent({ ca: [...tls.rootCertificates, ...EXTRA_CA], keepAlive: true, maxSockets: 2 });

export class FetchError extends Error {
  constructor(message, { status = null, url, code = null } = {}) { super(message); this.name = 'FetchError'; this.status = status; this.url = url; this.code = code; }
  get unavailable() { return this.status === null || this.status >= 500 || this.status === 404 || this.status === 410; }
}

export function createFetcher({ userAgent, minIntervalMs = 1500, timeoutMs = 25000, maxBytes = 30 * 1024 * 1024, transport = null } = {}) {
  const lastHit = new Map(), robots = new Map();

  async function wait(host) {
    const last = lastHit.get(host) || 0, delta = Date.now() - last;
    if (delta < minIntervalMs) await new Promise(r => setTimeout(r, minIntervalMs - delta));
    lastHit.set(host, Date.now());
  }

  function raw(url, headers, redirects = 0) {
    if (transport) return transport(url, headers);
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : u.protocol === 'http:' ? http : null;
      if (!lib) return reject(new FetchError('Protocolo não suportado', { url }));
      const req = lib.get(u, { agent: u.protocol === 'https:' ? agent : undefined, headers: { 'User-Agent': userAgent, 'Accept-Encoding': 'identity', ...headers }, timeout: timeoutMs }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects >= 5) return reject(new FetchError('Redirecionamentos demais', { url }));
          const next = new URL(res.headers.location, u);
          if (u.protocol === 'https:' && next.protocol !== 'https:') return reject(new FetchError('Redirecionamento inseguro recusado', { url }));
          return resolve(raw(next.href, headers, redirects + 1));
        }
        const chunks = []; let size = 0;
        res.on('data', c => { size += c.length; if (size > maxBytes) { req.destroy(new FetchError('Documento grande demais', { url })); return; } chunks.push(c); });
        res.on('end', () => resolve({ url, status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new FetchError('Tempo de resposta esgotado', { url, code: 'TIMEOUT' })));
      req.on('error', e => reject(e instanceof FetchError ? e : new FetchError(`Falha de conexão (${e.code || e.message})`, { url, code: e.code })));
    });
  }

  // robots.txt: regras para "*" e para o nosso agente. 4xx (exceto 429) = sem restrições; 5xx/erro = não coletar.
  async function allowed(url) {
    const u = new URL(url);
    if (!robots.has(u.origin)) {
      let rules;
      try {
        await wait(u.host);
        const r = await raw(u.origin + '/robots.txt', {});
        rules = r.status >= 200 && r.status < 300 ? parseRobots(r.body.toString('utf8'), userAgent) : r.status >= 400 && r.status < 500 && r.status !== 429 ? [] : null;
      } catch { rules = null; }
      robots.set(u.origin, rules);
    }
    const rules = robots.get(u.origin);
    if (rules === null) return false;
    return isAllowed(rules, u.pathname + u.search);
  }

  return {
    async get(url, { etag = null, lastModified = null, accept = '*/*' } = {}) {
      if (!(await allowed(url))) throw new FetchError('Coleta não permitida pelo robots.txt ou robots.txt indisponível', { url, code: 'ROBOTS' });
      const host = new URL(url).host;
      await wait(host);
      const headers = { Accept: accept };
      if (etag) headers['If-None-Match'] = etag;
      if (lastModified) headers['If-Modified-Since'] = lastModified;
      const r = await raw(url, headers);
      if (r.status === 304) return { ...r, notModified: true };
      if (r.status < 200 || r.status >= 300) throw new FetchError(`HTTP ${r.status}`, { status: r.status, url });
      return r;
    },
    allowed
  };
}

export function parseRobots(text, userAgent) {
  const groups = []; let current = null, lastWasAgent = false;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*(#.*)?$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2];
    if (key === 'user-agent') { if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); } current.agents.push(value.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') current.rules.push({ allow: key === 'allow', path: value });
  }
  const token = String(userAgent).split('/')[0].toLowerCase();
  const mine = groups.filter(g => g.agents.some(a => a !== '*' && token.includes(a)));
  return (mine.length ? mine : groups.filter(g => g.agents.includes('*'))).flatMap(g => g.rules);
}

export function isAllowed(rules, path) {
  let best = null;
  for (const r of rules) {
    if (r.path === '') { if (!r.allow) continue; }
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
