import { canonicalKeyForEntry } from '../artifactPlacement.js';
import {
  ARTIFACT_PLACEMENTS_VERSION,
  attachArtifactPlacementsToPayload,
  buildPlacementRefFromCard,
  patchPlacementsMapFromArrays,
} from '../artifactPlacementsMap.js';
import { validatePatchOpsSchema } from '../schemas/projectSyncSchemas.js';

export const MAX_PATCH_OPS = 32;
export const MAX_PATCH_BODY_BYTES = 256 * 1024;

/**
 * @typedef {{
 *   op: 'setCanvasView',
 *   view: { x: number, y: number, zoom: number },
 * }} SetCanvasViewOp
 * @typedef {{
 *   op: 'setCardLayout',
 *   id: string,
 *   x?: number,
 *   y?: number,
 *   width?: number,
 *   height?: number,
 * }} SetCardLayoutOp
 * @typedef {{
 *   op: 'setPlacement',
 *   key: string,
 *   surface: 'canvas' | 'dock',
 *   ref?: object | null,
 * }} SetPlacementOp
 * @typedef {{ op: 'upsertCard', card: object }} UpsertCardOp
 * @typedef {{ op: 'removeCard', id: string }} RemoveCardOp
 * @typedef {{ op: 'upsertStaged', staged: object }} UpsertStagedOp
 * @typedef {{ op: 'removeStaged', stagingId: string }} RemoveStagedOp
 * @typedef {{ op: 'setProjectName', projectName: string }} SetProjectNameOp
 * @typedef {{ op: 'replaceDocument', payload: object }} ReplaceDocumentOp
 * @typedef {
 *   | SetCanvasViewOp
 *   | SetCardLayoutOp
 *   | SetPlacementOp
 *   | UpsertCardOp
 *   | RemoveCardOp
 *   | UpsertStagedOp
 *   | RemoveStagedOp
 *   | SetProjectNameOp
 *   | ReplaceDocumentOp
 * } ProjectPatchOp
 */

function clonePayload(base) {
  return base && typeof base === 'object' ? structuredClone(base) : {};
}

function layoutFieldsEqual(a, b) {
  return (
    (a?.x ?? 0) === (b?.x ?? 0)
    && (a?.y ?? 0) === (b?.y ?? 0)
    && (a?.width ?? undefined) === (b?.width ?? undefined)
    && (a?.height ?? undefined) === (b?.height ?? undefined)
  );
}

function viewEqual(a, b) {
  return (
    (a?.x ?? 0) === (b?.x ?? 0)
    && (a?.y ?? 0) === (b?.y ?? 0)
    && (a?.zoom ?? 1) === (b?.zoom ?? 1)
  );
}

function placementRefEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param {ProjectPatchOp[]} ops
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateProjectPatchOps(ops) {
  if (!Array.isArray(ops) || ops.length === 0) {
    return { ok: false, reason: 'empty_ops' };
  }
  const schemaResult = validatePatchOpsSchema(ops);
  if (!schemaResult.ok) {
    return { ok: false, reason: schemaResult.reason };
  }
  if (ops.length > MAX_PATCH_OPS) {
    return { ok: false, reason: 'too_many_ops' };
  }
  let bytes = 2;
  for (const op of ops) {
    if (!op?.op) return { ok: false, reason: 'missing_op' };
    bytes += JSON.stringify(op).length;
    if (bytes > MAX_PATCH_BODY_BYTES) {
      return { ok: false, reason: 'body_too_large' };
    }
    switch (op.op) {
      case 'setCanvasView':
        if (!op.view || typeof op.view !== 'object') {
          return { ok: false, reason: 'invalid_view' };
        }
        break;
      case 'setCardLayout':
        if (!op.id) return { ok: false, reason: 'invalid_card_layout' };
        break;
      case 'setPlacement':
        if (!op.key || (op.surface !== 'canvas' && op.surface !== 'dock')) {
          return { ok: false, reason: 'invalid_placement' };
        }
        break;
      case 'upsertCard':
        if (!op.card?.id) return { ok: false, reason: 'invalid_card' };
        break;
      case 'removeCard':
        if (!op.id) return { ok: false, reason: 'invalid_remove_card' };
        break;
      case 'upsertStaged':
        if (!op.staged?.stagingId) return { ok: false, reason: 'invalid_staged' };
        break;
      case 'removeStaged':
        if (!op.stagingId) return { ok: false, reason: 'invalid_remove_staged' };
        break;
      case 'setProjectName':
        if (typeof op.projectName !== 'string') {
          return { ok: false, reason: 'invalid_project_name' };
        }
        break;
      case 'replaceDocument':
        if (!op.payload || typeof op.payload !== 'object') {
          return { ok: false, reason: 'invalid_replace' };
        }
        break;
      default:
        return { ok: false, reason: 'unknown_op' };
    }
  }
  return { ok: true };
}

/**
 * @param {object | null | undefined} base
 * @param {ProjectPatchOp[]} ops
 * @returns {object}
 */
export function applyProjectOps(base, ops) {
  const validated = validateProjectPatchOps(ops);
  if (!validated.ok) {
    throw new Error(`Invalid patch ops: ${validated.reason}`);
  }

  for (const op of ops) {
    if (op.op === 'replaceDocument') {
      return finalizePayload(clonePayload(op.payload));
    }
  }

  const doc = clonePayload(base);
  doc.cards = Array.isArray(doc.cards) ? [...doc.cards] : [];
  doc.stagedSyncCards = Array.isArray(doc.stagedSyncCards) ? [...doc.stagedSyncCards] : [];
  doc.artifactPlacements =
    doc.artifactPlacements && typeof doc.artifactPlacements === 'object'
      ? { ...doc.artifactPlacements }
      : {};

  for (const op of ops) {
    switch (op.op) {
      case 'setCanvasView':
        doc.canvasView = { ...op.view };
        break;
      case 'setCardLayout': {
        const idx = doc.cards.findIndex((c) => c.id === op.id);
        if (idx >= 0) {
          const card = { ...doc.cards[idx] };
          if (op.x !== undefined) card.x = op.x;
          if (op.y !== undefined) card.y = op.y;
          if (op.width !== undefined) card.width = op.width;
          if (op.height !== undefined) card.height = op.height;
          doc.cards[idx] = card;
        }
        break;
      }
      case 'setPlacement': {
        const key =
          op.key
          || (op.ref ? canonicalKeyForEntry(op.ref) : '');
        if (!key) break;
        if (op.surface === 'canvas') {
          doc.stagedSyncCards = doc.stagedSyncCards.filter(
            (s) => canonicalKeyForEntry(s) !== key,
          );
          if (op.ref?.id) {
            const existingIdx = doc.cards.findIndex((c) => c.id === op.ref.id);
            if (existingIdx >= 0) {
              doc.cards[existingIdx] = { ...doc.cards[existingIdx], ...op.ref };
            } else {
              doc.cards.push({ ...op.ref });
            }
          }
        } else {
          doc.cards = doc.cards.filter((c) => canonicalKeyForEntry(c) !== key);
          if (op.ref?.stagingId) {
            const sIdx = doc.stagedSyncCards.findIndex(
              (s) => s.stagingId === op.ref.stagingId,
            );
            if (sIdx >= 0) {
              doc.stagedSyncCards[sIdx] = { ...doc.stagedSyncCards[sIdx], ...op.ref };
            } else {
              doc.stagedSyncCards.push({ ...op.ref });
            }
          }
        }
        doc.artifactPlacements[key] = {
          surface: op.surface,
          ref: op.ref ?? null,
        };
        break;
      }
      case 'upsertCard': {
        const idx = doc.cards.findIndex((c) => c.id === op.card.id);
        if (idx >= 0) {
          doc.cards[idx] = { ...doc.cards[idx], ...op.card };
        } else {
          doc.cards.push({ ...op.card });
        }
        break;
      }
      case 'removeCard':
        doc.cards = doc.cards.filter((c) => c.id !== op.id);
        break;
      case 'upsertStaged': {
        const idx = doc.stagedSyncCards.findIndex(
          (s) => s.stagingId === op.staged.stagingId,
        );
        if (idx >= 0) {
          doc.stagedSyncCards[idx] = { ...doc.stagedSyncCards[idx], ...op.staged };
        } else {
          doc.stagedSyncCards.push({ ...op.staged });
        }
        break;
      }
      case 'removeStaged':
        doc.stagedSyncCards = doc.stagedSyncCards.filter(
          (s) => s.stagingId !== op.stagingId,
        );
        break;
      case 'setProjectName':
        doc.projectName = op.projectName;
        break;
      default:
        break;
    }
  }

  return finalizePayload(doc);
}

function finalizePayload(doc) {
  const patched = patchPlacementsMapFromArrays(
    doc.artifactPlacements ?? {},
    doc.cards ?? [],
    doc.stagedSyncCards ?? [],
  );
  return attachArtifactPlacementsToPayload(
    {
      ...doc,
      artifactPlacements: patched,
      artifactPlacementsVersion: ARTIFACT_PLACEMENTS_VERSION,
    },
    doc.stagedSyncCards ?? [],
  );
}

/**
 * @param {object | null} before
 * @param {object | null} after
 * @param {string} [reason]
 * @returns {ProjectPatchOp[]}
 */
export function buildPatchOpsFromCommit(before, after, reason = 'commit') {
  if (!after) return [];
  if (!before) {
    return [{ op: 'replaceDocument', payload: after }];
  }

  /** @type {ProjectPatchOp[]} */
  const ops = [];

  const beforeView = before.canvasView ?? { x: 0, y: 0, zoom: 1 };
  const afterView = after.canvasView ?? { x: 0, y: 0, zoom: 1 };
  if (!viewEqual(beforeView, afterView)) {
    ops.push({ op: 'setCanvasView', view: afterView });
  }

  if ((before.projectName ?? '') !== (after.projectName ?? '')) {
    ops.push({ op: 'setProjectName', projectName: after.projectName ?? '' });
  }

  const beforeCards = new Map((before.cards ?? []).map((c) => [c.id, c]));
  const afterCards = new Map((after.cards ?? []).map((c) => [c.id, c]));

  for (const [id, card] of afterCards) {
    const prev = beforeCards.get(id);
    if (!prev) {
      ops.push({ op: 'upsertCard', card });
      const key = canonicalKeyForEntry(card);
      if (key) {
        ops.push({
          op: 'setPlacement',
          key,
          surface: 'canvas',
          ref: buildPlacementRefFromCard(card),
        });
      }
    } else if (!layoutFieldsEqual(prev, card) || JSON.stringify(prev) !== JSON.stringify(card)) {
      if (!layoutFieldsEqual(prev, card)) {
        ops.push({
          op: 'setCardLayout',
          id,
          x: card.x,
          y: card.y,
          width: card.width,
          height: card.height,
        });
      }
      if (JSON.stringify(prev) !== JSON.stringify(card)) {
        ops.push({ op: 'upsertCard', card });
      }
    }
  }
  for (const [id] of beforeCards) {
    if (!afterCards.has(id)) {
      ops.push({ op: 'removeCard', id });
    }
  }

  const beforeStaged = new Map(
    (before.stagedSyncCards ?? []).map((s) => [s.stagingId, s]),
  );
  const afterStaged = new Map(
    (after.stagedSyncCards ?? []).map((s) => [s.stagingId, s]),
  );
  for (const [stagingId, staged] of afterStaged) {
    const prev = beforeStaged.get(stagingId);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(staged)) {
      ops.push({ op: 'upsertStaged', staged });
      const key = canonicalKeyForEntry(staged);
      if (key && !afterCards.has(staged.id)) {
        const onCanvas = [...afterCards.values()].some(
          (c) => canonicalKeyForEntry(c) === key,
        );
        if (!onCanvas) {
          ops.push({
            op: 'setPlacement',
            key,
            surface: 'dock',
            ref: buildPlacementRefFromCard(staged),
          });
        }
      }
    }
  }
  for (const [stagingId] of beforeStaged) {
    if (!afterStaged.has(stagingId)) {
      ops.push({ op: 'removeStaged', stagingId });
    }
  }

  const beforePlacements = before.artifactPlacements ?? {};
  const afterPlacements = after.artifactPlacements ?? {};
  const placementKeys = new Set([
    ...Object.keys(beforePlacements),
    ...Object.keys(afterPlacements),
  ]);
  for (const key of placementKeys) {
    const b = beforePlacements[key];
    const a = afterPlacements[key];
    const bSurface = b?.surface ?? b?.placement?.surface;
    const aSurface = a?.surface ?? a?.placement?.surface;
    if (bSurface !== aSurface || !placementRefEqual(b?.ref ?? b?.record, a?.ref ?? a?.record)) {
      if (a && aSurface) {
        const already = ops.some(
          (o) => o.op === 'setPlacement' && o.key === key,
        );
        if (!already) {
          ops.push({
            op: 'setPlacement',
            key,
            surface: aSurface,
            ref: a?.ref ?? a?.record ?? null,
          });
        }
      }
    }
  }

  if (ops.length === 0) {
    return [];
  }

  const validation = validateProjectPatchOps(ops);
  if (!validation.ok || ops.length > MAX_PATCH_OPS) {
    return [{ op: 'replaceDocument', payload: after }];
  }

  return ops;
}

/**
 * @param {ProjectPatchOp[]} ops
 * @returns {boolean}
 */
export function shouldUsePatchForOps(ops) {
  if (!ops?.length) return false;
  if (ops.length === 1 && ops[0].op === 'replaceDocument') return false;
  return validateProjectPatchOps(ops).ok;
}

/**
 * @param {ProjectPatchOp[]} ops
 * @returns {number}
 */
export function estimatePatchBodyBytes(ops) {
  return JSON.stringify({ ops }).length;
}
