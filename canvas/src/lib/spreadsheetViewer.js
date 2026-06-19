export function isCsvSpreadsheet(pinned) {
  const ext = String(pinned?.ext || '').toLowerCase();
  const filename = String(pinned?.filename || '').toLowerCase();
  return ext === 'csv' || filename.endsWith('.csv');
}
