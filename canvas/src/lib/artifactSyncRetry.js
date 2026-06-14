import { cardKeyFromFilename } from './filename.js';
import {
  ensureClusterForProject,
  ingestArtifacts,
  isApiAvailable,
} from './primitivesApi.js';
import { artifactTypeFromFile } from './ingest/artifactType.js';
import { createLinksFromSource } from './ingest/linkIngest.js';

function baseMetadata(entry) {
  return {
    filename: entry.filename,
    cardKey: entry.cardKey ?? (entry.filename ? cardKeyFromFilename(entry.filename) : null),
  };
}

function fileForOutboxEntry(entry) {
  if (entry.kind === 'bookmark') {
    return {
      type: 'other',
      uri: entry.url,
      content_hash: entry.contentHash,
      version: '1',
      retrieved_at: entry.retrievedAt ?? new Date().toISOString(),
      payload_text: null,
      metadata: {
        ...baseMetadata(entry),
        canvas_kind: 'bookmark',
        external_url: entry.url,
        title: entry.title,
        description: entry.description ?? null,
        site_name: entry.siteName ?? null,
        image_url: entry.imageUrl ?? null,
        favicon_url: entry.faviconUrl ?? null,
        fetched_at: entry.fetchedAt ?? entry.retrievedAt ?? null,
      },
    };
  }

  if (entry.kind === 'agent_chat') {
    return {
      type: 'agent_chat',
      uri: `canvas-agent-chat:${entry.projectId}/${entry.connectorId}/${entry.threadId || 'legacy'}`,
      content_hash: entry.contentHash,
      version: '1',
      retrieved_at: entry.retrievedAt ?? new Date().toISOString(),
      payload_text: entry.markdown ?? entry.content ?? null,
      metadata: {
        ...baseMetadata(entry),
        canvas_kind: 'agent_chat',
        connectorId: entry.connectorId ?? null,
        threadId: entry.threadId ?? 'legacy',
        connectorLabel: entry.connectorLabel ?? entry.connectorId ?? null,
      },
    };
  }

  return {
    type: artifactTypeFromFile(entry.filename, { cardType: entry.cardType ?? 'user_note' }),
    uri: `folder-relative:${entry.projectId}/${entry.filename}`,
    content_hash: entry.contentHash,
    version: String(entry.version ?? 1),
    retrieved_at: entry.retrievedAt ?? new Date().toISOString(),
    payload_text: entry.content ?? null,
    metadata: {
      ...baseMetadata(entry),
      prefix: entry.prefix ?? null,
      name: entry.name ?? null,
      ...(entry.cardType === 'user_note' || entry.kind === 'user_note'
        ? { canvas_kind: 'user_note' }
        : {}),
    },
  };
}

export async function processArtifactSyncRetryEntry(entry) {
  if (!entry?.projectId || !entry?.kind) {
    return { ok: false, lastError: 'invalid outbox entry' };
  }
  const available = await isApiAvailable();
  if (!available) {
    return { ok: false, lastError: 'api unavailable' };
  }

  const projectName = entry.projectName || 'Project';
  const cluster = await ensureClusterForProject(entry.projectId, projectName);
  const ingest = await ingestArtifacts(entry.projectId, {
    files: [fileForOutboxEntry(entry)],
    relationships: [],
  });
  const row = ingest.artifacts?.[0];
  const artifactRef = row?.artifactRef ?? null;
  if (!artifactRef?.id) {
    return { ok: false, lastError: 'ingest failed' };
  }

  const clusterId = ingest.clusterId || cluster?.id;
  if (clusterId && entry.kind === 'bookmark' && entry.linkTargetRefs?.length) {
    await createLinksFromSource(clusterId, artifactRef, entry.linkTargetRefs);
  }

  return {
    ok: true,
    artifactRef,
    contentHash: row.content_hash ?? entry.contentHash,
    filename: entry.filename,
    cardKey: entry.cardKey,
    kind: entry.kind,
    threadId: entry.threadId ?? null,
    connectorId: entry.connectorId ?? null,
  };
}
