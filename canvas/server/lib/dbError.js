export const DB_UNAVAILABLE_MESSAGE =
  'Database unavailable. Start Docker Desktop, then run: npm run db:up && npm run db:migrate';

/**
 * @param {unknown} e
 * @returns {string}
 */
export function formatDbError(e) {
  if (!e || typeof e !== 'object') return 'Database unreachable';
  const err = /** @type {{ message?: string, code?: string, errors?: { message?: string }[] }} */ (e);
  if (err.errors?.[0]?.message) return err.errors[0].message;
  if (err.code) {
    return err.message ? `${err.code}: ${err.message}` : `${err.code}: database unreachable`;
  }
  return err.message || 'Database unreachable';
}

/**
 * @param {unknown} e
 * @returns {boolean}
 */
export function isDbConnectionError(e) {
  if (!e || typeof e !== 'object') return false;
  const err = /** @type {{ message?: string, code?: string, errors?: unknown[] }} */ (e);
  if (Array.isArray(err.errors) && err.errors.some(isDbConnectionError)) return true;
  const code = err.code;
  if (
    code === 'ECONNREFUSED'
    || code === 'ENOTFOUND'
    || code === 'ETIMEDOUT'
    || code === 'ECONNRESET'
    || code === '57P01'
    || code === '53300'
  ) {
    return true;
  }
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('connect') && msg.includes('refused')) return true;
  if (msg.includes('timeout expired') || msg.includes('connection terminated')) return true;
  return false;
}

/**
 * @param {unknown} e
 * @returns {number}
 */
export function dbErrorHttpStatus(e) {
  return isDbConnectionError(e) ? 503 : 400;
}
