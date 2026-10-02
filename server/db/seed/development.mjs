// SEED DE DESENVOLVIMENTO (nunca em produção): cria uma conta local de teste, sem nenhum histórico.
// Não cria desempenho, editais, vagas ou datas. Credenciais vêm do ambiente (DEV_USER_EMAIL / DEV_USER_PASSWORD).
import { createAuthService } from '../../services/auth-service.mjs';

export async function seedDevelopment(db, { log = () => {} } = {}) {
  const email = process.env.DEV_USER_EMAIL, password = process.env.DEV_USER_PASSWORD;
  if (!email || !password) { log('DEV_USER_EMAIL/DEV_USER_PASSWORD não definidos: nenhuma conta de desenvolvimento criada.'); return; }
  const auth = createAuthService(db);
  try { await auth.register({ email, password }); log(`conta de desenvolvimento criada: ${email} (sem histórico)`); }
  catch (e) { if (e.status === 409) log(`conta de desenvolvimento já existe: ${email}`); else throw e; }
}
