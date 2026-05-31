/** Crockford base32 ULID (26 chars) — minimal generator */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(now) {
  let time = now;
  let out = '';
  for (let i = 9; i >= 0; i -= 1) {
    const mod = time % 32;
    out = ENCODING[mod] + out;
    time = Math.floor(time / 32);
  }
  return out;
}

function encodeRandom() {
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    out += ENCODING[Math.floor(Math.random() * 32)];
  }
  return out;
}

export function newUlid(now = Date.now()) {
  return encodeTime(now) + encodeRandom();
}

export function isUlid(value) {
  return typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}
