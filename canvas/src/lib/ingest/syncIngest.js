import { artifactTypeFromFile } from './artifactType.js';
import { syncKeysMatch } from '../filename.js';
import { ingestArtifacts, ensureClusterForProject, isApiAvailable } from '../primitivesApi.js';

/**
 * Ingest synced files as artifacts; return map filename -> { artifactRef, content_hash }
 */
export async function ingestFoundFiles(projectId, projectName, flatVersions, previousArtifactsByKey = {}) {
  const available = await isApiAvailable();
  if (!available) {
    return { ok: false, reason: 'api_unavailable', byFilename: {} };
  }

  await ensureClusterForProject(projectId, projectName);

  const files = flatVersions.map((v) => ({
    type: artifactTypeFromFile(v.filename, { cardType: v.cardType }),
    uri: `folder-relative:${projectId}/${v.filename}`,
    content_hash: v.content_hash,
    version: String(v.version ?? 1),
    retrieved_at: new Date(v.lastModified || Date.now()).toISOString(),
    payload_text: v.content ?? null,
    metadata: {
      filename: v.filename,
      cardKey: v.cardKey ?? null,
      prefix: v.prefix,
      name: v.name,
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
  }));

  const ingestRes = await ingestArtifacts(projectId, { files, relationships: [] });

  const byFilename = {};
  for (const a of ingestRes.artifacts || []) {
    for (const v of flatVersions) {
      if (v.content_hash === a.content_hash) {
        byFilename[v.filename] = {
          content_hash: a.content_hash,
          artifactRef: a.artifactRef,
        };
      }
    }
  }

  const relationships = [];
  for (const v of flatVersions) {
    const prev = previousArtifactsByKey[v.cardKey];
    const current = byFilename[v.filename]?.artifactRef;
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
        flatVersions.map((v) => [v.cardKey, { versions: [{ ...v, artifactRef: byFilename[v.filename]?.artifactRef }] }]),
      ),
    );
    for (const v of flatVersions) {
      const ing = byFilename[v.filename];
      if (ing?.artifactRef) cardKeyToRef.set(v.cardKey, ing.artifactRef);
    }
    const flatWithRefs = flatVersions.map((v) => ({
      ...v,
      artifactRef: byFilename[v.filename]?.artifactRef,
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
        const ing = byFilename[v.filename];
        if (!ing?.artifactRef) return v;
        return {
          ...v,
          content_hash: ing.content_hash,
          artifactRef: ing.artifactRef,
        };
      }),
    };
  }
  return out;
}
