import { artifactTypeFromFile } from './artifactType.js';
import { normalizeFolderRelativePath, syncKeysMatch } from '../filename.js';
import { ingestArtifacts, ensureClusterForProject, isApiAvailable } from '../primitivesApi.js';

function artifactFileKey(version) {
  return normalizeFolderRelativePath(version?.relativePath ?? version?.filename);
}

/**
 * Ingest synced files as artifacts; return map filename -> { artifactRef, content_hash }
 */
export async function ingestFoundFiles(projectId, projectName, flatVersions, previousArtifactsByKey = {}) {
  const available = await isApiAvailable();
  if (!available) {
    return { ok: false, reason: 'api_unavailable', byFilename: {} };
  }

  await ensureClusterForProject(projectId, projectName);

  const files = flatVersions.map((v) => {
    const bookmarkPreview = v.bookmarkPreview ?? {};
    return {
      type: artifactTypeFromFile(v.filename, { cardType: v.cardType }),
      uri: v.cardType === 'bookmark' && v.externalUrl
        ? v.externalUrl
        : `folder-relative:${projectId}/${artifactFileKey(v)}`,
      content_hash: v.content_hash,
      version: String(v.version ?? 1),
      retrieved_at: new Date(v.lastModified || Date.now()).toISOString(),
      payload_text: v.cardType === 'bookmark' ? null : (v.content ?? null),
      metadata: {
        filename: v.filename,
        relativePath: v.relativePath ?? null,
        cardKey: v.cardKey ?? null,
        prefix: v.prefix,
        name: v.name,
        ...(v.cardType === 'bookmark'
          ? {
              canvas_kind: 'bookmark',
              external_url: v.externalUrl ?? null,
              title: bookmarkPreview.title ?? v.name ?? null,
              description: bookmarkPreview.description ?? null,
              site_name: bookmarkPreview.siteName ?? null,
              image_url: bookmarkPreview.imageUrl ?? null,
              favicon_url: bookmarkPreview.faviconUrl ?? null,
              fetched_at: bookmarkPreview.fetchedAt ?? null,
            }
          : {}),
        ...(v.cardType === 'spreadsheet' ? { file_kind: 'spreadsheet' } : {}),
        ...(v.cardType === 'user_note' ? { canvas_kind: 'user_note' } : {}),
        ...(v.cardType === 'agent_chat'
          ? {
              canvas_kind: 'agent_chat',
              connectorId: v.connectorId ?? null,
              connectorLabel: v.connectorLabel ?? null,
            }
          : {}),
        ...(v.cardType === 'audio' && v.audioMeta
          ? { canvas_kind: 'audio', audio: v.audioMeta }
          : {}),
      },
    };
  });

  const ingestRes = await ingestArtifacts(projectId, { files, relationships: [] });

  const byFilename = {};
  for (const a of ingestRes.artifacts || []) {
    for (const v of flatVersions) {
      if (v.content_hash === a.content_hash) {
        const key = artifactFileKey(v);
        const value = {
          content_hash: a.content_hash,
          artifactRef: a.artifactRef,
        };
        byFilename[key] = value;
        if (!v.relativePath) byFilename[v.filename] = value;
      }
    }
  }

  const relationships = [];
  for (const v of flatVersions) {
    const prev = previousArtifactsByKey[v.cardKey];
    const current = byFilename[artifactFileKey(v)]?.artifactRef;
    if (prev?.id && current?.id && prev.id !== current.id) {
      relationships.push({
        from_ref: current,
        to_ref: prev,
        type: 'supersedes',
        provenance: [current],
      });
    }
  }

  if (relationships.length > 0) {
    await ingestArtifacts(projectId, { files: [], relationships });
  }

  const clusterId = ingestRes.clusterId;
  if (clusterId) {
    const { ingestLinksFromVersions, buildCardKeyToArtifactRef } = await import('./linkIngest.js');
    const cardKeyToRef = buildCardKeyToArtifactRef(
      [],
      Object.fromEntries(
        flatVersions.map((v) => [
          v.cardKey,
          { versions: [{ ...v, artifactRef: byFilename[artifactFileKey(v)]?.artifactRef }] },
        ]),
      ),
    );
    for (const v of flatVersions) {
      const ing = byFilename[artifactFileKey(v)];
      if (ing?.artifactRef) cardKeyToRef.set(v.cardKey, ing.artifactRef);
    }
    const flatWithRefs = flatVersions.map((v) => ({
      ...v,
      artifactRef: byFilename[artifactFileKey(v)]?.artifactRef,
    }));
    await ingestLinksFromVersions({
      clusterId,
      flatVersions: flatWithRefs,
      cardKeyToRef,
    });
  }

  return {
    ok: true,
    clusterId,
    byFilename,
  };
}

export function buildPreviousArtifactMap(cards) {
  const map = {};
  for (const card of cards ?? []) {
    const versions = card.versions ?? [];
    const pinned =
      versions.find((ver) => ver.version === card.pinnedVersion) || versions[0];
    if (pinned?.artifactRef) {
      map[card.key] = pinned.artifactRef;
    }
  }
  return map;
}

/**
 * @param {Record<string, object>} grouped
 * @param {string} cardKey
 */
function findGroupedByCardKey(grouped, cardKey) {
  if (!grouped || !cardKey) return null;
  const matchKey = Object.keys(grouped).find((k) => syncKeysMatch(k, cardKey));
  return matchKey ? grouped[matchKey] : null;
}

/** Apply artifact refs from sync ingest onto existing canvas cards */
export function mergeArtifactRefsIntoCards(cards, grouped) {
  if (!grouped) return cards ?? [];
  return (cards ?? []).map((card) => {
    const group = findGroupedByCardKey(grouped, card.key);
    if (!group?.versions) return card;
    return {
      ...card,
      versions: (card.versions ?? []).map((v) => {
        const disk = group.versions.find((d) => d.version === v.version);
        if (!disk?.artifactRef) return v;
        if (v.artifactRef?.id === disk.artifactRef.id) return v;
        return {
          ...v,
          artifactRef: disk.artifactRef,
          artifactSyncState: 'synced',
          content_hash: disk.content_hash ?? v.content_hash,
        };
      }),
    };
  });
}

export function applyArtifactRefsToGrouped(grouped, byFilename) {
  const out = { ...grouped };
  for (const [key, group] of Object.entries(out)) {
    out[key] = {
      ...group,
      versions: (group.versions ?? []).map((v) => {
        const ing = byFilename[artifactFileKey(v)];
        if (!ing?.artifactRef) return v;
        return {
          ...v,
          content_hash: ing.content_hash,
          artifactRef: ing.artifactRef,
          artifactSyncState: 'synced',
        };
      }),
    };
  }
  return out;
}
