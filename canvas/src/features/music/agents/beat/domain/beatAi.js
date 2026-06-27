import { validateBeatPattern } from '../../../../../../packages/music-core/src/index.js';

const ALLOWED_PATCH_OPS = new Set(['replace', 'add']);

export function applyBeatAgentJsonPatch(state, patchOps) {
  if (!Array.isArray(patchOps)) {
    return { ok: false, reason: 'AI response must be an array of patch operations' };
  }
  const next = JSON.parse(JSON.stringify(state));
  for (const op of patchOps) {
    if (!ALLOWED_PATCH_OPS.has(op?.op)) return { ok: false, reason: 'unsupported patch op' };
    if (typeof op.path !== 'string' || !op.path.startsWith('/pattern/')) {
      return { ok: false, reason: 'AI may only edit pattern paths' };
    }
    if (next.locks?.[op.path]) return { ok: false, reason: `locked path: ${op.path}` };
    const parts = op.path.split('/').slice(1);
    let target = next;
    for (const part of parts.slice(0, -1)) {
      target = Array.isArray(target) ? target[Number(part)] : target?.[part];
      if (target === undefined) return { ok: false, reason: `invalid path: ${op.path}` };
    }
    const key = parts[parts.length - 1];
    if (Array.isArray(target)) target[Number(key)] = op.value;
    else target[key] = op.value;
  }
  const validation = validateBeatPattern(next.pattern);
  if (!validation.ok) return validation;
  next.updatedAt = new Date().toISOString();
  return { ok: true, state: next };
}

export function buildDeterministicBeatMutation(state, mode = 'similar') {
  const next = JSON.parse(JSON.stringify(state));
  const hat = next.pattern.tracks.find((track) => track.role === 'hat');
  const kick = next.pattern.tracks.find((track) => track.role === 'kick');
  if (mode === 'wild' && kick) {
    for (let index = 0; index < kick.steps.length; index += 1) {
      kick.steps[index].active = index % 3 === 0 || index === 10;
      kick.steps[index].velocity = index % 3 === 0 ? 0.9 : 0.55;
    }
  }
  if (hat) {
    for (let index = 1; index < hat.steps.length; index += 4) {
      hat.steps[index].active = mode !== 'similar';
      hat.steps[index].velocity = 0.45;
      hat.steps[index].probability = mode === 'wild' ? 0.65 : 0.9;
    }
  }
  next.pattern.name = mode === 'wild' ? 'Wild Variation' : 'Similar Variation';
  next.updatedAt = new Date().toISOString();
  return next;
}
