import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirs = new Set(['node_modules', 'dist', '.git']);
const terms = [
  'saveProjectById',
  'loadProjectById',
  'loadSyncedProjectDocument',
  'flushOutgoingProjectDocument',
];

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirs.has(entry.name)) return [];
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    return /\.(js|jsx|md)$/.test(entry.name) ? [entryPath] : [];
  });
}

const rows = [];
for (const file of listFiles(root)) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (relative === 'scripts/report-deprecated-sync-apis.mjs') continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const term of terms) {
      if (line.includes(term)) {
        rows.push(`${relative}:${index + 1}: ${term}`);
      }
    }
  });
}

if (rows.length === 0) {
  console.log('No deprecated sync API references found.');
} else {
  console.log('Deprecated sync API reference report:');
  rows.forEach((row) => console.log(`- ${row}`));
}
