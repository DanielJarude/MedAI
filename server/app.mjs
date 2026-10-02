// Aplicação HTTP: arquivos estáticos do frontend (dist/) + API REST em /api.
import { readFile, readdir } from 'node:fs/promises';
import { ROOT } from './config.mjs';
import { createRouter, readJson, parseCookies, cookie, sendJson, createRateLimiter, clientIp, HttpError, SECURITY_HEADERS } from './http/http-utils.mjs';
import { DatabaseUnavailableError } from './db/index.mjs';
import { createAuthService } from './services/auth-service.mjs';
import { createStudyService } from './services/study-service.mjs';
import { createRadarService } from './services/radar-service.mjs';
import { QUESTIONS } from '../dist/question-bank.js';

const COOKIE = 'medai_session';
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', svg: 'image/svg+xml' };

export async function createApp({ db, config, clock = () => Date.now(), log = console }) {
  const auth = createAuthService(db, { sessionDays: config.sessionDays });
  const study = createStudyService(db, { clock });
  const radar = createRadarService(db, { clock });
  const authLimiter = createRateLimiter({ windowMs: 15 * 60000, max: 20 });
  const apiLimiter = createRateLimiter({ windowMs: 60000, max: 600 });
  const staticFiles = new Set((await readdir(ROOT + 'dist')).filter(f => /^[a-z0-9-]+\.(html|css|js|svg)$/.test(f)));
  const router = createRouter();

  const setSession = (token, maxAgeSeconds) => ({ 'Set-Cookie': cookie(COOKIE, token, { maxAgeSeconds, secure: config.cookieSecure }) });
  const stateBody = (out, extra = {}) => ({ state: out.state, ...extra });
  const requireConfirm = (body, word) => { if (String(body.confirm || '').trim().toUpperCase() !== word) throw new HttpError(422, `Digite ${word} para confirmar. Nada foi alterado.`); };

  // ---------- Autenticação ----------
  router.post('/api/auth/register', async ({ req, body }) => {
    if (!authLimiter.hit('register:' + clientIp(req))) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    const r = await auth.register({ email: body.email, password: body.password, now: clock() });
    return { status: 201, body: { user: { email: r.user.email } }, headers: setSession(r.token, auth.sessionMaxAgeSeconds) };
  });
  router.post('/api/auth/login', async ({ req, body }) => {
    const key = 'login:' + clientIp(req);
    if (!authLimiter.hit(key)) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    const r = await auth.login({ email: body.email, password: body.password });
    authLimiter.reset(key);
    return { body: { user: { email: r.user.email } }, headers: setSession(r.token, auth.sessionMaxAgeSeconds) };
  });
  router.post('/api/auth/logout', async ({ token }) => { await auth.logout(token); return { body: { ok: true }, headers: setSession('', 0) }; });
  router.get('/api/auth/me', async ({ user }) => ({ body: { user: user ? { email: user.email } : null } }));

  // ---------- Estudo ----------
  const authed = handler => async ctx => { if (!ctx.user) throw new HttpError(401, 'Entre na sua conta para continuar.'); return handler(ctx); };
  router.get('/api/questions', authed(async () => ({ body: { questions: QUESTIONS, note: 'Banco inicial em validação: conteúdo provisório, sem revisão médica registrada.' } })));
  router.get('/api/state', authed(async ({ user }) => { const l = await study.getState(user.id); return { body: { state: l.state, localImport: l.localImport ? { importedAt: l.localImport.importedAt, fingerprint: l.localImport.fingerprint } : null } }; }));
  router.put('/api/onboarding', authed(async ({ user, body }) => ({ body: stateBody(await study.saveDraft(user.id, body)) })));
  router.post('/api/onboarding/confirm', authed(async ({ user }) => ({ body: stateBody(await study.confirmProfile(user.id)) })));
  router.put('/api/profile', authed(async ({ user, body }) => ({ body: stateBody(await study.updateProfile(user.id, body)) })));
  router.post('/api/sessions', authed(async ({ user, body }) => ({ status: 201, body: stateBody(await study.startSession(user.id, { type: body.type, topicKey: body.topicKey })) })));
  router.post('/api/sessions/current/shown', authed(async ({ user }) => ({ body: stateBody(await study.markShown(user.id)) })));
  router.post('/api/sessions/current/answers', authed(async ({ user, body }) => { const o = await study.answer(user.id, body); return { body: stateBody(o, { duplicate: !!o.duplicate, answer: o.answer || null, reviewChange: o.reviewChange || null }) }; }));
  router.post('/api/sessions/current/advance', authed(async ({ user, body }) => ({ body: stateBody(await study.advance(user.id, body)) })));
  router.post('/api/sessions/current/finish', authed(async ({ user }) => ({ body: stateBody(await study.finish(user.id)) })));
  router.post('/api/content-reviews', authed(async ({ user, body }) => ({ body: stateBody(await study.contentReviewed(user.id, body)) })));
  router.post('/api/reviews', authed(async ({ user, body }) => { const o = await study.saveForReview(user.id, body); return { body: stateBody(o, { created: o.created }) }; }));
  router.post('/api/import/local', authed(async ({ user, body }) => { const o = await study.importLocal(user.id, { key: body.key, raw: body.raw }); return { body: stateBody(o, { import: o.import }) }; }));
  router.post('/api/me/reset', authed(async ({ user, body }) => { requireConfirm(body, 'RESETAR'); await study.reset(user.id); return { body: { state: (await study.getState(user.id)).state } }; }));
  router.get('/api/me/export', authed(async ({ user }) => ({ body: await study.exportData(user.id), headers: { 'Content-Disposition': 'attachment; filename="medai-meus-dados.json"' } })));
  router.post('/api/me/delete', authed(async ({ user, body }) => {
    requireConfirm(body, 'EXCLUIR');
    if (!(await auth.verifyUserPassword(user.id, body.password))) throw new HttpError(403, 'Senha incorreta. Nada foi excluído.');
    await auth.deleteUser(user.id);
    return { body: { ok: true }, headers: setSession('', 0) };
  }));

  // ---------- Radar ----------
  router.get('/api/radar/processes', async ({ url, user }) => ({ body: await radar.list(Object.fromEntries(url.searchParams), user?.id) }));
  router.get('/api/radar/processes/:id', async ({ params, user }) => ({ body: await radar.detail(params.id, user?.id) }));
  router.get('/api/radar/sources', async () => ({ body: await radar.sources() }));
  router.get('/api/radar/tracked', authed(async ({ user }) => ({ body: await radar.tracked(user.id) })));
  router.post('/api/radar/tracked', authed(async ({ user, body }) => ({ status: 201, body: await radar.track(user.id, body) })));
  router.delete('/api/radar/tracked/:id', authed(async ({ user, params }) => ({ body: await radar.untrack(user.id, params.id) })));

  router.get('/api/health', async () => {
    try { await db.ping(); return { body: { ok: true, database: 'ok', questions: QUESTIONS.length } }; }
    catch { return { status: 503, body: { ok: false, database: 'unavailable' } }; }
  });

  async function serveStatic(req, res, path) {
    const file = path === '/' ? 'index.html' : path.slice(1);
    if (!staticFiles.has(file) || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado'); return; }
    try {
      const data = await readFile(ROOT + 'dist/' + file);
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[file.split('.').pop()], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(500, SECURITY_HEADERS); res.end('Não foi possível carregar o arquivo'); }
  }

  return async function handle(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); res.end(); return; }
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
    try {
      if (!apiLimiter.hit('api:' + clientIp(req))) throw new HttpError(429, 'Muitas requisições. Aguarde um instante.');
      const match = router.match(req.method, url.pathname);
      if (!match) throw new HttpError(404, 'Rota não encontrada.');
      if (match.methodNotAllowed) throw new HttpError(405, 'Método não permitido.');
      // Proteção CSRF: mutações exigem um cabeçalho que formulários de outros sites não conseguem enviar.
      if (req.method !== 'GET' && req.headers['x-medai-request'] !== '1') throw new HttpError(403, 'Requisição recusada.');
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req, url.pathname === '/api/import/local' ? 6 * 1024 * 1024 : 256 * 1024);
      const token = parseCookies(req.headers.cookie)[COOKIE] || null;
      const user = token ? await auth.userFromToken(token) : null;
      const out = await match.handler({ req, url, body, params: match.params, token, user });
      sendJson(res, out.status || 200, out.body, out.headers);
    } catch (e) {
      if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message, ...e.extra });
      if (e instanceof DatabaseUnavailableError) { log.error?.('[db] indisponível:', e.cause?.code || e.cause?.message || e.message); return sendJson(res, 503, { error: 'O servidor de dados está indisponível no momento. Nada foi perdido; tente novamente em instantes.', code: 'DB_UNAVAILABLE' }); }
      log.error?.('[api] erro inesperado em', req.method, url.pathname, e);
      sendJson(res, 500, { error: 'Ocorreu um erro inesperado. Tente novamente.' });
    }
  };
}
