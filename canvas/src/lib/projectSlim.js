import {
  DATA_URL_PERSIST_MAX_CHARS,
  PROJECT_JSON_SOFT_LIMIT,
  PROJECT_JSON_TRIM_TARGET,
  SLIM_PROJECT_PERSIST_ENABLED,
} from './constants.js';
import { fileTypeFromExt } from './filename.js';

export function stripVersionForPersist(v, opts = {}) {
  const u = { ...v };
  const ext = (u.ext || '').toLowerCase();
  const isImgPdf =
    fileTypeFromExt(ext) === 'image' || fileTypeFromExt(ext) === 'pdf';
  const hadObjectUrl = Boolean(u.objectUrl);
  delete u.objectUrl;

  if (u.previewCacheKey) {
    u.dataUrl = null;
    u.previewStripped = false;
    if (hadObjectUrl) {
      u.inline = false;
    }
  } else if (u.dataUrl && u.dataUrl.length > DATA_URL_PERSIST_MAX_CHARS) {
    u.dataUrl = null;
    u.previewStripped = true;
    u.inline = false;
  } else if (isImgPdf && hadObjectUrl && !u.dataUrl) {
    u.previewStripped = true;
    u.inline = false;
  }

  if (opts.stripNoteContent) {
    const ct = u.cardType || '';
    if (
      (ct === 'user_note' || ct === 'markdown')
      && u.content != null
      && u.content !== ''
    ) {
      return { ...u, content: null, contentStripped: true };
    }
  }

  return u;
}

/**
 * @param {object} card
 * @param {{ stripNoteContent?: boolean, slimCard?: boolean }} [opts]
 */
export function stripCardForPersist(card, opts = {}) {
  const versions = (card.versions ?? []).map((v) =>
    stripVersionForPersist(v, opts),
  );
  if (!opts.slimCard) {
    return { ...card, versions };
  }
  const pinned =
    versions.find((v) => v.version === card.pinnedVersion) || versions[0];
  return {
    id: card.id,
    key: card.key,
    prefix: card.prefix,
    name: card.name,
    type: card.type,
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height,
    pinnedVersion: card.pinnedVersion,
    stagingId: card.stagingId,
    clusterId: card.clusterId,
    versions: pinned ? [pinned] : versions.slice(0, 1),
    ...(card.audioSkinColor ? { audioSkinColor: card.audioSkinColor } : {}),
  };
}

/**
 * @param {object} payload
 * @param {{ stripNoteContent?: boolean }} [opts]
 * @returns {{ payload: object, serialised: string, trimmed: boolean }}
 */
export function slimProjectPayloadForCache(payload, opts = {}) {
  const stripOpts = { stripNoteContent: opts.stripNoteContent ?? false };
  const slimCards = SLIM_PROJECT_PERSIST_ENABLED;
  const slimPlacements = payload.artifactPlacements
    ? Object.fromEntries(
      Object.entries(payload.artifactPlacements).map(([key, entry]) => [
        key,
        {
          surface: entry?.surface,
          placement: entry?.placement,
        },
      ]),
    )
    : payload.artifactPlacements;

  let slim = {
    ...payload,
    cards: (payload.cards ?? []).map((c) =>
      stripCardForPersist(c, { ...stripOpts, slimCard: slimCards }),
    ),
    stagedSyncCards: (payload.stagedSyncCards ?? []).map((s) =>
      stripCardForPersist(s, { ...stripOpts, slimCard: false }),
    ),
    artifactPlacements: slimPlacements,
  };
  let serialised = JSON.stringify(slim);
  let trimmed = false;

  const needsTrim =
    serialised.length > PROJECT_JSON_TRIM_TARGET
    || serialised.length > PROJECT_JSON_SOFT_LIMIT;

  if (!needsTrim) {
    return { payload: slim, serialised, trimmed };
  }

  trimmed = true;
  slim = {
    ...slim,
    cards: slim.cards.map((c) => ({
      ...c,
      versions: (c.versions ?? []).map((v) => {
        const u = { ...v };
        if (u.content && u.content.length > 100_000) {
          return { ...u, content: null, contentStripped: true };
        }
        return u;
      }),
    })),
  };
  serialised = JSON.stringify(slim);

  let guard = 0;
  while (serialised.length > PROJECT_JSON_SOFT_LIMIT && guard++ < 500) {
    let best = null;
    slim.cards.forEach((c, ci) => {
      c.versions.forEach((v, vi) => {
        const len = v.dataUrl?.length ?? 0;
        if (len > (best?.len ?? 0)) best = { kind: 'card', ci, vi, len };
      });
    });
    (slim.stagedSyncCards ?? []).forEach((s, si) => {
      s.versions.forEach((v, vi) => {
        const len = v.dataUrl?.length ?? 0;
        if (len > (best?.len ?? 0)) best = { kind: 'staged', ci: si, vi, len };
      });
    });
    if (!best || best.len === 0) {
      slim.cards.forEach((c, ci) => {
        c.versions.forEach((v, vi) => {
          const len = v.content?.length ?? 0;
          if (len > (best?.len ?? 0)) best = { kind: 'cardContent', ci, vi, len };
        });
      });
    }
    if (!best || best.len === 0) break;
    const v =
      best.kind === 'staged'
        ? slim.stagedSyncCards[best.ci].versions[best.vi]
        : slim.cards[best.ci].versions[best.vi];
    if (best.kind === 'cardContent') {
      v.content = null;
      v.contentStripped = true;
    } else {
      v.dataUrl = null;
      if (!v.previewCacheKey) {
        v.previewStripped = true;
        v.inline = false;
      }
    }
    serialised = JSON.stringify(slim);
  }

  return { payload: slim, serialised, trimmed };
}

export function estimateSerialisedSize(payload) {
  try {
    return JSON.stringify(payload).length;
  } catch {
    return 0;
  }
}
