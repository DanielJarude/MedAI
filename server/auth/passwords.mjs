// Senhas com scrypt (node:crypto). Formato: scrypt$N$r$p$salt(base64)$hash(base64). Nunca em texto puro.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };
const derive = (password, salt, { N, r, p, keylen }) => new Promise((resolve, reject) =>
  scrypt(password.normalize('NFKC'), salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (e, key) => e ? reject(e) : resolve(key)));

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p), keylen: expected.length });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Regras mínimas: 10+ caracteres. Sem regras de composição artificiais.
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Use uma senha com pelo menos 10 caracteres.';
  if (password.length > 200) return 'Use uma senha com até 200 caracteres.';
  return null;
}
