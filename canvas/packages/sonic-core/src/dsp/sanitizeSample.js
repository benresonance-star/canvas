export function sanitizeSample(value) {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) < 1e-20) return 0;
  return value;
}

export function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
