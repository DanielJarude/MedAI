// Contas com e-mail e senha (scrypt) e sessões por cookie HttpOnly. O token só existe no cookie;
// o banco guarda o hash SHA-256 dele. Sem recuperação de senha por e-mail nesta versão (ver BACKEND.md).
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, passwordProblem } from '../auth/passwords.mjs';
import { createInitialState } from '../../dist/profile-model.js';
import { HttpError } from '../http/http-utils.mjs';

const sha256 = v => createHash('sha256').update(v).digest('hex');
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
// Hash de referência para comparar quando o e-mail não existe (tempo de resposta semelhante).
let dummyHash = null;

export function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }

export function createAuthService(db, { sessionDays = 30 } = {}) {
  async function createSession(userId) {
    const token = randomBytes(32).toString('base64url');
    await db.query('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))', [sha256(token), userId, sessionDays]);
    return token;
  }
  return {
    sessionMaxAgeSeconds: sessionDays * 86400,
    async register({ email, password, now = Date.now() }) {
      email = normalizeEmail(email);
      const errors = {};
      if (!EMAIL.test(email)) errors.email = 'Informe um e-mail válido.';
      const pw = passwordProblem(password);
      if (pw) errors.password = pw;
      if (Object.keys(errors).length) throw new HttpError(422, 'Revise os campos destacados.', { errors });
      const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
      if (exists.rows.length) throw new HttpError(409, 'Já existe uma conta com este e-mail. Entre com sua senha.', { errors: { email: 'E-mail já cadastrado.' } });
      const id = randomUUID(), hash = await hashPassword(password);
      const meta = createInitialState(now).meta;
      try {
        await db.tx(async tx => {
          await tx.query('INSERT INTO users (id, email, password_hash, last_login_at) VALUES ($1, $2, $3, now())', [id, email, hash]);
          await tx.query('INSERT INTO student_profiles (user_id, meta) VALUES ($1, $2)', [id, JSON.stringify(meta)]);
        });
      } catch (e) {
        if (e?.code === '23505') throw new HttpError(409, 'Já existe uma conta com este e-mail. Entre com sua senha.', { errors: { email: 'E-mail já cadastrado.' } });
        throw e;
      }
      return { user: { id, email }, token: await createSession(id) };
    },
    async login({ email, password }) {
      email = normalizeEmail(email);
      const row = (await db.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email])).rows[0];
      if (!row) {
        dummyHash ||= await hashPassword('medai-referencia-de-tempo');
        await verifyPassword(String(password || ''), dummyHash);
        throw new HttpError(401, 'E-mail ou senha incorretos.');
      }
      if (!(await verifyPassword(String(password || ''), row.password_hash))) throw new HttpError(401, 'E-mail ou senha incorretos.');
      await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);
      return { user: { id: row.id, email: row.email }, token: await createSession(row.id) };
    },
    async logout(token) { if (token) await db.query('DELETE FROM auth_sessions WHERE token_hash = $1', [sha256(token)]); },
    async userFromToken(token) {
      if (!token || token.length > 200) return null;
      const row = (await db.query('SELECT u.id, u.email FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [sha256(token)])).rows[0];
      if (!row) return null;
      await db.query('UPDATE auth_sessions SET last_seen_at = now() WHERE token_hash = $1', [sha256(token)]);
      return row;
    },
    async verifyUserPassword(userId, password) {
      const row = (await db.query('SELECT password_hash FROM users WHERE id = $1', [userId])).rows[0];
      return !!row && verifyPassword(String(password || ''), row.password_hash);
    },
    async deleteUser(userId) { await db.query('DELETE FROM users WHERE id = $1', [userId]); },
    async purgeExpiredSessions() { await db.query('DELETE FROM auth_sessions WHERE expires_at < now()'); }
  };
}
