export { resolveElementLayer } from '../bim-core/bimElementLayers.js';

export function formatDisplayValue(value, fallback = '-') {
  if (value == null || value === '') return fallback;
  return String(value);
}
