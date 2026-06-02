import {
  DB_UNAVAILABLE_MESSAGE,
  formatDbError,
  isDbConnectionError,
  dbErrorHttpStatus,
} from './dbError.js';

/**
 * @param {() => boolean} isDbReady
 * @returns {(res: import('express').Response) => boolean}
 */
export function createRequireDb(isDbReady) {
  /** @param {import('express').Response} res */
  return function requireDb(res) {
    if (isDbReady()) return true;
    res.status(503).json({ error: DB_UNAVAILABLE_MESSAGE });
    return false;
  };
}

/**
 * @param {import('express').Response} res
 * @param {unknown} e
 * @param {{ validation?: boolean }} [opts]
 */
export function sendClusterError(res, e, opts = {}) {
  if (isDbConnectionError(e)) {
    res.status(503).json({ error: DB_UNAVAILABLE_MESSAGE });
    return;
  }
  const msg = e instanceof Error ? e.message : formatDbError(e);
  if (opts.validation) {
    res.status(400).json({ error: msg });
    return;
  }
  res.status(dbErrorHttpStatus(e)).json({ error: msg });
}
