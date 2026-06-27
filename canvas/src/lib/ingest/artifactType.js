import { fileTypeFromExt } from '../filename.js';

export function artifactTypeFromCardType(cardType, ext) {
  if (cardType === 'bookmark') return 'other';
  if (cardType === 'agent_chat') return 'agent_chat';
  if (cardType === 'user_note') return 'user_note';
  if (cardType === 'user_task') return 'user_task';
  if (cardType === 'image') return 'image';
  if (cardType === 'video') return 'video';
  if (cardType === 'audio') return 'audio';
  if (cardType === 'spreadsheet') return 'doc';
  if (cardType === 'pdf') return 'doc';
  if (
    cardType === 'html'
    || cardType === 'markdown'
    || cardType === 'note'
    || cardType === 'code'
  ) return 'doc';
  if (cardType === 'file' && ext) {
    const fromExt = fileTypeFromExt(ext);
    if (fromExt === 'video') return 'video';
    if (fromExt === 'audio') return 'audio';
    if (fromExt === 'image') return 'image';
  }
  return 'other';
}

export function artifactTypeFromFile(entryName, { cardType } = {}) {
  if (cardType === 'agent_chat') return 'agent_chat';
  if (cardType === 'user_note') return 'user_note';
  if (cardType === 'user_task') return 'user_task';
  const ext = entryName.split('.').pop().toLowerCase();
  return artifactTypeFromCardType(fileTypeFromExt(ext), ext);
}

export function cardTypeFromSync({ ext, existingCardType, prefix, name }) {
  if (existingCardType === 'bookmark') return 'bookmark';
  if (existingCardType === 'agent_chat') return 'agent_chat';
  if (existingCardType === 'user_note') return 'user_note';
  if (existingCardType === 'user_task') return 'user_task';
  if (prefix === 'links') return 'bookmark';
  if (prefix === 'notes' && name?.startsWith('agent-chat')) return 'agent_chat';
  if (prefix === 'notes') return 'user_note';
  if (prefix === 'tasks') return 'user_task';
  return fileTypeFromExt(ext);
}
