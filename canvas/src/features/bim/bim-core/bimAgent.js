const CLASS_PATTERNS = [
  { pattern: /\bbeams?\b/i, ifcClass: 'IfcBeam', label: 'beams' },
  { pattern: /\bmembers?\b/i, ifcClass: 'IfcMember', label: 'members' },
  { pattern: /\bslabs?\b/i, ifcClass: 'IfcSlab', label: 'slabs' },
  { pattern: /\bwalls?\b/i, ifcClass: 'IfcWall', label: 'walls' },
  { pattern: /\bdoors?\b/i, ifcClass: 'IfcDoor', label: 'doors' },
  { pattern: /\bcolumns?\b/i, ifcClass: 'IfcColumn', label: 'columns' },
  { pattern: /\bplates?\b/i, ifcClass: 'IfcPlate', label: 'plates' },
  { pattern: /\bstairs?\b/i, ifcClass: 'IfcStair', label: 'stairs' },
  { pattern: /\broofs?\b/i, ifcClass: 'IfcRoof', label: 'roofs' },
  { pattern: /\bspaces?|rooms?\b/i, ifcClass: 'IfcSpace', label: 'spaces' },
  { pattern: /\bfurnishings?|furniture\b/i, ifcClass: 'IfcFurnishingElement', label: 'furnishings' },
];

const WINDOW_PATTERN = /\bwindows?\b/i;
const COUNT_PATTERN = /\b(how many|count|number of)\b/i;
const SUM_PATTERN = /\b(total|sum|combined)\b/i;
const AREA_PATTERN = /\barea\b/i;
const VOLUME_PATTERN = /\bvolume\b/i;
const LENGTH_PATTERN = /\blength\b/i;
const ISOLATE_PATTERN = /\b(isolate|only|just)\b/i;
const GHOST_PATTERN = /\bghost|fade|dim|context\b/i;
const HIGHLIGHT_PATTERN = /\b(highlight|select|find|show)\b/i;
const FIRE_RATED_PATTERN = /\bfire[-\s]?rated|fire rating|firerating\b/i;
const COLOR_BY_PATTERN = /\b(?:color|colour)\s+by\s+([a-zA-Z][a-zA-Z\s.]+)\b/i;
const TREE_PATTERN = /\b(trees?|plants?|vegetation|landscaping)\b/i;
const GROUP_BY_PATTERN = /\b(?:by|per|group(?:ed)?\s+by)\s+(ifc\s+class|class|storey|story|floor|type|name)\b/i;

function normalizeInput(input) {
  return String(input ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeStoreyText(value) {
  return normalizeInput(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleStoreyLabel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

export function buildBimStoreyCatalog(preparedModel) {
  const counts = new Map();
  for (const element of preparedModel?.elements ?? []) {
    const label = String(element?.storeyId ?? '').trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count], index) => ({
      id: value,
      value,
      label: titleStoreyLabel(value),
      normalized: normalizeStoreyText(value),
      count,
      order: index,
    }))
    .sort((left, right) => left.order - right.order);
}

function detectStoreyReference(text) {
  const explicit = text.match(/\b(?:on|at|in)\s+(?:the\s+)?(ground floor|basement|roof(?:\s+(?:level|floor|storey|story))?|level\s*\d+|floor\s*\d+|storey\s*\d+|story\s*\d+|first floor|second floor|upper floor)\b/i);
  if (explicit) return explicit[1].trim();
  if (/\bground\b/i.test(text)) return 'ground floor';
  if (/\broof\s+(level|floor|storey|story)?\b/i.test(text)) return 'roof';
  if (/\bfirst floor\b/i.test(text)) return 'first floor';
  if (/\bsecond floor\b/i.test(text)) return 'second floor';
  if (/\bupper floor\b/i.test(text)) return 'upper floor';
  return null;
}

function matchingStoreyChoice(reference, catalog) {
  const normalized = normalizeStoreyText(reference);
  if (!normalized) return null;
  return catalog.find((entry) => entry.normalized === normalized)
    ?? catalog.find((entry) => entry.normalized.includes(normalized) || normalized.includes(entry.normalized))
    ?? null;
}

function probableStoreyChoice(reference, catalog) {
  const normalized = normalizeStoreyText(reference);
  if (normalized === 'first floor') {
    return matchingStoreyChoice('level 1', catalog)
      ?? catalog.find((entry) => /\blevel\s*1\b/i.test(entry.normalized))
      ?? catalog[1]
      ?? null;
  }
  if (normalized === 'second floor') {
    return matchingStoreyChoice('level 2', catalog)
      ?? catalog.find((entry) => /\blevel\s*2\b/i.test(entry.normalized))
      ?? catalog[2]
      ?? null;
  }
  if (normalized === 'upper floor') {
    return catalog.find((entry) => !/\bground\b/i.test(entry.normalized) && !/\broof\b/i.test(entry.normalized))
      ?? catalog.at(-1)
      ?? null;
  }
  return null;
}

function listStoreyChoices(choices) {
  if (choices.length <= 1) return choices[0]?.label ?? '';
  if (choices.length === 2) return `${choices[0].label} and ${choices[1].label}`;
  return `${choices.slice(0, -1).map((choice) => choice.label).join(', ')} and ${choices.at(-1).label}`;
}

export function maybeClarifyBimStoreyReference(utterance, preparedModel) {
  const text = normalizeInput(utterance);
  const reference = detectStoreyReference(text);
  const choices = buildBimStoreyCatalog(preparedModel);
  if (!reference || choices.length === 0) return null;

  const exact = matchingStoreyChoice(reference, choices);
  const probable = exact ? null : probableStoreyChoice(reference, choices);
  const normalizedReference = normalizeStoreyText(reference);
  const needsClarification = !exact || ['first floor', 'second floor', 'upper floor'].includes(normalizedReference);
  if (!needsClarification) return null;

  const suggested = probable ?? exact ?? choices[0] ?? null;
  return {
    kind: 'storey',
    status: suggested ? (probable || exact ? 'probable' : 'missing') : 'missing',
    originalUtterance: text,
    originalReference: reference,
    suggestedValue: suggested?.value ?? null,
    suggestedLabel: suggested?.label ?? null,
    choices: choices.map((choice) => ({
      value: choice.value,
      label: choice.label,
      count: choice.count,
    })),
    question: suggested
      ? `I found ${listStoreyChoices(choices)}. Do you mean ${suggested.label}?`
      : `I found ${listStoreyChoices(choices)}. Which storey do you mean?`,
  };
}

export function resolveBimStoreyClarificationAnswer(answer, clarification) {
  if (!clarification || clarification.kind !== 'storey') return null;
  const text = normalizeStoreyText(answer);
  if (!text) return null;
  const choices = clarification.choices ?? [];
  const suggested = choices.find((choice) => choice.value === clarification.suggestedValue) ?? choices[0] ?? null;
  if (/^(yes|y|yeah|yep|correct|that|that one|ok|okay)$/i.test(text)) return suggested;
  const exactChoice = choices.find((choice) => {
    const normalizedChoice = normalizeStoreyText(choice.value);
    const normalizedLabel = normalizeStoreyText(choice.label);
    return normalizedChoice === text || normalizedLabel === text;
  });
  if (exactChoice) return exactChoice;
  const ordinalMatch = text.match(/\b(?:the\s+)?(first|second|third|1st|2nd|3rd|1|2|3|middle|last)\b/i);
  if (ordinalMatch) {
    const token = ordinalMatch[1].toLowerCase();
    if (token === 'first' || token === '1st' || token === '1') return choices[0] ?? null;
    if (token === 'second' || token === '2nd' || token === '2' || token === 'middle') return choices[1] ?? choices[0] ?? null;
    if (token === 'third' || token === '3rd' || token === '3') return choices[2] ?? choices.at(-1) ?? null;
    if (token === 'last') return choices.at(-1) ?? null;
  }
  return choices.find((choice) => {
    const normalizedChoice = normalizeStoreyText(choice.value);
    const normalizedLabel = normalizeStoreyText(choice.label);
    return normalizedChoice.includes(text)
      || text.includes(normalizedChoice)
      || normalizedLabel.includes(text)
      || text.includes(normalizedLabel);
  }) ?? null;
}

function detectIfcClass(text) {
  const match = CLASS_PATTERNS.find((entry) => entry.pattern.test(text));
  if (match) return match;
  if (WINDOW_PATTERN.test(text)) {
    return { ifcClass: 'IfcWindow', semanticType: 'WindowAssembly', label: 'windows' };
  }
  return null;
}

function detectStorey(text) {
  const explicit = text.match(/\b(?:on|at|in)\s+(?:the\s+)?(ground floor|basement|roof(?:\s+(?:level|floor|storey|story))?|level\s*\d+|floor\s*\d+|storey\s*\d+|story\s*\d+)\b/i);
  if (explicit) {
    const value = explicit[1].trim();
    if (/^roof\b/i.test(value)) return 'roof';
    return value;
  }
  if (/\bground\b/i.test(text)) return 'ground floor';
  if (/\broof\s+(level|floor|storey|story)\b/i.test(text)) return 'roof';
  if (/\bfirst floor\b/i.test(text)) return 'first floor';
  if (/\bsecond floor\b/i.test(text)) return 'second floor';
  return null;
}

function detectNameContains(text) {
  const match = text.match(/\b(?:named|name contains|called|containing)\s+["']?([^"',]+?)["']?$/i);
  return match?.[1]?.trim() || null;
}

function singularizeObjectPhrase(value) {
  return String(value ?? '')
    .trim()
    .replace(/\b(the|all|any|some|number of)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\b([a-zA-Z]{3,})s\b/g, '$1')
    .trim();
}

function detectGenericObjectNameTarget(text) {
  const patterns = [
    /\b(?:how many|count|number of)\s+(.+?)\s+(?:are|is|exist|do|does|in|on|$)/i,
    /\b(?:show|find|select|highlight|isolate)\s+(?:all\s+)?(.+?)(?:\s+(?:in|on|by|from)\b|$)/i,
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  const phrase = singularizeObjectPhrase(match?.[1]);
  if (!phrase || phrase.length < 3) return null;
  if (/^(many|there|model|file|project|element|elements|object|objects|bim objects?)$/i.test(phrase)) return null;
  if (CLASS_PATTERNS.some((entry) => entry.pattern.test(phrase)) || WINDOW_PATTERN.test(phrase)) return null;
  return {
    label: phrase.endsWith('s') ? phrase : `${phrase}s`,
    where: { nameContains: phrase },
  };
}

function detectObjectNameTarget(text) {
  if (TREE_PATTERN.test(text)) {
    return {
      label: 'trees',
      where: {
        or: [
          { nameContains: 'tree' },
          { nameContains: 'plant' },
          { nameContains: 'vegetation' },
        ],
      },
    };
  }
  return detectGenericObjectNameTarget(text);
}

function detectView(text) {
  const colorBy = text.match(COLOR_BY_PATTERN);
  if (colorBy) {
    const raw = colorBy[1].trim().toLowerCase();
    const known = {
      class: 'ifcClass',
      'ifc class': 'ifcClass',
      storey: 'storey',
      story: 'storey',
      floor: 'storey',
      type: 'type',
      name: 'name',
    };
    return { mode: 'colorBy', colorByProperty: known[raw] ?? colorBy[1].trim(), focus: true };
  }
  if (ISOLATE_PATTERN.test(text)) return { mode: 'isolate', focus: true };
  if (GHOST_PATTERN.test(text)) return { mode: 'ghostOthers', focus: true };
  if (HIGHLIGHT_PATTERN.test(text)) return { mode: 'highlight', focus: true };
  return { mode: 'ghostOthers', focus: true };
}

function detectGroupBy(text) {
  const match = text.match(GROUP_BY_PATTERN);
  if (!match) return null;
  const raw = match[1].trim().toLowerCase();
  const known = {
    class: 'ifcClass',
    'ifc class': 'ifcClass',
    storey: 'storey',
    story: 'storey',
    floor: 'storey',
    type: 'typeName',
    name: 'name',
  };
  return known[raw] ?? null;
}

function buildClassWhere(target) {
  if (!target) return null;
  if (target.semanticType) {
    return {
      or: [
        { ifcClass: target.ifcClass },
        { semanticType: target.semanticType },
      ],
    };
  }
  return { ifcClass: target.ifcClass };
}

function combineWhere(parts) {
  const active = parts.filter(Boolean);
  if (active.length === 0) return {};
  if (active.length === 1) return active[0];
  return { and: active };
}

function detectAggregate(text) {
  if (!SUM_PATTERN.test(text)) return null;
  if (AREA_PATTERN.test(text)) return { op: 'sum', field: 'quantity', name: 'area', label: 'total area' };
  if (VOLUME_PATTERN.test(text)) return { op: 'sum', field: 'quantity', name: 'volume', label: 'total volume' };
  if (LENGTH_PATTERN.test(text)) return { op: 'sum', field: 'quantity', name: 'length', label: 'total length' };
  return null;
}

export function draftBqlFromNaturalLanguage(input, { storeyOverride = null } = {}) {
  const text = normalizeInput(input);
  if (!text) {
    return {
      ok: false,
      query: null,
      intentSummary: '',
      warnings: ['Enter a BIM question first.'],
    };
  }

  const target = detectIfcClass(text);
  const storey = storeyOverride ?? detectStorey(text);
  const nameContains = detectNameContains(text);
  const objectNameTarget = detectObjectNameTarget(text);
  const propertyPredicates = FIRE_RATED_PATTERN.test(text)
    ? [{ path: 'FireRating', op: 'exists' }]
    : [];
  const view = detectView(text);
  const aggregate = detectAggregate(text);
  const groupBy = detectGroupBy(text);

  if (!target && !storey && !nameContains && !objectNameTarget && propertyPredicates.length === 0 && !aggregate && !groupBy && view.mode !== 'colorBy') {
    return {
      ok: false,
      query: null,
      intentSummary: '',
      warnings: ['Could not map that request to BIM evidence yet. Try naming an IFC class, storey, or property.'],
    };
  }

  const where = combineWhere([
    buildClassWhere(target),
    storey ? { storey } : null,
    nameContains ? { nameContains } : null,
    objectNameTarget?.where ?? null,
    propertyPredicates.length > 0 ? { properties: propertyPredicates } : null,
  ]);
  const wantsCount = COUNT_PATTERN.test(text);
  const select = aggregate ? 'aggregate' : (groupBy && wantsCount ? 'groupedCount' : (wantsCount ? 'count' : 'elements'));
  const from = target?.semanticType ? 'allBimObjects' : 'physicalElements';
  const query = {
    version: '0.1',
    select,
    from,
    where,
    view,
  };
  if (aggregate) {
    query.aggregate = {
      op: aggregate.op,
      field: aggregate.field,
      name: aggregate.name,
    };
  }
  if (groupBy && select === 'groupedCount') {
    query.groupBy = groupBy;
  }

  const labels = [
    aggregate?.label ?? (select === 'count' || select === 'groupedCount' ? 'count' : 'show'),
    target?.label ?? objectNameTarget?.label,
    storey ? `on ${storey}` : null,
    groupBy ? `by ${groupBy === 'ifcClass' ? 'class' : groupBy === 'typeName' ? 'type' : groupBy}` : null,
    propertyPredicates.length > 0 ? 'with fire rating evidence' : null,
    nameContains ? `named ${nameContains}` : null,
    view.mode === 'colorBy' ? `colored by ${view.colorByProperty}` : null,
  ].filter(Boolean);

  return {
    ok: true,
    query,
    intentSummary: `Agent drafted BQL to ${labels.join(' ')}.`,
    warnings: [],
  };
}
