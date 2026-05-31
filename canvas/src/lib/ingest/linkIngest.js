import { createRelationship } from '../primitivesApi.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

function parseYamlLinksBlock(fm) {
  const links = [];
  const lines = fm.split('\n');
  let inLinks = false;
  for (const line of lines) {
    if (/^links\s*:/.test(line.trim())) {
      inLinks = true;
      const inline = line.replace(/^links\s*:\s*/, '').trim();
      if (inline.startsWith('[')) {
        try {
          const arr = JSON.parse(inline.replace(/'/g, '"'));
          if (Array.isArray(arr)) links.push(...arr.map(String));
        } catch {
          /* ignore */
        }
        inLinks = false;
      }
      continue;
    }
    if (inLinks) {
      const m = line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/);
      if (m) links.push(m[1].trim());
      else if (line.trim() && !line.trim().startsWith('-')) inLinks = false;
    }
  }
  return links;
}

export function extractLinkTargetsFromMarkdown(content) {
  if (!content || typeof content !== 'string') return [];
  const keys = new Set();
  const fm = content.match(FRONTMATTER_RE);
  if (fm) {
    for (const k of parseYamlLinksBlock(fm[1])) keys.add(k);
  }
  let m;
  while ((m = WIKILINK_RE.exec(content)) !== null) {
    keys.add(m[1].trim());
  }
  return [...keys];
}

export function buildCardKeyToArtifactRef(cards, grouped = {}) {
  const map = new Map();
  for (const card of cards || []) {
    const pinned =
      card.versions?.find((v) => v.version === card.pinnedVersion) || card.versions?.[0];
    if (pinned?.artifactRef?.id) map.set(card.key, pinned.artifactRef);
  }
  for (const [key, group] of Object.entries(grouped)) {
    for (const v of group.versions || []) {
      if (v.artifactRef?.id) map.set(key, v.artifactRef);
    }
  }
  return map;
}

export async function ingestLinksFromVersions({
  clusterId,
  flatVersions,
  cardKeyToRef,
  cards,
}) {
  if (!clusterId) return { created: 0 };

  let created = 0;
  for (const v of flatVersions) {
    if (v.cardType !== 'user_note' && v.cardType !== 'markdown') continue;
    const sourceRef = v.artifactRef || cardKeyToRef.get(v.cardKey);
    if (!sourceRef?.id || sourceRef.type !== 'artifact') continue;

    const targets = extractLinkTargetsFromMarkdown(v.content);
    for (const targetKey of targets) {
      const toRef = cardKeyToRef.get(targetKey);
      if (!toRef?.id || toRef.id === sourceRef.id) continue;
      try {
        const res = await createRelationship(
          clusterId,
          {
            from_ref: sourceRef,
            to_ref: toRef,
            type: 'references',
            provenance: [sourceRef],
            metadata: { source: 'frontmatter_or_wikilink', targetCardKey: targetKey },
          },
          { idempotent: true },
        );
        if (res.created) created += 1;
      } catch {
        /* skip invalid */
      }
    }
  }
  return { created };
}

export async function createLinksFromSource(clusterId, sourceRef, targetRefs, relType = 'references') {
  let created = 0;
  for (const toRef of targetRefs || []) {
    if (!toRef?.id || toRef.id === sourceRef?.id) continue;
    try {
      const res = await createRelationship(
        clusterId,
        {
          from_ref: sourceRef,
          to_ref: toRef,
          type: relType,
          provenance: [sourceRef],
          metadata: { source: 'ui' },
        },
        { idempotent: true },
      );
      if (res.created) created += 1;
    } catch {
      /* skip */
    }
  }
  return created;
}
