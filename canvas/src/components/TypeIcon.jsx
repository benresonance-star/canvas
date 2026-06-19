import { FileText, Image as ImageIcon, FileCode, Film, Music, File, StickyNote, Table, Link2, Workflow } from 'lucide-react';
import { normalizeCardType } from '../lib/filename.js';

export function TypeIcon({ type, className }) {
  const props = { className, strokeWidth: 1.5, size: 14 };
  const t = normalizeCardType(type);
  if (t === 'bookmark') return <Link2 {...props} />;
  if (t === 'user_note') return <StickyNote {...props} />;
  if (t === 'flow') return <Workflow {...props} />;
  if (t === 'markdown' || t === 'note' || t === 'agent_chat') return <FileText {...props} />;
  if (t === 'image') return <ImageIcon {...props} />;
  if (t === 'html' || t === 'code') return <FileCode {...props} />;
  if (t === 'pdf') return <FileText {...props} />;
  if (t === 'video') return <Film {...props} />;
  if (t === 'audio') return <Music {...props} />;
  if (t === 'spreadsheet') return <Table {...props} />;
  return <File {...props} />;
}
