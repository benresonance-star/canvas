#!/usr/bin/env node
/**
 * Capture architecture baseline metrics for ARCHITECTURE_MASTER_SPEC.md §11.
 * Usage: node scripts/capture-architecture-baseline.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SRC = join(ROOT, 'src');
const APP = join(SRC, 'App.jsx');
const SERVER_INDEX = join(ROOT, 'server', 'index.js');

function countLines(path) {
  return readFileSync(path, 'utf8').split('\n').length;
}

function countMatches(path, pattern) {
  const text = readFileSync(path, 'utf8');
  return (text.match(pattern) ?? []).length;
}

function walkTests(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTests(p, acc);
    else if (name.endsWith('.test.js')) acc.push(p);
  }
  return acc;
}

function countDeepSyncImportsFromApp() {
  const text = readFileSync(APP, 'utf8');
  const imports = text.match(/from '\.\/lib\/sync\/[^']+'/g) ?? [];
  return imports.length;
}

const appLoc = countLines(APP);
const serverLoc = countLines(SERVER_INDEX);
const hookCalls =
  countMatches(APP, /\buse(State|Effect|Callback|Memo|Ref)\b/g);
const testFiles = walkTests(join(ROOT, 'src')).length + walkTests(join(ROOT, 'server')).length;
const deepSyncImports = countDeepSyncImportsFromApp();

const report = {
  capturedAt: new Date().toISOString(),
  metrics: {
    appJsxLoc: appLoc,
    appHookCalls: hookCalls,
    serverIndexLoc: serverLoc,
    deepSyncImportsFromApp: deepSyncImports,
    testFileCount: testFiles,
  },
  targets: {
    appJsxLoc: 800,
    appHookCalls: 20,
    serverIndexLoc: 150,
    deepSyncImportsFromApp: 0,
  },
};

console.log(JSON.stringify(report, null, 2));
