export function isValidFragmentsLocalId(localId) {
  return Number.isInteger(localId) && localId >= 0;
}

export async function resolveFragmentsLocalIdByGlobalId(model, globalId) {
  if (!model || !globalId || typeof model.getLocalIdsByGuids !== 'function') return null;
  const [localId] = await model.getLocalIdsByGuids([globalId]);
  return isValidFragmentsLocalId(localId) ? localId : null;
}

export async function resolveFragmentsGlobalIdByLocalId(model, localId) {
  if (!model || !isValidFragmentsLocalId(localId) || typeof model.getGuidsByLocalIds !== 'function') return null;
  const [globalId] = await model.getGuidsByLocalIds([localId]);
  return globalId || null;
}
