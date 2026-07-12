import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checkedDirs = [
  path.join(root, 'src', 'App.jsx'),
  path.join(root, 'src', 'components'),
];

const browserSourceRoot = path.join(root, 'src');
const sharedCoreRoot = path.join(root, 'src', 'primitives');

const allowedDeepSyncImports = new Set([
  '../lib/syncUi.js',
  '../lib/syncStaging.js',
]);

function listFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(target, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    return /\.(js|jsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function importSpecifiers(source) {
  const imports = [];
  const pattern = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(source)) !== null) imports.push(match[1]);
  return imports;
}

function isForbiddenSyncImport(specifier) {
  if (allowedDeepSyncImports.has(specifier)) return false;
  return /(?:^|\/)\.\.?\/.*lib\/sync\//.test(specifier)
    || specifier.includes('/lib/sync/');
}

const violations = [];
for (const file of checkedDirs.flatMap(listFiles)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const specifier of importSpecifiers(source)) {
    if (isForbiddenSyncImport(specifier)) {
      violations.push({
        file: path.relative(root, file),
        specifier,
      });
    }
  }
}

for (const file of listFiles(browserSourceRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const specifier of importSpecifiers(source)) {
    if (specifier.includes('server/repositories')) {
      violations.push({
        file: path.relative(root, file),
        specifier,
        reason: 'browser code must not import server repositories',
      });
    }
  }
}

for (const file of listFiles(sharedCoreRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const specifier of importSpecifiers(source)) {
    if (
      specifier.includes('/features/')
      || specifier.includes('/components/')
      || specifier.includes('/server/')
    ) {
      violations.push({
        file: path.relative(root, file),
        specifier,
        reason: 'shared core must not import UI, domain, or server runtime modules',
      });
    }
  }
}

if (violations.length > 0) {
  console.error('Forbidden deep sync imports from UI files:');
  for (const violation of violations) {
    console.error(
      `- ${violation.file}: ${violation.specifier}${violation.reason ? ` (${violation.reason})` : ''}`,
    );
  }
  process.exit(1);
}

console.log('Import boundaries OK.');
