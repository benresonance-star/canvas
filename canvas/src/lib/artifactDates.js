/**
 * File-backed artifact date helpers (informational — not used for sync CAS).
 */

/**
 * @param {number | string | null | undefined} lastModified
 * @returns {string | null}
 */
export function isoFromLastModified(lastModified) {
  if (lastModified == null || !Number.isFinite(Number(lastModified))) return null;
  return new Date(Number(lastModified)).toISOString();
}

/**
 * @param {string | null | undefined} value
 */
export function formatArtifactDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${day}/${month}/${year} - ${time}`;
}

/**
 * Initial dates for a newly read file version.
 * @param {number | null | undefined} lastModified
 */
export function initialArtifactDates(lastModified) {
  const iso = isoFromLastModified(lastModified);
  if (!iso) return {};
  return { dateCreated: iso };
}

/**
 * Merge file dates when refreshing an existing version from disk.
 * @param {{ dateCreated?: string, dateModified?: string } | null | undefined} existing
 * @param {{ lastModified?: number | null, contentChanged?: boolean }} options
 */
export function mergeArtifactDates(existing, { lastModified, contentChanged = false } = {}) {
  const incoming = isoFromLastModified(lastModified);
  if (!incoming) {
    if (!existing?.dateCreated) return {};
    return {
      dateCreated: existing.dateCreated,
      ...(existing.dateModified ? { dateModified: existing.dateModified } : {}),
    };
  }

  if (!existing?.dateCreated) {
    return { dateCreated: incoming };
  }

  const created = existing.dateCreated;
  const priorModified = existing.dateModified ?? created;
  const fileChanged = contentChanged || incoming > priorModified;

  if (!fileChanged) {
    return {
      dateCreated: created,
      ...(existing.dateModified ? { dateModified: existing.dateModified } : {}),
    };
  }

  return {
    dateCreated: created,
    dateModified: incoming,
  };
}

/**
 * @param {{ dateCreated?: string, dateModified?: string, lastModified?: number } | null | undefined} version
 */
export function artifactDateFieldsFromVersion(version) {
  if (!version) return {};
  const dateCreated =
    version.dateCreated ?? isoFromLastModified(version.lastModified) ?? null;
  const dateModified = version.dateModified ?? null;
  return {
    ...(dateCreated ? { dateCreated } : {}),
    ...(dateModified ? { dateModified } : {}),
  };
}

/**
 * Merge Postgres metadata dates on re-ingest.
 * @param {object} existingMeta
 * @param {object} incomingMeta
 * @param {{ contentChanged?: boolean }} [options]
 */
export function mergeArtifactMetadataDates(
  existingMeta,
  incomingMeta,
  { contentChanged = false } = {},
) {
  return mergeArtifactDates(
    {
      dateCreated: existingMeta?.dateCreated ?? incomingMeta?.dateCreated,
      dateModified: existingMeta?.dateModified ?? incomingMeta?.dateModified,
    },
    {
      lastModified: incomingMeta?.dateModified
        ? new Date(incomingMeta.dateModified).getTime()
        : incomingMeta?.dateCreated
          ? new Date(incomingMeta.dateCreated).getTime()
          : null,
      contentChanged,
    },
  );
}

/**
 * Resolve file-backed dates for an artifact from canvas/dock rows and DB metadata.
 * @param {string | null | undefined} artifactId
 * @param {{ cards?: object[], stagedSyncCards?: object[], meta?: object | null }} [sources]
 */
export function resolveArtifactFileDates(
  artifactId,
  { cards = [], stagedSyncCards = [], meta = null } = {},
) {
  let dateCreated = meta?.dateCreated ?? null;
  let dateModified = meta?.dateModified ?? null;
  if (!artifactId) {
    return { dateCreated, dateModified };
  }

  for (const row of [...(cards ?? []), ...(stagedSyncCards ?? [])]) {
    for (const version of row.versions ?? []) {
      if (version?.artifactRef?.id !== artifactId) continue;
      return {
        dateCreated: version.dateCreated ?? row.dateCreated ?? dateCreated,
        dateModified: version.dateModified ?? row.dateModified ?? dateModified,
      };
    }
  }

  return { dateCreated, dateModified };
}

/**
 * @param {object | null | undefined} before
 * @param {object | null | undefined} after
 */
export function artifactMetadataDatesChanged(before, after) {
  return (before?.dateCreated ?? null) !== (after?.dateCreated ?? null)
    || (before?.dateModified ?? null) !== (after?.dateModified ?? null);
}
