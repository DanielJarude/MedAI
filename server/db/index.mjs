// Acesso ao banco. Uma interface mínima para PostgreSQL (produção, via `pg`) e PGlite (PostgreSQL
// embutido em WebAssembly, para desenvolvimento e testes). O SQL é o mesmo nos dois.
//   DATABASE_URL=postgres://usuario:senha@host:5432/medai   → PostgreSQL
//   DATABASE_URL=pglite:./data/pglite                       → PGlite em disco
//   DATABASE_URL=pglite:memory                              → PGlite em memória (testes)
// Todas as consultas usam parâmetros ($1, $2...); nunca concatenar valores do usuário no SQL.

export class DatabaseUnavailableError extends Error {
  constructor(cause) { super('Banco de dados indisponível'); this.name = 'DatabaseUnavailableError'; this.cause = cause; }
}

const isConnectionError = e => e instanceof DatabaseUnavailableError || ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', '57P01', '57P03', '08006', '08001', '08003'].includes(e?.code);
const wrap = e => isConnectionError(e) && !(e instanceof DatabaseUnavailableError) ? new DatabaseUnavailableError(e) : e;

export async function openDatabase(url) {
  if (!url) throw new Error('DATABASE_URL não configurada. Veja .env.example.');
  if (url.startsWith('pglite:')) return openPglite(url.slice('pglite:'.length));
  if (/^postgres(ql)?:\/\//.test(url)) return openPostgres(url);
  throw new Error('DATABASE_URL deve começar com postgres://, postgresql:// ou pglite:');
}

async function openPglite(location) {
  const { PGlite } = await import('@electric-sql/pglite');
  // DATE como texto 'AAAA-MM-DD', igual ao adaptador PostgreSQL.
  const options = { parsers: { 1082: v => v } };
  const pg = location === 'memory' || location === '' ? new PGlite(options) : new PGlite(location, options);
  await pg.waitReady;
  const run = (target, sql, params) => target.query(sql, params);
  return {
    kind: 'pglite',
    query: (sql, params = []) => run(pg, sql, params),
    exec: sql => pg.exec(sql),
    tx: fn => pg.transaction(tx => fn({ query: (sql, params = []) => run(tx, sql, params), exec: sql => tx.exec(sql) })),
    ping: () => pg.query('SELECT 1'),
    close: () => pg.close()
  };
}

async function openPostgres(url) {
  const { default: pgLib } = await import('pg');
  // DATE como texto 'AAAA-MM-DD': evita conversão para meia-noite local e mudança de dia.
  pgLib.types.setTypeParser(1082, v => v);
  const pool = new pgLib.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX) || 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  pool.on('error', () => {}); // conexões ociosas perdidas: a próxima consulta reporta o erro
  const query = async (sql, params = []) => { try { return await pool.query(sql, params); } catch (e) { throw wrap(e); } };
  return {
    kind: 'postgres',
    query,
    exec: sql => query(sql),
    async tx(fn) {
      let client;
      try { client = await pool.connect(); } catch (e) { throw wrap(e); }
      try {
        await client.query('BEGIN');
        const out = await fn({ query: (sql, params = []) => client.query(sql, params), exec: sql => client.query(sql) });
        await client.query('COMMIT');
        return out;
      } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw wrap(e); } finally { client.release(); }
    },
    ping: () => query('SELECT 1'),
    close: () => pool.end()
  };
}
