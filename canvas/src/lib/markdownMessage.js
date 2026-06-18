function splitTableRow(line) {
  const trimmed = String(line ?? '').trim();
  const withoutEdges = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return withoutEdges.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return (
    cells.length > 1
    && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function isTableStart(lines, index) {
  return (
    index + 1 < lines.length
    && lines[index].includes('|')
    && isTableSeparator(lines[index + 1])
    && splitTableRow(lines[index]).length === splitTableRow(lines[index + 1]).length
  );
}

function parseParagraph(lines, start) {
  const text = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) break;
    if (isTableStart(lines, index)) break;
    if (/^\s*(?:#{1,6}\s+|[-*]\s+|\d+\.\s+)/.test(line)) break;
    text.push(line.trim());
    index += 1;
  }
  return {
    block: { type: 'paragraph', text: text.join('\n') },
    nextIndex: index,
  };
}

function parseHeading(line) {
  const match = String(line ?? '').match(/^\s*(#{1,6})\s+(.*)$/);
  if (!match) return null;
  return {
    type: 'heading',
    level: match[1].length,
    text: match[2].trim(),
  };
}

function parseList(lines, start) {
  const ordered = /^\s*\d+\.\s+/.test(lines[start]);
  const items = [];
  let index = start;
  const matcher = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
  const startNumber = ordered
    ? Number(lines[start].match(/^\s*(\d+)\.\s+/)?.[1] ?? 1)
    : undefined;
  while (index < lines.length) {
    const line = lines[index];
    const match = line.match(matcher);
    if (!match) {
      const nestedBullet = line.match(/^\s{2,}[-*]\s+(.*)$/);
      const continuation = line.match(/^\s{2,}(\S.*)$/);
      if (items.length && (nestedBullet || continuation)) {
        items[items.length - 1] += `\n${(nestedBullet?.[1] ?? continuation?.[1] ?? '').trim()}`;
        index += 1;
        continue;
      }
      break;
    }
    items.push(match[1].trim());
    index += 1;
  }
  return {
    block: { type: 'list', ordered, start: startNumber, items },
    nextIndex: index,
  };
}

function parseTable(lines, start) {
  const headers = splitTableRow(lines[start]);
  let index = start + 2;
  const rows = [];
  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    const cells = splitTableRow(lines[index]);
    rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ''));
    index += 1;
  }
  return {
    block: { type: 'table', headers, rows },
    nextIndex: index,
  };
}

export function parseMarkdownMessage(source) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }
    if (isTableStart(lines, index)) {
      const parsed = parseTable(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
      continue;
    }
    const heading = parseHeading(lines[index]);
    if (heading) {
      blocks.push(heading);
      index += 1;
      continue;
    }
    if (/^\s*(?:[-*]\s+|\d+\.\s+)/.test(lines[index])) {
      const parsed = parseList(lines, index);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
      continue;
    }
    const parsed = parseParagraph(lines, index);
    blocks.push(parsed.block);
    index = parsed.nextIndex;
  }
  return blocks;
}

export function parseInlineMarkdown(source) {
  const text = String(source ?? '');
  const segments = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, match.index) });
    }
    const token = match[0];
    if (token.startsWith('`')) {
      segments.push({ type: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('**')) {
      segments.push({ type: 'strong', text: token.slice(2, -2) });
    } else {
      segments.push({ type: 'emphasis', text: token.slice(1, -1) });
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', text: text.slice(cursor) });
  }
  return segments;
}

export function markdownViewToggleLabel(formattedView) {
  return formattedView ? 'Plain text' : 'Formatted';
}
