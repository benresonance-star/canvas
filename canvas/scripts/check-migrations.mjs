import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'server', 'migrations');
const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();

const issues = [];
files.forEach((file, index) => {
  const expectedPrefix = String(index + 1).padStart(4, '0');
  if (!file.startsWith(`${expectedPrefix}_`)) {
    issues.push(`${file}: expected prefix ${expectedPrefix}_`);
  }
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  if (/\bCONCURRENTLY\b/i.test(sql)) {
    issues.push(`${file}: CONCURRENTLY cannot run inside transactional migrations`);
  }
});

if (issues.length > 0) {
  console.error('Migration check failed:');
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log(`Migration check OK (${files.length} files).`);
