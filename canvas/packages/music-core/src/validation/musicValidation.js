export function validateBeatPattern(pattern) {
  if (!pattern || typeof pattern !== 'object') {
    return { ok: false, reason: 'pattern must be an object' };
  }
  if (!Number.isInteger(pattern.stepCount) || pattern.stepCount < 1 || pattern.stepCount > 128) {
    return { ok: false, reason: 'stepCount must be between 1 and 128' };
  }
  if (!Array.isArray(pattern.tracks) || pattern.tracks.length < 1) {
    return { ok: false, reason: 'tracks are required' };
  }
  for (const track of pattern.tracks) {
    if (!track?.id || !Array.isArray(track.steps)) {
      return { ok: false, reason: 'each track needs an id and steps' };
    }
    if (track.steps.length !== pattern.stepCount) {
      return { ok: false, reason: 'track step length must equal stepCount' };
    }
    for (const step of track.steps) {
      if (typeof step.active !== 'boolean') return { ok: false, reason: 'step.active must be boolean' };
      if (Number(step.velocity) < 0 || Number(step.velocity) > 1) {
        return { ok: false, reason: 'step.velocity must be 0..1' };
      }
      if (Number(step.probability) < 0 || Number(step.probability) > 1) {
        return { ok: false, reason: 'step.probability must be 0..1' };
      }
    }
  }
  return { ok: true };
}

export function assertValidBeatPattern(pattern) {
  const validation = validateBeatPattern(pattern);
  if (!validation.ok) throw new Error(validation.reason);
  return pattern;
}
