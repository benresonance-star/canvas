import { pool } from '../db.js';
import { DB_UNAVAILABLE_MESSAGE, formatDbError } from '../lib/dbError.js';

/** @param {import('express').Express} app @param {{ isDbReady: () => boolean }} deps */
export function registerHealthRoutes(app, { isDbReady }) {
  app.get('/health', async (_req, res) => {
    if (!isDbReady()) {
      return res.status(503).json({
        ok: false,
        dbReady: false,
        error: DB_UNAVAILABLE_MESSAGE,
      });
    }
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, dbReady: true });
    } catch (e) {
      res.status(503).json({ ok: false, dbReady: false, error: formatDbError(e) });
    }
  });
}
