function valuesOverlap(a, b) {
  if (!a || !b) return true;
  if (a.kind === 'universal' || b.kind === 'universal') return true;
  if (a.kind === 'single' && b.kind === 'single') return a.value === b.value;
  if (a.kind === 'single' && b.kind === 'any_of') return b.values.includes(a.value);
  if (a.kind === 'any_of' && b.kind === 'single') return a.values.includes(b.value);
  if (a.kind === 'any_of' && b.kind === 'any_of') {
    return a.values.some((v) => b.values.includes(v));
  }
  if (a.kind === 'range' && b.kind === 'range') {
    return a.from <= b.to && b.from <= a.to;
  }
  if (a.kind === 'range' && b.kind === 'single') {
    return a.from <= b.value && b.value <= a.to;
  }
  if (a.kind === 'single' && b.kind === 'range') {
    return b.from <= a.value && a.value <= b.to;
  }
  return false;
}

export function scopesOverlap(a, b) {
  if (!a?.dimensions || !b?.dimensions) return true;
  const sharedDims = Object.keys(a.dimensions).filter((d) => d in b.dimensions);
  if (sharedDims.length === 0) return true;
  return sharedDims.every((d) => valuesOverlap(a.dimensions[d], b.dimensions[d]));
}
