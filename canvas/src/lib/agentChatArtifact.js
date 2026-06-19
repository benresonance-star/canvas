import { sha256HexFromString } from './ingest/hashFile.js';
import {
  ensureWritePermission,
  getFileHandleAtPath,
  writeTextFileToFolder,
  overwriteUserNoteFile,
} from './folderWrite.js';
import { readFileEntry } from './readFile.js';
import { previewCacheKey } from './previewStore.js';
import { ingestFoundFiles } from './ingest/syncIngest.js';
import {
  ingestArtifacts,
  ensureClusterForProject,
  updateArtifactContent,
  isApiAvailable,
} from './primitivesApi.js';
import { getArtifact } from './agentApi.js';
import { buildAgentChatFilename } from './agentChatThreads.js';
import { cardKeyFromFilename } from './filename.js';

export { buildAgentChatFilename };

let parseMessageId = 0;

function nextParseId(prefix) {
  parseMessageId += 1;
  return `${prefix}-${parseMessageId}`;
}

/**
 * @param {string} timeStr HH:MM:SS (UTC slice from ISO)
 * @param {number} [fallbackMs]
 */
function parseTranscriptTime(timeStr, fallbackMs) {
  if (!timeStr || timeStr === '--:--:--') {
    return fallbackMs ?? Date.now();
  }
  const [h, m, s] = timeStr.split(':').map((n) => Number(n));
  if (!Number.isFinite(h)) return fallbackMs ?? Date.now();
  const base = new Date();
  base.setUTCHours(h, m, s ?? 0, 0);
  return base.getTime();
}

/**
 * Parse transcript markdown written by formatAgentChatTranscript.
 * @param {string} markdown
 * @returns {object[]}
 */
export function parseAgentChatTranscript(markdown) {
  if (!markdown?.trim()) return [];

  const sep = markdown.indexOf('\n---\n');
  const body = (sep >= 0 ? markdown.slice(sep + 5) : markdown).trim();
  if (!body) return [];

  {
    const headerPattern =
      /^\[(\d{2}:\d{2}:\d{2})\]\s+(Context: sent to AI|Context: removed|Agent Type changed|User|Assistant)(?::)?(?:\s+(?:\u2014|â€”)\s+(.+?))?\s*$/gm;
    const headers = [...body.matchAll(headerPattern)];
    if (headers.length > 0) {
      const parsedMessages = [];
      let fallbackAt = Date.now() - headers.length * 1000;

      for (let i = 0; i < headers.length; i += 1) {
        const header = headers[i];
        const nextHeader = headers[i + 1];
        const timeStr = header[1];
        const type = header[2];
        const inlineValue = header[3]?.trim() ?? '';
        const rest = body
          .slice((header.index ?? 0) + header[0].length, nextHeader?.index ?? body.length)
          .trim();

        if (type === 'Context: sent to AI') {
          const labelText = inlineValue || rest;
          const labels = labelText.split(',').map((s) => s.trim()).filter(Boolean);
          const at = parseTranscriptTime(timeStr, fallbackAt);
          fallbackAt = at + 1;
          parsedMessages.push({
            id: nextParseId('ctx-add'),
            role: 'user',
            kind: 'context_add',
            content: `Context: sent to AI â€” ${labelText}`,
            labels,
            at,
          });
          continue;
        }

        if (type === 'Context: removed') {
          const labelText = inlineValue || rest;
          const labels = labelText.split(',').map((s) => s.trim()).filter(Boolean);
          const at = parseTranscriptTime(timeStr, fallbackAt);
          fallbackAt = at + 1;
          parsedMessages.push({
            id: nextParseId('ctx-rm'),
            role: 'user',
            kind: 'context_remove',
            content: `Context: removed â€” ${labelText}`,
            labels,
            at,
          });
          continue;
        }

        if (type === 'User') {
          const at = parseTranscriptTime(timeStr, fallbackAt);
          fallbackAt = at + 1;
          parsedMessages.push({
            id: nextParseId('u'),
            role: 'user',
            content: rest,
            at,
          });
          continue;
        }

        if (type === 'Agent Type changed') {
          const at = parseTranscriptTime(timeStr, fallbackAt);
          fallbackAt = at + 1;
          const [fromAgentTypeLabel, toAgentTypeLabel] = (inlineValue || rest)
            .split(/\s*(?:->|→)\s*/);
          parsedMessages.push({
            id: nextParseId('agent-type'),
            role: 'system',
            kind: 'agent_type_change',
            fromAgentTypeLabel: fromAgentTypeLabel || 'Default ChatGPT agent',
            toAgentTypeLabel: toAgentTypeLabel || 'Default ChatGPT agent',
            at,
          });
          continue;
        }

        if (type === 'Assistant') {
          const at = parseTranscriptTime(timeStr, fallbackAt);
          fallbackAt = at + 1;
          const attribution = inlineValue ? parseAgentAttribution(inlineValue) : {};
          parsedMessages.push({
            id: nextParseId('a'),
            role: 'assistant',
            content: rest,
            ...attribution,
            at,
          });
        }
      }

      return parsedMessages;
    }
  }

  const blocks = body.split(/\n\n+/);
  const messages = [];
  let fallbackAt = Date.now() - blocks.length * 1000;

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');
    const header = lines[0] ?? '';
    const rest = lines.slice(1).join('\n').trim();

    const ctxAdd = header.match(
      /^\[(\d{2}:\d{2}:\d{2})\] Context: sent to AI — (.+)$/,
    );
    if (ctxAdd) {
      const labels = ctxAdd[2].split(',').map((s) => s.trim()).filter(Boolean);
      const at = parseTranscriptTime(ctxAdd[1], fallbackAt);
      fallbackAt = at + 1;
      messages.push({
        id: nextParseId('ctx-add'),
        role: 'user',
        kind: 'context_add',
        content: `Context: sent to AI — ${ctxAdd[2]}`,
        labels,
        at,
      });
      continue;
    }

    const ctxRm = header.match(
      /^\[(\d{2}:\d{2}:\d{2})\] Context: removed — (.+)$/,
    );
    if (ctxRm) {
      const labels = ctxRm[2].split(',').map((s) => s.trim()).filter(Boolean);
      const at = parseTranscriptTime(ctxRm[1], fallbackAt);
      fallbackAt = at + 1;
      messages.push({
        id: nextParseId('ctx-rm'),
        role: 'user',
        kind: 'context_remove',
        content: `Context: removed — ${ctxRm[2]}`,
        labels,
        at,
      });
      continue;
    }

    const userMatch = header.match(/^\[(\d{2}:\d{2}:\d{2})\] User:$/);
    if (userMatch) {
      const at = parseTranscriptTime(userMatch[1], fallbackAt);
      fallbackAt = at + 1;
      messages.push({
        id: nextParseId('u'),
        role: 'user',
        content: rest,
        at,
      });
      continue;
    }

    const changeMatch = header.match(/^\[(\d{2}:\d{2}:\d{2})\] Agent Type changed — (.+)$/);
    if (changeMatch) {
      const at = parseTranscriptTime(changeMatch[1], fallbackAt);
      fallbackAt = at + 1;
      const [fromAgentTypeLabel, toAgentTypeLabel] = changeMatch[2]
        .split(/\s*(?:->|→)\s*/);
      messages.push({
        id: nextParseId('agent-type'),
        role: 'system',
        kind: 'agent_type_change',
        fromAgentTypeLabel: fromAgentTypeLabel || 'Default ChatGPT agent',
        toAgentTypeLabel: toAgentTypeLabel || 'Default ChatGPT agent',
        at,
      });
      continue;
    }

    const assistantMatch = header.match(/^\[(\d{2}:\d{2}:\d{2})\] Assistant:$/);
    if (assistantMatch) {
      const at = parseTranscriptTime(assistantMatch[1], fallbackAt);
      fallbackAt = at + 1;
      messages.push({
        id: nextParseId('a'),
        role: 'assistant',
        content: rest,
        at,
      });
    }
  }

  return messages;
}

function formatAgentAttribution(message) {
  const label = message.agentTypeLabel || message.agentTemplateId;
  if (!label) return '';
  const model = message.model?.includes('/')
    ? message.model
    : message.model
      ? `${message.provider || 'provider'}/${message.model}`
      : '';
  return model ? `${label} · ${model}` : label;
}

function parseAgentAttribution(value) {
  const [label, modelRef] = String(value).split(' · ');
  const attribution = {};
  if (label) attribution.agentTypeLabel = label.trim();
  if (modelRef?.includes('/')) {
    const [provider, model] = modelRef.split('/');
    attribution.provider = provider?.trim() || null;
    attribution.model = model?.trim() || null;
  }
  return attribution;
}

/**
 * @param {{
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   artifactRef?: { id: string } | null,
 *   filename?: string | null,
 *   relativePath?: string | null,
 * }} params
 * @returns {Promise<string | null>}
 */
export async function loadThreadTranscript({
  folderHandle = null,
  artifactRef = null,
  filename = null,
  relativePath = null,
} = {}) {
  if (folderHandle && filename) {
    try {
      const entry = await getFileHandleAtPath(
        folderHandle,
        relativePath || filename,
        { create: false },
      );
      const file = await entry.getFile();
      return await file.text();
    } catch {
      /* try artifact */
    }
  }

  if (artifactRef?.id) {
    try {
      const { artifact } = await getArtifact(artifactRef.id);
      const text = artifact?.payload_text;
      if (typeof text === 'string' && text.length > 0) return text;
    } catch {
      /* ignore */
    }
  }

  return null;
}

/**
 * @param {object} message
 */
function formatMessageLine(message) {
  const time = message.at
    ? new Date(message.at).toISOString().slice(11, 19)
    : '--:--:--';
  if (message.kind === 'context_add') {
    const labels = message.labels?.join(', ') || 'files';
    return `[${time}] Context: sent to AI — ${labels}`;
  }
  if (message.kind === 'context_remove') {
    const labels = message.labels?.join(', ') || 'files';
    return `[${time}] Context: removed — ${labels}`;
  }
  if (message.kind === 'agent_type_change') {
    const fromLabel = message.fromAgentTypeLabel || 'Default ChatGPT agent';
    const toLabel = message.toAgentTypeLabel || 'Default ChatGPT agent';
    return `[${time}] Agent Type changed — ${fromLabel} -> ${toLabel}`;
  }
  if (message.role === 'assistant') {
    const body = String(message.content ?? '').trim();
    const attribution = formatAgentAttribution(message);
    return `[${time}] Assistant:${attribution ? ` — ${attribution}` : ''}\n${body}`;
  }
  const body = String(message.content ?? '').trim();
  return `[${time}] User:\n${body}`;
}

/**
 * @param {object[]} messages
 * @param {{ projectName?: string, connectorId: string, connectorLabel?: string, threadId?: string, title?: string, agentTemplateId?: string | null, agentTypeLabel?: string | null, provider?: string | null, model?: string | null }} meta
 */
export function formatAgentChatTranscript(messages, meta) {
  const {
    projectName,
    connectorId,
    connectorLabel,
    threadId,
    title,
    agentTemplateId,
    agentTypeLabel,
    provider,
    model,
  } = meta;
  const headerAgentType = agentTypeLabel || agentTemplateId;
  const updated = new Date().toISOString();
  const header = [
    '# Agent chat transcript',
    '',
    `- **Project:** ${projectName || 'Untitled'}`,
    `- **Connector:** ${connectorLabel || connectorId}`,
    ...(title ? [`- **Thread:** ${title}`] : []),
    ...(threadId ? [`- **Thread ID:** ${threadId}`] : []),
    ...(headerAgentType ? [`- **Initial Agent Type:** ${headerAgentType}${model ? ` · ${model.includes('/') ? model : `${provider || 'provider'}/${model}`}` : ''}`] : []),
    `- **Updated:** ${updated}`,
    '',
    '---',
    '',
  ].join('\n');
  const body = (messages || [])
    .map((m) => ({ ...m, at: m.at ?? null }))
    .map(formatMessageLine)
    .join('\n\n');
  return `${header}${body}\n`;
}

/**
 * @param {object[]} messages
 */
export function attachMessageTimestamps(messages) {
  const now = Date.now();
  return messages.map((m, i) => ({
    ...m,
    at: m.at ?? now + i,
  }));
}

/**
 * @param {FileSystemDirectoryHandle} folderHandle
 * @param {string} filename
 * @param {string} markdown
 * @param {{ artifactRef?: { id: string } | null }} [options]
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'folder_write_denied' | 'folder_write_failed' }>}
 */
async function writeAgentChatTranscriptToFolder(
  folderHandle,
  filename,
  markdown,
  { artifactRef = null } = {},
) {
  const canWrite = await ensureWritePermission(folderHandle);
  if (!canWrite) {
    return { ok: false, reason: 'folder_write_denied' };
  }
  try {
    if (artifactRef?.id) {
      await overwriteUserNoteFile(folderHandle, filename, markdown);
    } else {
      await writeTextFileToFolder(folderHandle, filename, markdown);
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'folder_write_failed' };
  }
}

function folderExportFailure(reason, base, extra = {}) {
  return {
    ok: false,
    reason,
    filename: base.filename,
    content_hash: base.content_hash,
    markdown: base.markdown,
    ...extra,
  };
}

/**
 * @param {{
 *   projectId: string,
 *   projectName?: string,
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   connectorId: string,
 *   connectorLabel?: string,
 *   threadId?: string,
 *   title?: string,
 *   agentTemplateId?: string | null,
 *   agentTypeLabel?: string | null,
 *   model?: string | null,
 *   messages: object[],
 *   artifactRef?: { id: string, type?: string } | null,
 *   filename?: string | null,
 * }} params
 */
export async function syncAgentChatArtifact(params) {
  const {
    projectId,
    projectName,
    folderHandle,
    connectorId,
    connectorLabel,
    threadId,
    title,
    agentTemplateId,
    agentTypeLabel,
    model,
    messages,
    artifactRef,
    filename: existingFilename,
  } = params;

  const stamped = attachMessageTimestamps(messages);
  const markdown = formatAgentChatTranscript(stamped, {
    projectName,
    connectorId,
    connectorLabel,
    threadId,
    title,
    agentTemplateId,
    agentTypeLabel,
    provider: connectorId,
    model,
  });
  const content_hash = await sha256HexFromString(markdown);

  const filename =
    existingFilename
    || (threadId
      ? buildAgentChatFilename(connectorId, threadId)
      : buildAgentChatFilename(connectorId, 'legacy'));

  const base = { filename, content_hash, markdown };

  let folderWriteOk = !folderHandle;
  let folderWriteReason = null;
  if (folderHandle) {
    const folderWrite = await writeAgentChatTranscriptToFolder(
      folderHandle,
      filename,
      markdown,
      { artifactRef },
    );
    folderWriteOk = folderWrite.ok;
    if (!folderWrite.ok) {
      folderWriteReason = folderWrite.reason;
    }
  }

  const available = await isApiAvailable();
  if (!available) {
    if (folderHandle && !folderWriteOk) {
      return folderExportFailure(folderWriteReason, base);
    }
    return folderExportFailure('api_unavailable', base);
  }

  if (artifactRef?.id) {
    await updateArtifactContent(artifactRef.id, {
      content_hash,
      payload_text: markdown,
    });
    const nextArtifactRef = { id: artifactRef.id, type: 'artifact' };
    if (folderHandle && !folderWriteOk) {
      return folderExportFailure(folderWriteReason, base, {
        artifactRef: nextArtifactRef,
        serverSynced: true,
      });
    }
    return {
      ok: true,
      artifactRef: nextArtifactRef,
      filename,
      content_hash,
    };
  }

  if (folderHandle && !folderWriteOk) {
    return folderExportFailure(folderWriteReason, base);
  }

  const cardKey = cardKeyFromFilename(filename);
  const uriThread = threadId || 'legacy';

  if (folderHandle && folderWriteOk) {
    try {
      const entry = await folderHandle.getFileHandle(filename);
      const cacheKey = previewCacheKey(projectId, cardKey, 1);
      const file = await readFileEntry(entry, { cacheKey });
      const flat = [
        {
          ...file,
          cardKey,
          cardType: 'agent_chat',
          filename,
          content: markdown,
          content_hash,
          connectorId,
          threadId: uriThread,
          connectorLabel: connectorLabel || connectorId,
        },
      ];
      await ensureClusterForProject(projectId, projectName || 'Project');
      const ingest = await ingestFoundFiles(projectId, projectName || 'Project', flat, {});
      const ref = ingest.byFilename[filename]?.artifactRef;
      if (!ref) {
        return folderExportFailure('ingest_failed', base);
      }
      return { ok: true, artifactRef: ref, filename, content_hash };
    } catch {
      /* fall through to server-only ingest */
    }
  }

  await ensureClusterForProject(projectId, projectName || 'Project');
  const ingestRes = await ingestArtifacts(projectId, {
    files: [
      {
        type: 'agent_chat',
        uri: `canvas-agent-chat:${projectId}/${connectorId}/${uriThread}`,
        content_hash,
        version: '1',
        retrieved_at: new Date().toISOString(),
        payload_text: markdown,
        metadata: {
          filename,
          cardKey,
          canvas_kind: 'agent_chat',
          connectorId,
          threadId: uriThread,
          connectorLabel: connectorLabel || connectorId,
        },
      },
    ],
    relationships: [],
  });

  const row = ingestRes.artifacts?.[0];
  if (!row?.artifactRef) {
    if (folderHandle && !folderWriteOk) {
      return folderExportFailure(folderWriteReason, base);
    }
    return folderExportFailure('ingest_failed', base);
  }
  if (folderHandle && !folderWriteOk) {
    return folderExportFailure(folderWriteReason, base, {
      artifactRef: row.artifactRef,
      serverSynced: true,
    });
  }
  return {
    ok: true,
    artifactRef: row.artifactRef,
    filename,
    content_hash,
  };
}
