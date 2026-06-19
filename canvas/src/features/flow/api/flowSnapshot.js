function safeSlug(value) {
  return String(value || 'untitled-flow')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled-flow';
}

export function flowSnapshotPath(flow) {
  return `flows/${safeSlug(flow.title)}--${flow.id}.flow.json`;
}

export async function writeFlowSnapshot(folderHandle, flow) {
  if (!folderHandle) return { ok: false, reason: 'no_folder' };
  try {
    const permission = await folderHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') return { ok: false, reason: 'permission' };
    const flowsDir = await folderHandle.getDirectoryHandle('flows', { create: true });
    const filename = flowSnapshotPath(flow).split('/').pop();
    const handle = await flowsDir.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(`${JSON.stringify({ schemaVersion: 1, ...flow }, null, 2)}\n`);
    await writable.close();
    return { ok: true, path: `flows/${filename}` };
  } catch (error) {
    return { ok: false, reason: error?.message || 'write_failed' };
  }
}

