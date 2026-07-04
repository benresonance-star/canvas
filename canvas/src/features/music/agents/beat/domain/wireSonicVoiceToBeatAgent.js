import { createRelationship, addClusterMembers } from '../../../../../lib/primitivesApi.js';
import { artifactRefFromPinnedVersion } from '../../../../../lib/canvasLinkDrag.js';

export const SONIC_VOICE_BEAT_RELATIONSHIP_TYPE = 'input_to';

export function artifactRefFromCard(card) {
  const pinned = card?.versions?.find((version) => version.version === card.pinnedVersion)
    ?? card?.versions?.[0];
  return artifactRefFromPinnedVersion(pinned);
}

export async function wireSonicVoiceToBeatAgent({
  clusterId,
  sonicCard,
  beatCard,
  trackId = null,
  voiceId = null,
} = {}) {
  const fromRef = artifactRefFromCard(sonicCard);
  const toRef = artifactRefFromCard(beatCard);
  if (!clusterId || !fromRef?.id || !toRef?.id) {
    return { created: false, skipped: true };
  }

  const result = await createRelationship(
    clusterId,
    {
      from_ref: fromRef,
      to_ref: toRef,
      type: SONIC_VOICE_BEAT_RELATIONSHIP_TYPE,
      provenance: [fromRef],
      metadata: {
        source: 'sonic_beat_voice_link',
        linkKind: 'sonic_voice',
        trackId,
        voiceId,
        sonicCardId: sonicCard?.id ?? null,
        beatCardId: beatCard?.id ?? null,
      },
    },
    { idempotent: true },
  );

  await addClusterMembers(clusterId, [fromRef, toRef]);
  return result;
}
