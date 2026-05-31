import pg from 'pg';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://canvas:canvas@localhost:5432/canvas';

export const pool = new Pool({ connectionString });

export { pool as defaultPool };

export async function query(text, params) {
  return pool.query(text, params);
}
