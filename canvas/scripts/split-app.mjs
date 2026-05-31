import fs from 'fs';
import path from 'path';

const srcDir = path.join(import.meta.dirname, '..', 'src');
const src = fs.readFileSync(path.join(srcDir, 'App.jsx'), 'utf8');
const lines = src.split('\n');

function slice(a, b) {
  return lines.slice(a - 1, b).join('\n');
}

const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
mkdir(path.join(srcDir, 'lib'));
mkdir(path.join(srcDir, 'hooks'));
mkdir(path.join(srcDir, 'components'));
mkdir(path.join(srcDir, 'content'));

// lib/constants.js
fs.writeFileSync(
  path.join(srcDir, 'lib', 'constants.js'),
  slice(9, 19).replace(/^const /gm, 'export const '),
);

// lib/cards.js
fs.writeFileSync(
  path.join(srcDir, 'lib', 'cards.js'),
  `import { CARD_TYPE_DEFAULT_SIZE } from './constants.js';\n\n${slice(30, 33).replace('function getCardPixelSize', 'export function getCardPixelSize')}`,
);

// lib/filename.js
fs.writeFileSync(
  path.join(srcDir, 'lib', 'filename.js'),
  slice(35, 104)
    .replace(/^function /gm, 'export function ')
    .replace(/^\/\*\* Uppercase[\s\S]*?\n/, ''),
);

// lib/sync.js
fs.writeFileSync(
  path.join(srcDir, 'lib', 'sync.js'),
  `import { fileTypeFromExt } from './filename.js';\n\n` +
    slice(61, 94)
      .replace(/^function /gm, 'export function '),
);

// lib/persistence.js
fs.writeFileSync(
  path.join(srcDir, 'lib', 'persistence.js'),
  `import { DATA_URL_PERSIST_MAX_CHARS, PROJECT_JSON_SOFT_LIMIT, PROJECT_KEY } from './constants.js';\nimport { fileTypeFromExt } from './filename.js';\n\n` +
    slice(119, 219)
      .replace(/^async function loadProject/gm, 'export async function loadProject')
      .replace(/^function stripVersionForPersist/gm, 'export function stripVersionForPersist')
      .replace(/^function normalizeLoadedProject/gm, 'export function normalizeLoadedProject')
      .replace(/^function stateForPersist/gm, 'export function stateForPersist')
      .replace(/^async function saveProject/gm, 'export async function saveProject'),
);

// lib/readFile.js
fs.writeFileSync(
  path.join(srcDir, 'lib', 'readFile.js'),
  `import {\n  PREVIEW_MAX_BYTES_IMAGE_PDF,\n  STORAGE_LIMIT,\n} from './constants.js';\nimport { fileTypeFromExt } from './filename.js';\n\n` +
    slice(224, 281).replace(/^async function readFileEntry/gm, 'export async function readFileEntry'),
);

// hooks/useIsMobile.js
fs.writeFileSync(
  path.join(srcDir, 'hooks', 'useIsMobile.js'),
  `import { useState, useEffect } from 'react';\n\n` +
    slice(286, 295).replace(/^function useIsMobile/gm, 'export function useIsMobile'),
);

const componentExports = [
  { file: 'TypeIcon.jsx', start: 106, end: 114, imports: `import { FileText, Image as ImageIcon, FileCode, Film, File } from 'lucide-react';\n\n`, exportFn: true },
  { file: 'Canvas.jsx', start: 750, end: 943, imports: '' },
  { file: 'CanvasCard.jsx', start: 948, end: 1101, imports: '' },
  { file: 'PdfPreviewFrame.jsx', start: 1106, end: 1165, imports: '' },
  { file: 'CardPreview.jsx', start: 1170, end: 1264, imports: '' },
  { file: 'CardModal.jsx', start: 1269, end: 1329, imports: '' },
  { file: 'ModalContent.jsx', start: 1331, end: 1429, imports: '' },
  { file: 'MobileView.jsx', start: 1434, end: 1508, imports: '' },
  { file: 'SearchOverlay.jsx', start: 1513, end: 1552, imports: '' },
  { file: 'ChangeFolderDialog.jsx', start: 1557, end: 1602, imports: '' },
  { file: 'SyncConfirm.jsx', start: 1607, end: 1654, imports: '' },
];

for (const c of componentExports) {
  let body = slice(c.start, c.end);
  if (c.exportFn) body = body.replace(/^function TypeIcon/, 'export function TypeIcon');
  else body = body.replace(/^function (\w+)/, 'export function $1');
  fs.writeFileSync(path.join(srcDir, 'components', c.file), c.imports + body);
}

// ProjectCanvas only
let main = slice(300, 745);
main = main.replace(/^export default function ProjectCanvas/, 'export default function ProjectCanvas');
fs.writeFileSync(path.join(srcDir, 'App.jsx'), main);

console.log('Split complete');
