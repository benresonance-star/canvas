const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'by',
  'for',
  'in',
  'is',
  'of',
  'on',
  'or',
  'the',
  'there',
  'to',
]);

export function normalizeSemanticText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactSemanticText(value) {
  return normalizeSemanticText(value).replace(/\s+/g, '');
}

function singularize(value) {
  return normalizeSemanticText(value)
    .split(' ')
    .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token))
    .join(' ');
}

function semanticTokens(value) {
  return singularize(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function levenshtein(left, right) {
  const a = compactSemanticText(left);
  const b = compactSemanticText(right);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const rows = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  for (let column = 1; column <= b.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

function addVocabularyEntry(entries, value, source, elementId) {
  const raw = String(value ?? '').trim();
  if (!raw) return;
  const normalized = normalizeSemanticText(raw);
  if (!normalized) return;
  const compact = compactSemanticText(raw);
  const key = `${source}:${normalized}`;
  const existing = entries.get(key) ?? {
    value: raw,
    source,
    normalized,
    compact,
    tokens: semanticTokens(raw),
    count: 0,
    elementIds: [],
  };
  existing.count += 1;
  if (elementId && existing.elementIds.length < 20) existing.elementIds.push(elementId);
  entries.set(key, existing);
}

export function buildSemanticModelVocabulary(preparedModel) {
  const entries = new Map();
  (preparedModel?.elements ?? []).forEach((element) => {
    addVocabularyEntry(entries, element.name, 'name', element.id);
    addVocabularyEntry(entries, element.typeName, 'typeName', element.id);
    addVocabularyEntry(entries, element.id, 'id', element.id);
    addVocabularyEntry(entries, element.ifcGlobalId, 'ifcGlobalId', element.id);
    addVocabularyEntry(entries, element.ifcClass, 'ifcClass', element.id);
  });
  (preparedModel?.properties ?? []).forEach((property) => {
    addVocabularyEntry(entries, property.value, 'propertyValue', property.elementId);
  });
  const rankedEntries = [...entries.values()]
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
  return {
    entries: rankedEntries.slice(0, 1000),
    nameTypeVocabulary: rankedEntries
      .filter((entry) => entry.source === 'name' || entry.source === 'typeName')
      .slice(0, 80)
      .map((entry) => ({ value: entry.value, source: entry.source, count: entry.count })),
    tokenClusters: rankedEntries
      .flatMap((entry) => entry.tokens)
      .reduce((clusters, token) => {
        clusters.set(token, (clusters.get(token) ?? 0) + 1);
        return clusters;
      }, new Map()),
  };
}

function extractNameTermsFromWhere(where, terms = []) {
  if (!where || typeof where !== 'object') return terms;
  if (where.nameContains) terms.push(...(Array.isArray(where.nameContains) ? where.nameContains : [where.nameContains]));
  if (where.semanticAliases?.term) terms.push(where.semanticAliases.term);
  if (Array.isArray(where.semanticAliases)) {
    where.semanticAliases.forEach((entry) => {
      if (entry?.term) terms.push(entry.term);
    });
  }
  [...(where.and ?? []), ...(where.or ?? [])].forEach((entry) => extractNameTermsFromWhere(entry, terms));
  if (where.not) extractNameTermsFromWhere(where.not, terms);
  return terms;
}

function scoreVocabularyEntry(term, entry) {
  const normalizedTerm = normalizeSemanticText(term);
  const singularTerm = singularize(term);
  const compactTerm = compactSemanticText(singularTerm);
  if (!compactTerm) return 0;
  if (entry.compact === compactTerm) return 1;
  if (entry.compact.includes(compactTerm) || compactTerm.includes(entry.compact)) return 0.92;
  const termTokens = semanticTokens(term);
  const overlap = termTokens.filter((token) => entry.tokens.some((entryToken) => (
    entryToken === token || entryToken.includes(token) || token.includes(entryToken)
  ))).length;
  if (termTokens.length > 0 && overlap === termTokens.length) return 0.82;
  const distance = levenshtein(normalizedTerm, entry.normalized);
  if (compactTerm.length >= 5 && distance <= 2) return 0.72;
  return overlap > 0 ? Math.min(0.55, overlap / Math.max(termTokens.length, entry.tokens.length)) : 0;
}

function aliasesFromMatches(term, vocabulary, aliasMemory) {
  const memoryKey = compactSemanticText(term);
  const remembered = aliasMemory?.[memoryKey];
  if (remembered?.aliases?.length > 0) {
    return {
      term,
      aliases: remembered.aliases,
      confidence: remembered.confidence ?? 0.9,
      source: 'session',
      explanation: remembered.explanation ?? `Reused semantic aliases for "${term}".`,
      fields: remembered.fields ?? ['name', 'typeName', 'id', 'ifcGlobalId', 'ifcClass', 'propertyValue'],
    };
  }
  const matches = (vocabulary?.entries ?? [])
    .map((entry) => ({ entry, score: scoreVocabularyEntry(term, entry) }))
    .filter((match) => match.score >= 0.5)
    .sort((left, right) => right.score - left.score || right.entry.count - left.entry.count)
    .slice(0, 10);
  if (matches.length === 0) {
    return {
      term,
      aliases: [singularize(term), compactSemanticText(term)].filter(Boolean),
      confidence: 0.2,
      source: 'none',
      explanation: `No close BIM vocabulary match found for "${term}".`,
      fields: ['name', 'typeName', 'id', 'ifcGlobalId', 'ifcClass', 'propertyValue'],
    };
  }
  const aliases = [...new Set([
    singularize(term),
    compactSemanticText(term),
    ...matches.map((match) => match.entry.value),
    ...matches.map((match) => match.entry.compact),
  ].filter(Boolean))].slice(0, 12);
  const fields = [...new Set(matches.map((match) => match.entry.source))];
  return {
    term,
    aliases,
    confidence: matches[0].score,
    source: 'vocabulary',
    explanation: `Resolved "${term}" against BIM vocabulary fields: ${fields.join(', ')}.`,
    fields,
  };
}

export function resolveBimQuestionSemantics({
  utterance = '',
  draft = null,
  vocabulary = null,
  aliasMemory = {},
} = {}) {
  const queryTerms = extractNameTermsFromWhere(draft?.query?.where);
  const terms = [...new Set(queryTerms.map((term) => String(term ?? '').trim()).filter(Boolean))];
  if (terms.length === 0) {
    return {
      terms: [],
      aliases: [],
      confidence: 1,
      source: 'none',
      explanation: 'No semantic alias resolution needed.',
      warnings: [],
      memoryUpdates: {},
    };
  }
  const resolvedTerms = terms.map((term) => aliasesFromMatches(term, vocabulary, aliasMemory));
  const aliases = [...new Set(resolvedTerms.flatMap((entry) => entry.aliases))];
  const confidence = Math.max(...resolvedTerms.map((entry) => entry.confidence), 0);
  const source = resolvedTerms.some((entry) => entry.source === 'session')
    ? 'session'
    : (resolvedTerms.some((entry) => entry.source === 'vocabulary') ? 'vocabulary' : 'none');
  const warnings = resolvedTerms
    .filter((entry) => entry.confidence < 0.45)
    .map((entry) => `Searched aliases for "${entry.term}" but found no close BIM vocabulary match.`);
  const memoryUpdates = resolvedTerms
    .filter((entry) => entry.confidence >= 0.45 && entry.aliases.length > 0)
    .reduce((updates, entry) => {
      updates[compactSemanticText(entry.term)] = entry;
      return updates;
    }, {});
  return {
    utterance,
    terms,
    aliases,
    resolvedTerms,
    confidence,
    source,
    explanation: resolvedTerms.map((entry) => entry.explanation).join(' '),
    warnings,
    memoryUpdates,
  };
}

function mapWhere(where, resolution) {
  if (!where || typeof where !== 'object') return where;
  const next = { ...where };
  if (next.nameContains && resolution?.confidence >= 0.45) {
    const terms = Array.isArray(next.nameContains) ? next.nameContains : [next.nameContains];
    delete next.nameContains;
    next.semanticAliases = terms.map((term) => ({
      term,
      aliases: resolution.resolvedTerms?.find((entry) => entry.term === term)?.aliases ?? resolution.aliases,
      fields: ['name', 'typeName', 'id', 'ifcGlobalId', 'ifcClass', 'propertyValue'],
    }));
  }
  if (next.and) next.and = next.and.map((entry) => mapWhere(entry, resolution));
  if (next.or) next.or = next.or.map((entry) => mapWhere(entry, resolution));
  if (next.not) next.not = mapWhere(next.not, resolution);
  return next;
}

export function applySemanticResolutionToBql(draft, resolution) {
  if (!draft?.query || !resolution || resolution.terms.length === 0 || resolution.confidence < 0.45) return draft;
  return {
    ...draft,
    query: {
      ...draft.query,
      where: mapWhere(draft.query.where, resolution),
    },
    semanticResolution: resolution,
    warnings: [...(draft.warnings ?? []), ...(resolution.warnings ?? [])],
  };
}
