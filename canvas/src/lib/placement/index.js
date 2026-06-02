/**
 * Placement domain module — authoritative map, transfer, audit.
 * @see ../../../docs/ARCHITECTURE_MASTER_SPEC.md
 */
export {
  ARTIFACT_PLACEMENTS_VERSION,
  attachArtifactPlacementsToPayload,
  buildPayloadFromAuthoritativePlacements,
  buildPlacementRefFromCard,
  buildPlacementsFromArrays,
  localPlacementShouldWin,
  patchPlacementsMapFromArrays,
  reconcileArtifactPlacements,
} from '../artifactPlacementsMap.js';

export {
  transferPlacementBetweenSurfaces,
  placementMapDiffers,
  buildPlacementTransferPatchOps,
} from '../placementTransfer.js';

export { auditPlacementStep } from '../placementAudit.js';
