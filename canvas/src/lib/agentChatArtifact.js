import { sha256HexFromString } from './ingest/hashFile.js';
import {
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
      /^\[(\d{2}:\d{2}:\d{2})\]\s+(Context: sent to AI|Context: removed|User|Assistant)(?::)?(?:\s+(?:\u2014|â€”)\s+(.+?))?\s*$/gm;
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

        if (type === 'Assistant') {
          const at = parseTranscriptTime(timeStr, fallbackAt);
          fallbackAt = at + 1;
          parsedMessages.push({
            id: nextParseId('a'),
            role: 'assistant',
            content: rest,
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
  if (message.role === 'assistant') {
    const body = String(message.content ?? '').trim();
    return `[${time}] Assistant:\n${body}`;
  }
  const body = String(message.content ?? '').trim();
  return `[${time}] User:\n${body}`;
}

/**
 * @param {object[]} messages
 * @param {{ projectName?: string, connectorId: string, connectorLabel?: string, threadId?: string, title?: string }} meta
 */
export function formatAgentChatTranscript(messages, meta) {
  const { projectName, connectorId, connectorLabel, threadId, title } = meta;
  const updated = new Date().toISOString();
  const header = [
    '# Agent chat transcript',
    '',
    `- **Project:** ${projectName || 'Untitled'}`,
    `- **Connector:** ${connectorLabel || connectorId}`,
    ...(title ? [`- **Thread:** ${title}`] : []),
    ...(threadId ? [`- **Thread ID:** ${threadId}`] : []),
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
 * @param {{
 *   projectId: string,
 *   projectName?: string,
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   connectorId: string,
 *   connectorLabel?: string,
 *   threadId?: string,
 *   title?: string,
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
  });
  const content_hash = await sha256HexFromString(markdown);

  const filename =
    existingFilename
    || (threadId
      ? buildAgentChatFilename(connectorId, threadId)
      : buildAgentChatFilename(connectorId, 'legacy'));

  if (folderHandle) {
    try {
      if (artifactRef?.id) {
        await overwriteUserNoteFile(folderHandle, filename, markdown);
      } else {
        await writeTextFileToFolder(folderHandle, filename, markdown);
      }
    } catch {
      /* folder transcript write is best-effort */
    }
  }

  const available = await isApiAvailable();
  if (!available) {
    return {
      ok: false,
      reason: 'api_unavailable',
      filename,
      content_hash,
      markdown,
    };
  }

  if (artifactRef?.id) {
    await updateArtifactContent(artifactRef.id, {
      content_hash,
      payload_text: markdown,
    });
    return {
      ok: true,
      artifactRef: { id: artifactRef.id, type: 'artifact' },
      filename,
      content_hash,
    };
  }

  const cardKey = cardKeyFromFilename(filename);
  const uriThread = threadId || 'legacy';

  if (folderHandle) {
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
      return {
        ok: false,
        reason: 'ingest_failed',
        filename,
        content_hash,
        markdown,
      };
    }
    return { ok: true, artifactRef: ref, filename, content_hash };
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
    return {
      ok: false,
      reason: 'ingest_failed',
      filename,
      content_hash,
      markdown,
    };
  }
  return {
    ok: true,
    artifactRef: row.artifactRef,
    filename,
    content_hash,
  };
}
