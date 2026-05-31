import { readFileEntry } from './readFile.js';
import { isFolderBackedCanvasCard } from './filename.js';

/**
 * Re-load note bodies stripped from cache when folder is linked.
 * @param {object[]} cards
 * @param {{ folderHandle?: FileSystemDirectoryHandle | null, folderPresentKeys?: Set<string> | string[] | null }} opts
 */
export async function hydrateStrippedCardContent(cards, opts = {}) {
  const { folderHandle, folderPresentKeys } = opts;
  if (!folderHandle || !folderPresentKeys) return cards;

  const keySet =
    folderPresentKeys instanceof Set
      ? folderPresentKeys
      : new Set(folderPresentKeys);

  let changed = false;
  const next = [];

  for (const card of cards ?? []) {
    if (!isFolderBackedCanvasCard(card)) {
      next.push(card);
      continue;
    }
    if (!card.key || !keySet.has(card.key)) {
      next.push(card);
      continue;
    }

    const versions = [];
    let cardChanged = false;
    for (const v of card.versions ?? []) {
      if (!v.contentStripped || (v.content != null && v.content !== '')) {
        versions.push(v);
        continue;
      }
      try {
        const entry = await folderHandle.getFileHandle(v.filename, { create: false });
        const file = await readFileEntry(entry, { cacheKey: v.previewCacheKey });
        if (file?.content != null) {
          versions.push({
            ...v,
            content: file.content,
            contentStripped: false,
          });
          cardChanged = true;
          changed = true;
          continue;
        }
      } catch {
        /* missing file */
      }
      versions.push(v);
    }
    next.push(cardChanged ? { ...card, versions } : card);
  }

  return changed ? next : cards;
}
