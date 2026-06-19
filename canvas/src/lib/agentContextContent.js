import { cardLabel } from './agentContext.js';
import { folderRelativePathFromVersion, normalizeCardType } from './filename.js';
import { readFileEntry } from './readFile.js';
import { extractPdfText, getPdfPageCount } from './extractPdfText.js';
import { getArtifact } from './agentApi.js';
import { getPreview } from './previewStore.js';
import { STORAGE_LIMIT } from './constants.js';
import { getFileHandleAtPath } from './folderWrite.js';

export const CONTEXT_PROFILES = {
  standard: {
    maxFileChars: 24_000,
    maxTotalChars: 80_000,
    pdfMaxPages: 40,
    maxImageBytes: STORAGE_LIMIT,
    maxImagesPerAdd: 5,
    maxTotalImageBytes: STORAGE_LIMIT,
    imageTokenEstimateBase: 850,
  },
  extended: {
    maxFileChars: 60_000,
    maxTotalChars: 110_000,
    pdfMaxPages: 100,
    maxImageBytes: STORAGE_LIMIT,
    maxImagesPerAdd: 8,
    maxTotalImageBytes: STORAGE_LIMIT,
    imageTokenEstimateBase: 850,
  },
};

/** @deprecated use CONTEXT_PROFILES.standard */
export const CONTEXT_MAX_FILE_CHARS = CONTEXT_PROFILES.standard.maxFileChars;
/** @deprecated use CONTEXT_PROFILES.standard */
export const CONTEXT_MAX_TOTAL_CHARS = CONTEXT_PROFILES.standard.maxTotalChars;

const TEXT_TYPES = new Set(['markdown', 'note', 'user_note', 'html', 'agent_chat']);

/**
 * @param {'standard' | 'extended'} [profileName]
 */
export function getContextLimits(profileName = 'standard') {
  return CONTEXT_PROFILES[profileName] ?? CONTEXT_PROFILES.standard;
}

/**
 * @param {object} card
 */
export function getPinnedVersion(card) {
  if (!card?.versions?.length) return null;
  return (
    card.versions.find((v) => v.version === card.pinnedVersion) || card.versions[0]
  );
}

/**
 * @param {string} type
 */
export function isContextTypeSupported(type) {
  const t = normalizeCardType(type);
  return TEXT_TYPES.has(t) || t === 'pdf' || t === 'image' || t === 'flow';
}

/**
 * @param {Blob} blob
 */
async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/**
 * @param {string} dataUrl
 */
export function dataUrlByteLength(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

/**
 * @param {object} pinned
 * @param {FileSystemDirectoryHandle | null} folderHandle
 */
async function loadImageDataUrlForPinned(pinned, folderHandle) {
  if (pinned.previewCacheKey) {
    const blob = await getPreview(pinned.previewCacheKey);
    if (blob) return blobToDataUrl(blob);
  }
  if (folderHandle && pinned.filename) {
    const relativePath = folderRelativePathFromVersion(pinned);
    const entry = await getFileHandleAtPath(folderHandle, relativePath);
    const file = await readFileEntry(entry, {
      cacheKey: pinned.previewCacheKey ?? undefined,
      relativePath,
    });
    if (file.dataUrl) return file.dataUrl;
    if (file.objectUrl) {
      const res = await fetch(file.objectUrl);
      const blob = await res.blob();
      return blobToDataUrl(blob);
    }
  }
  return null;
}

/**
 * @param {object} card
 * @param {{ folderLinked?: boolean }} [options]
 */
export function contextStatusHint(card, options = {}) {
  const { folderLinked = false } = options;
  const type = normalizeCardType(card?.type);
  const label = cardLabel(card);
  const pinned = getPinnedVersion(card);

  if (type === 'bookmark') {
    return {
      cardId: card.id,
      label,
      status: pinned?.externalUrl ? 'pending' : 'empty',
    };
  }

  if (type === 'flow') {
    const hasPreview = Boolean(pinned?.flowPreview?.nodes?.length || pinned?.flowId || pinned?.artifactRef?.id);
    return {
      cardId: card.id,
      label,
      status: hasPreview ? 'pending' : 'empty',
    };
  }

  if (!isContextTypeSupported(type)) {
    return { cardId: card.id, label, status: 'unsupported' };
  }
  if (!pinned) {
    return { cardId: card.id, label, status: 'empty' };
  }
  if ((type === 'pdf' || TEXT_TYPES.has(type)) && !pinned.artifactRef?.id && !pinned.filename) {
    return { cardId: card.id, label, status: 'empty' };
  }
  if (!folderLinked && type === 'pdf') {
    return { cardId: card.id, label, status: 'needs_folder' };
  }
  if (type === 'image' && !folderLinked && !pinned.previewCacheKey) {
    return { cardId: card.id, label, status: 'needs_folder' };
  }
  return { cardId: card.id, label, status: 'pending' };
}

/**
 * @param {string} text
 * @param {number} max
 * @returns {{ text: string, truncated: boolean, originalLength: number }}
 */
export function truncateText(text, max) {
  const originalLength = text?.length ?? 0;
  if (!text || text.length <= max) {
    return { text: text ?? '', truncated: false, originalLength };
  }
  return {
    text: `${text.slice(0, max)}\n\n[… truncated]`,
    truncated: true,
    originalLength,
  };
}

/**
 * @typedef {'included' | 'unsupported' | 'needs_folder' | 'empty' | 'error'} ContextDocStatus
 * @typedef {'standard' | 'extended'} ContextProfileName
 * @typedef {{
 *   cardId: string,
 *   label: string,
 *   type: string,
 *   status: ContextDocStatus,
 *   text?: string,
 *   note?: string,
 *   truncated?: boolean,
 *   originalChars?: number,
 *   includedChars?: number,
 *   pdfPagesTotal?: number,
 *   pdfPagesIncluded?: number,
 *   imageDataUrl?: string,
 *   imageDetail?: 'low' | 'high',
 *   imageBytes?: number,
 * }} ContextDocument
 */

/**
 * @param {object} card
 * @param {{
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   fetchArtifact?: typeof getArtifact,
 *   loadAgentChatText?: (card: object) => Promise<string | null>,
 *   loadFlowContextText?: (card: object) => Promise<string | null>,
 *   profile?: ContextProfileName,
 * }} options
 * @returns {Promise<ContextDocument>}
 */
export async function loadContextDocumentForCard(card, options = {}) {
  const {
    folderHandle = null,
    fetchArtifact = getArtifact,
    profile = 'standard',
    loadAgentChatText = null,
    loadFlowContextText = null,
  } = options;
  const limits = getContextLimits(profile);
  const label = cardLabel(card);
  const type = normalizeCardType(card.type);
  const pinned = getPinnedVersion(card);

  if (!isContextTypeSupported(type) && type !== 'bookmark') {
    return {
      cardId: card.id,
      label,
      type,
      status: 'unsupported',
      note: 'This file type is not sent to the agent.',
    };
  }

  if (!pinned) {
    return { cardId: card.id, label, type, status: 'empty', note: 'No file version on this card.' };
  }

  if (type === 'bookmark') {
    const url = pinned.externalUrl || '';
    const desc = pinned.bookmarkPreview?.description || '';
    const body = [
      `Bookmark: ${label}`,
      url ? `URL: ${url}` : '',
      desc ? `Description: ${desc}` : '',
    ].filter(Boolean).join('\n');
    return {
      cardId: card.id,
      label,
      type,
      status: body ? 'included' : 'empty',
      text: body || null,
      note: body ? undefined : 'No URL on this bookmark.',
    };
  }

  if (type === 'flow') {
    if (!loadFlowContextText) {
      return {
        cardId: card.id,
        label,
        type,
        status: 'unsupported',
        note: 'Flow diagram context is not available.',
      };
    }
    try {
      const text = await loadFlowContextText(card);
      if (!text?.trim()) {
        return {
          cardId: card.id,
          label,
          type,
          status: 'empty',
          note: 'This flow has no diagram content.',
        };
      }
      const { text: trimmed, truncated } = truncateText(text.trim(), limits.maxFileChars);
      return {
        cardId: card.id,
        label,
        type,
        status: 'included',
        text: trimmed,
        truncated,
        originalChars: text.length,
        includedChars: trimmed.length,
      };
    } catch (error) {
      return {
        cardId: card.id,
        label,
        type,
        status: 'error',
        note: error?.message || 'Could not load flow diagram.',
      };
    }
  }

  if (type === 'image') {
    if (!folderHandle && !pinned.previewCacheKey) {
      return {
        cardId: card.id,
        label,
        type,
        status: 'needs_folder',
        note: 'Connect the project folder or sync previews to send this image.',
      };
    }
    try {
      const imageDataUrl = await loadImageDataUrlForPinned(pinned, folderHandle);
      if (!imageDataUrl) {
        return {
          cardId: card.id,
          label,
          type,
          status: 'empty',
          note: 'Could not load image bytes.',
        };
      }
      const imageBytes = dataUrlByteLength(imageDataUrl);
      if (imageBytes > limits.maxImageBytes) {
        return {
          cardId: card.id,
          label,
          type,
          status: 'error',
          note: `Image exceeds ${Math.round(limits.maxImageBytes / (1024 * 1024))}MB limit.`,
        };
      }
      const sizeKb = Math.max(1, Math.round(imageBytes / 1024));
      return {
        cardId: card.id,
        label,
        type,
        status: 'included',
        text: `Image file (~${sizeKb} KB).`,
        imageDataUrl,
        imageDetail: 'low',
        imageBytes,
      };
    } catch (e) {
      return {
        cardId: card.id,
        label,
        type,
        status: 'error',
        note: e?.message || 'Could not load image.',
      };
    }
  }

  let text = null;
  let pdfPagesTotal;
  let pdfPagesIncluded;

  if (pinned.artifactRef?.id) {
    try {
      const { artifact } = await fetchArtifact(pinned.artifactRef.id);
      if (artifact?.payload_text?.trim()) {
        text = artifact.payload_text.trim();
      }
    } catch {
      /* fall through to folder */
    }
  }

  if (!text && type === 'agent_chat' && loadAgentChatText) {
    try {
      const transcript = await loadAgentChatText(card);
      if (transcript?.trim()) {
        text = transcript.trim();
      }
    } catch {
      /* fall through to folder */
    }
  }

  if (!text && folderHandle && pinned.filename) {
    try {
      const relativePath = folderRelativePathFromVersion(pinned);
      const entry = await getFileHandleAtPath(folderHandle, relativePath);
      if (TEXT_TYPES.has(type)) {
        const file = await readFileEntry(entry, { relativePath });
        if (file.content?.trim()) {
          text = file.content.trim();
        }
      } else if (type === 'pdf') {
        const rawFile = await entry.getFile();
        const extracted = await extractPdfText(rawFile, {
          maxPages: limits.pdfMaxPages,
          maxChars: limits.maxFileChars,
        });
        text = extracted.text;
        pdfPagesTotal = extracted.pagesTotal;
        pdfPagesIncluded = extracted.pagesIncluded;
      }
    } catch (e) {
      if (!text) {
        return {
          cardId: card.id,
          label,
          type,
          status: 'error',
          note: e?.message || 'Could not read file from folder.',
        };
      }
    }
  }

  if (!text?.trim()) {
    if (type === 'pdf' && !folderHandle) {
      return {
        cardId: card.id,
        label,
        type,
        status: 'needs_folder',
        note: 'Connect the project folder to read PDF content.',
      };
    }
    return {
      cardId: card.id,
      label,
      type,
      status: 'empty',
      note: 'No readable text in this file.',
    };
  }

  const originalChars = text.length;
  const { text: includedText, truncated: fileTruncated } = truncateText(
    text,
    limits.maxFileChars,
  );

  return {
    cardId: card.id,
    label,
    type,
    status: 'included',
    text: includedText,
    truncated: fileTruncated || (pdfPagesTotal != null && pdfPagesTotal > (pdfPagesIncluded ?? 0)),
    originalChars,
    includedChars: includedText.length,
    pdfPagesTotal,
    pdfPagesIncluded,
    note:
      fileTruncated || (pdfPagesTotal != null && pdfPagesTotal > limits.pdfMaxPages)
        ? `Truncated to ${limits.pdfMaxPages} pages / ${limits.maxFileChars.toLocaleString()} characters.`
        : undefined,
  };
}

/**
 * @param {object} card
 * @param {{
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   fetchArtifact?: typeof getArtifact,
 *   loadAgentChatText?: (card: object) => Promise<string | null>,
 *   loadFlowContextText?: (card: object) => Promise<string | null>,
 *   profile?: ContextProfileName,
 * }} options
 */
export async function estimateContextDocument(card, options = {}) {
  const {
    folderHandle = null,
    fetchArtifact = getArtifact,
    profile = 'standard',
    loadAgentChatText = null,
    loadFlowContextText = null,
  } = options;
  const limits = getContextLimits(profile);
  const standardLimits = getContextLimits('standard');
  const label = cardLabel(card);
  const type = normalizeCardType(card.type);
  const pinned = getPinnedVersion(card);

  if (!isContextTypeSupported(type)) {
    return { cardId: card.id, label, type, wouldTruncate: false, estimatedChars: 0 };
  }
  if (!pinned) {
    return { cardId: card.id, label, type, wouldTruncate: false, estimatedChars: 0 };
  }

  if (type === 'flow' && loadFlowContextText) {
    try {
      const text = await loadFlowContextText(card);
      const estimatedChars = text?.length ?? 0;
      return {
        cardId: card.id,
        label,
        type,
        estimatedChars,
        wouldTruncate: estimatedChars > limits.maxFileChars,
        wouldTruncateUnlessExtended: estimatedChars > standardLimits.maxFileChars,
      };
    } catch {
      return { cardId: card.id, label, type, wouldTruncate: false, estimatedChars: 0 };
    }
  }

  let estimatedChars = 0;
  let pdfPagesTotal;

  if (pinned.artifactRef?.id) {
    try {
      const { artifact } = await fetchArtifact(pinned.artifactRef.id);
      if (artifact?.payload_text) {
        estimatedChars = artifact.payload_text.length;
      }
    } catch {
      /* ignore */
    }
  }

  if (!estimatedChars && type === 'agent_chat' && loadAgentChatText) {
    try {
      const transcript = await loadAgentChatText(card);
      if (transcript) estimatedChars = transcript.length;
    } catch {
      /* ignore */
    }
  }

  if (!estimatedChars && pinned.size) {
    estimatedChars = Math.min(Number(pinned.size) || 0, limits.maxFileChars);
  }

  if (type === 'image') {
    const byteEst = Math.min(Number(pinned.size) || limits.maxImageBytes, limits.maxImageBytes);
    const imageTokens =
      limits.imageTokenEstimateBase + Math.ceil(byteEst / 50_000) * 200;
    return {
      cardId: card.id,
      label,
      type,
      estimatedChars: imageTokens,
      wouldTruncate: byteEst > limits.maxImageBytes,
      wouldTruncateUnlessExtended: byteEst > limits.maxImageBytes,
    };
  }

  if (type === 'pdf' && folderHandle && pinned.filename) {
    try {
      const entry = await getFileHandleAtPath(
        folderHandle,
        folderRelativePathFromVersion(pinned),
      );
      const rawFile = await entry.getFile();
      pdfPagesTotal = await getPdfPageCount(rawFile);
      if (!estimatedChars) {
        estimatedChars = Math.min(
          pdfPagesTotal * 2500,
          limits.maxFileChars,
        );
      }
    } catch {
      /* ignore */
    }
  }

  const wouldTruncateUnderStandard =
    estimatedChars > standardLimits.maxFileChars ||
    (pdfPagesTotal != null && pdfPagesTotal > standardLimits.pdfMaxPages);

  const wouldTruncateUnderProfile =
    estimatedChars > limits.maxFileChars ||
    (pdfPagesTotal != null && pdfPagesTotal > limits.pdfMaxPages);

  return {
    cardId: card.id,
    label,
    type,
    estimatedChars,
    pdfPagesTotal,
    wouldTruncate: profile === 'standard' ? wouldTruncateUnderStandard : wouldTruncateUnderProfile,
    wouldTruncateUnlessExtended: wouldTruncateUnderStandard && profile === 'standard',
  };
}

/**
 * @param {object[]} cards
 * @param {{
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   fetchArtifact?: typeof getArtifact,
 *   profile?: ContextProfileName,
 * }} options
 */
export async function buildContextDocuments(cards, options = {}) {
  return Promise.all(cards.map((card) => loadContextDocumentForCard(card, options)));
}

/**
 * @param {object[]} cards
 * @param {{
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   fetchArtifact?: typeof getArtifact,
 *   profile?: ContextProfileName,
 * }} options
 */
export async function estimateContextDocuments(cards, options = {}) {
  return Promise.all(cards.map((card) => estimateContextDocument(card, options)));
}

/**
 * @param {ContextDocument[]} documents
 * @param {ContextProfileName} [profileName]
 */
/**
 * Apply per-image and total-image limits, then text char budget.
 * @param {ContextDocument[]} documents
 * @param {ContextProfileName} [profileName]
 */
export function applyContextAddBudget(documents, profileName = 'standard') {
  const limits = getContextLimits(profileName);
  let imageCount = 0;
  let totalImageBytes = 0;
  const withImageLimits = documents.map((doc) => {
    if (!doc.imageDataUrl || doc.status !== 'included') return doc;
    const bytes = doc.imageBytes ?? dataUrlByteLength(doc.imageDataUrl);
    if (bytes > limits.maxImageBytes) {
      return {
        ...doc,
        status: 'error',
        note: `Image exceeds ${Math.round(limits.maxImageBytes / (1024 * 1024))}MB limit.`,
        imageDataUrl: undefined,
      };
    }
    if (imageCount >= limits.maxImagesPerAdd) {
      return {
        ...doc,
        status: 'error',
        note: 'Too many images in this context batch.',
        imageDataUrl: undefined,
      };
    }
    if (totalImageBytes + bytes > limits.maxTotalImageBytes) {
      return {
        ...doc,
        status: 'error',
        note: 'Total image size exceeds context budget.',
        imageDataUrl: undefined,
      };
    }
    imageCount += 1;
    totalImageBytes += bytes;
    return doc;
  });
  return applyTotalContextBudget(withImageLimits, profileName);
}

export function applyTotalContextBudget(documents, profileName = 'standard') {
  const limits = getContextLimits(profileName);
  let remaining = limits.maxTotalChars;
  return documents.map((doc) => {
    if (doc.status !== 'included' || !doc.text || doc.imageDataUrl) return doc;
    if (doc.text.length <= remaining) {
      remaining -= doc.text.length;
      return doc;
    }
    const { text: trimmed, truncated } = truncateText(doc.text, Math.max(0, remaining));
    remaining = 0;
    return {
      ...doc,
      text: trimmed,
      truncated: doc.truncated || truncated,
      includedChars: trimmed.length,
      note: doc.note || 'Truncated to fit total context budget.',
    };
  });
}

/**
 * @param {ContextDocument[]} documents
 */
export function summarizeTruncatedDocuments(documents) {
  return documents.filter(
    (d) =>
      d.truncated ||
      d.status !== 'included' ||
      (d.originalChars != null &&
        d.includedChars != null &&
        d.originalChars > d.includedChars),
  );
}

/**
 * @param {ContextDocument[]} documents
 */
export function formatTruncationSummary(documents) {
  const truncated = summarizeTruncatedDocuments(documents).filter(
    (d) => d.status === 'included' && d.truncated,
  );
  if (!truncated.length) return null;
  return truncated
    .map((d) => {
      const parts = [d.label];
      if (d.pdfPagesTotal != null && d.pdfPagesIncluded != null) {
        parts.push(`${d.pdfPagesIncluded}/${d.pdfPagesTotal} pages`);
      }
      if (d.originalChars != null && d.includedChars != null) {
        parts.push(`${d.includedChars.toLocaleString()} of ${d.originalChars.toLocaleString()} chars`);
      }
      return parts.join(': ');
    })
    .join('; ');
}

/**
 * @param {'selected' | 'visible'} mode
 * @param {ContextDocument[]} documents
 */
export function formatAgentSystemContext(mode, documents) {
  const kind = mode === 'visible' ? 'visible canvas items' : 'selected items';
  if (!documents.length) {
    return `The user is focused on ${kind}, but none are listed yet.`;
  }

  const sections = documents.map((doc) => {
    const header = `## ${doc.label} (${doc.type})`;
    if (doc.status === 'included' && doc.imageDataUrl) {
      const meta = doc.text ? `${doc.text}\n` : '';
      return `${header}\n${meta}[Image attached — sent as vision input to the model]`;
    }
    if (doc.status === 'included' && doc.text) {
      return `${header}\n${doc.text}`;
    }
    const reason = doc.note || doc.status;
    return `${header}\n[Content not included: ${reason}]`;
  });

  return `The user is focused on ${kind}:\n\n${sections.join('\n\n')}`;
}

const CONTEXT_ADD_PREFIX =
  '[Canvas context — the following file content is now available for this conversation]';

/**
 * @param {'selected' | 'visible'} mode
 * @param {ContextDocument[]} documents
 */
export function formatContextAddMessage(mode, documents) {
  const body = formatAgentSystemContext(mode, documents);
  return `${CONTEXT_ADD_PREFIX}\n\n${body}`;
}

/**
 * @param {{ label: string }[]} removed
 */
export function formatContextRemoveMessage(removed) {
  if (!removed.length) return '';
  const lines = removed.map((r) => `- ${r.label}`);
  return `[Canvas context update — removed from context]\nThe user removed these files from the active context. Do not assume their contents are still in scope unless mentioned earlier in the chat.\n${lines.join('\n')}`;
}

/**
 * @param {ContextDocument[]} documents
 * @param {number} [previewChars]
 */
export function formatContextAddPreview(documents, previewChars = 280) {
  const included = documents.filter((d) => d.status === 'included');
  if (!included.length) {
    return documents.map((d) => d.label).join(', ');
  }
  return included
    .map((d) => {
      if (d.imageDataUrl) {
        return `${d.label}: [image attached]`;
      }
      if (!d.text) return d.label;
      const excerpt =
        d.text.length > previewChars
          ? `${d.text.slice(0, previewChars)}…`
          : d.text;
      return `${d.label}: ${excerpt.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n');
}

/**
 * OpenAI-style multimodal parts for context_add API messages.
 * @param {'selected' | 'visible'} mode
 * @param {ContextDocument[]} documents
 * @returns {Array<{ type: string, text?: string, image_url?: { url: string, detail?: string } }>}
 */
export function buildContextAddApiContent(mode, documents) {
  const parts = [
    {
      type: 'text',
      text: formatContextAddMessage(mode, documents),
    },
  ];
  for (const doc of documents) {
    if (doc.status === 'included' && doc.imageDataUrl) {
      parts.push({
        type: 'image_url',
        image_url: {
          url: doc.imageDataUrl,
          detail: doc.imageDetail ?? 'low',
        },
      });
    }
  }
  return parts;
}

/**
 * @param {ContextDocument[]} documents
 * @param {'selected' | 'visible'} mode
 * @param {string[]} cardIds
 */
export function contextAddMessageFields(mode, documents, cardIds) {
  return {
    content: formatContextAddMessage(mode, documents),
    preview: formatContextAddPreview(documents),
    labels: documents.map((d) => d.label),
    cardIds,
    apiContent: buildContextAddApiContent(mode, documents),
  };
}

/** Minimal system prompt when file bodies live in chat history. */
export const MINIMAL_AGENT_SYSTEM_CONTEXT =
  'You are a helpful assistant embedded in Canvas, a spatial workspace for architecture and design projects. Answer concisely and practically. File contents are provided in earlier user messages when the user adds or removes canvas items from context.';
