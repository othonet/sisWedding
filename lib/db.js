// Acesso ao banco.
// Produção (Vercel): PostgreSQL do Supabase via DATABASE_URL.
// Desenvolvimento sem DATABASE_URL: PGlite (Postgres embutido) em ./data/pglite,
// criado e populado automaticamente com db/schema.sql e db/seed.sql.
import pg from 'pg';
import { readFile } from 'node:fs/promises';

let dbPromise;

export function getDb() {
  if (!dbPromise) dbPromise = connect();
  return dbPromise;
}

async function connect() {
  const url = process.env.DATABASE_URL;
  if (url) return connectPostgres(url);
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL não configurada nas variáveis de ambiente da Vercel.');
  }
  return connectPglite();
}

function connectPostgres(connectionString) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    ssl: local ? false : { rejectUnauthorized: false },
  });

  return {
    query: (text, params) => pool.query(text, params),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn({ query: (t, p) => client.query(t, p) });
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function connectPglite() {
  // Nome em variável para o empacotador da Vercel não incluir o PGlite.
  const mod = '@electric-sql/pglite';
  const { PGlite } = await import(mod);
  const db = new PGlite('./data/pglite');

  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema);
  const { rows } = await db.query('select count(*)::int as n from gifts');
  if (rows[0].n === 0) {
    const seed = await readFile(new URL('../db/seed.sql', import.meta.url), 'utf8');
    await db.exec(seed);
  }

  return {
    query: (text, params) => db.query(text, params),
    transaction: (fn) => db.transaction((tx) => fn({ query: (t, p) => tx.query(t, p) })),
  };
}
