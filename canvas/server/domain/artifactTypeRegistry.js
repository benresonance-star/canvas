const registrations = Object.freeze({
  agent: { defaultCapabilities: ['canRun', 'canProduceArtifacts', 'canReference'] },
  flow: { defaultCapabilities: ['canHaveState', 'canContain', 'canReference'] },
  studio: { defaultCapabilities: ['canHaveState', 'canContain', 'canReference', 'canRun', 'canReview'] },
  live: { defaultCapabilities: ['canRun', 'canVersion', 'canHaveState'] },
  image: { defaultCapabilities: ['canReview', 'canTransform', 'canBranch', 'canReference'] },
  audio: { defaultCapabilities: ['canReview', 'canTransform', 'canReference'] },
  video: { defaultCapabilities: ['canReview', 'canTransform', 'canReference'] },
  '3d_model': { defaultCapabilities: ['canReview', 'canBranch', 'canReference'] },
  bim_model: { defaultCapabilities: ['canReview', 'canBranch', 'canReference'] },
  user_note: {
    defaultCapabilities: ['canEdit', 'canReview', 'canReference'],
    supportedViewTypes: ['card'],
  },
  user_task: { defaultCapabilities: ['canEdit', 'canReview', 'canReference'] },
  agent_chat: { defaultCapabilities: ['canEdit', 'canReview', 'canReference'] },
});

const fallbackRegistration = Object.freeze({
  defaultCapabilities: Object.freeze(['canReference']),
  supportedViewTypes: Object.freeze([]),
});

export function getArtifactTypeRegistration(type) {
  const registration = registrations[type];
  if (!registration) return fallbackRegistration;
  return {
    ...registration,
    defaultCapabilities: [...registration.defaultCapabilities],
    supportedViewTypes: [...(registration.supportedViewTypes ?? [])],
  };
}

export function defaultCapabilitiesForArtifactType(type) {
  return [...getArtifactTypeRegistration(type).defaultCapabilities];
}

export function listArtifactTypeRegistrations() {
  return Object.entries(registrations).map(([type, registration]) => ({
    type,
    ...getArtifactTypeRegistration(type),
    metadata: registration.metadata ?? {},
  }));
}
