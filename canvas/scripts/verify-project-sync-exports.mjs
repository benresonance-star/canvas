import fs from 'fs';
import path from 'path';

const root = path.join(import.meta.dirname, '..');
const barrelPath = path.join(root, 'src/lib/projectSync.js');
const manifestPath = path.join(root, 'docs/PROJECT_SYNC_API.md');

const barrel = fs.readFileSync(barrelPath, 'utf8');
const manifest = fs.readFileSync(manifestPath, 'utf8');

const exportNames = new Set();
for (const m of barrel.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) {
  exportNames.add(m[1]);
}
for (const m of barrel.matchAll(/^export\s*\{([^}]+)\}/gm)) {
  for (const part of m[1].split(',')) {
    const name = part.trim().split(/\s+as\s+/).pop().trim();
    if (name) exportNames.add(name);
  }
}

const manifestNames = new Set();
for (const m of manifest.matchAll(/^- `(\w+)`/gm)) {
  manifestNames.add(m[1]);
}

const missingFromBarrel = [...manifestNames].filter((n) => !exportNames.has(n));
const extraInBarrel = [...exportNames].filter((n) => !manifestNames.has(n));

if (missingFromBarrel.length || extraInBarrel.length) {
  console.error('projectSync export manifest mismatch');
  if (missingFromBarrel.length) {
    console.error('  Missing from barrel:', missingFromBarrel.join(', '));
  }
  if (extraInBarrel.length) {
    console.error('  Extra in barrel (update PROJECT_SYNC_API.md):', extraInBarrel.join(', '));
  }
  process.exit(1);
}

console.log(`OK: ${exportNames.size} exports match manifest`);
