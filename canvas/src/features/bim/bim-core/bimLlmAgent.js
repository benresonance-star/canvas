export const BIM_LLM_AGENT_SYSTEM_CONTEXT = [
  'You are a BIM query planner embedded in Canvas.',
  'Return only JSON. Do not include markdown.',
  'Your job is to translate the user request into BQL. The local executor decides final membership.',
  'Use only fields and enum values shown in the provided responseShape.',
  'Do not invent top-level fields. Do not return explanatory prose.',
  'Never request filesystem, network, or write actions.',
].join('\n');

const BQL_SCHEMA_SUMMARY = {
  version: '0.1',
  select: ['elements', 'assemblies', 'count', 'properties', 'aggregate', 'groupedCount'],
  from: ['physicalElements', 'semanticAssemblies', 'allBimObjects'],
  groupBy: ['ifcClass', 'storey', 'typeName', 'name'],
  where: {
    ifcClass: 'string|string[]',
    semanticType: 'string|string[]',
    storey: 'string|string[]',
    nameContains: 'string',
    semanticAliases: [{ term: 'string', aliases: ['evidence-backed alias strings'], fields: ['name|typeName|id|ifcGlobalId|ifcClass|propertyValue'] }],
    properties: [{ path: 'string', op: '=|!=|>|>=|<|<=|contains|exists', value: 'optional' }],
    quantities: [{ name: 'string', op: '=|!=|>|>=|<|<=|exists', value: 'optional number', unit: 'optional' }],
    and: ['BqlWhere'],
    or: ['BqlWhere'],
    not: 'BqlWhere',
  },
  view: {
    mode: ['highlight', 'isolate', 'ghostOthers', 'colorBy'],
    colorByProperty: 'optional string',
    focus: 'boolean',
  },
  aggregate: {
    op: ['sum'],
    field: ['quantity', 'property'],
    name: 'required string such as area, volume, length',
  },
};

function countBy(items, keyFn) {
  const counts = new Map();
  items.forEach((item) => {
    const key = keyFn(item) || 'Unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([value, count]) => ({ value, count }));
}

export function summarizeBimModelForAgent(preparedModel, selectedElement = null) {
  const elements = preparedModel?.elements ?? [];
  const properties = preparedModel?.properties ?? [];
  const elementSamples = elements
    .slice(0, 80)
    .map((element) => ({
      name: element.name ?? null,
      ifcClass: element.ifcClass ?? null,
      storeyId: element.storeyId ?? null,
      typeName: element.typeName ?? null,
    }));
  return {
    metadata: {
      filename: preparedModel?.metadata?.filename ?? null,
      ifcSchema: preparedModel?.metadata?.ifcSchema ?? null,
      elementCount: elements.length,
      propertyCount: properties.length,
    },
    classes: countBy(elements, (element) => element.ifcClass),
    storeys: countBy(elements, (element) => element.storeyId),
    typeNames: countBy(elements, (element) => element.typeName).slice(0, 12),
    names: countBy(elements, (element) => element.name).slice(0, 24),
    elementSamples,
    propertyPaths: [...new Set(properties.map((property) => `${property.psetName}.${property.propertyName}`))]
      .filter(Boolean)
      .sort()
      .slice(0, 80),
    selectedElement: selectedElement
      ? {
        id: selectedElement.id,
        name: selectedElement.name,
        ifcClass: selectedElement.ifcClass,
        ifcGlobalId: selectedElement.ifcGlobalId,
        storeyId: selectedElement.storeyId,
        typeName: selectedElement.typeName,
      }
      : null,
  };
}

export function compactBimModelSummaryForAgent(modelSummary) {
  return {
    metadata: modelSummary?.metadata ?? null,
    classes: (modelSummary?.classes ?? []).slice(0, 20),
    storeys: (modelSummary?.storeys ?? []).slice(0, 20),
    typeNames: (modelSummary?.typeNames ?? []).slice(0, 12),
    names: (modelSummary?.names ?? []).slice(0, 16),
    nameTypeVocabulary: (modelSummary?.nameTypeVocabulary ?? []).slice(0, 40),
    selectedElement: modelSummary?.selectedElement ?? null,
  };
}

const PROMPT_GUIDANCE = [
  'Infer user intent from the request and modelSummary before drafting BQL.',
  'Use modelSummary.storeys to map phrases like roof level, upper floor, ground floor, level 1, or story to a storey filter.',
  'Use modelSummary.classes for physical IFC class filters. For example, slabs are IfcSlab.',
  'If the user names a visible object category that is not a canonical IFC class, use nameContains/type evidence rather than inventing an ifcClass.',
  'When modelSummary.nameTypeVocabulary or modelSummary.names contains close naming variants, return semanticAliases with aliases copied from that vocabulary.',
  'Use semanticAliases for typos, plurals, compact names, or authoring variants such as top rails -> TOPRAIL.',
  'Use count for how many/number of questions, elements for show/find/isolate questions, and aggregate only for totals such as area, volume, or length.',
  'Use groupedCount with groupBy for questions that ask counts by/per storey, class, type, or name.',
];

export function buildBimLlmAgentUserPrompt({ utterance, modelSummary }) {
  return JSON.stringify({
    task: 'Draft a BQL query for this BIM request.',
    guidance: PROMPT_GUIDANCE,
    responseShape: {
      intentSummary: 'short sentence',
      ambiguityWarning: 'optional short sentence or null',
      query: BQL_SCHEMA_SUMMARY,
    },
    userRequest: utterance,
    modelSummary,
    examples: [
      {
        request: 'how many slabs are on roof level',
        response: {
          intentSummary: 'Count slabs on the roof level.',
          ambiguityWarning: null,
          query: {
            version: '0.1',
            select: 'count',
            from: 'physicalElements',
            where: { and: [{ ifcClass: 'IfcSlab' }, { storey: 'roof' }] },
            view: { mode: 'ghostOthers', focus: true },
          },
        },
      },
      {
        request: 'count slabs by storey',
        response: {
          intentSummary: 'Count slabs grouped by storey.',
          ambiguityWarning: null,
          query: {
            version: '0.1',
            select: 'groupedCount',
            from: 'physicalElements',
            groupBy: 'storey',
            where: { ifcClass: 'IfcSlab' },
            view: { mode: 'ghostOthers', focus: true },
          },
        },
      },
      {
        request: 'how many top rails are there',
        response: {
          intentSummary: 'Count top rail objects using semantic name aliases.',
          ambiguityWarning: null,
          query: {
            version: '0.1',
            select: 'count',
            from: 'physicalElements',
            where: {
              semanticAliases: [{
                term: 'top rails',
                aliases: ['top rail', 'toprail', 'TOPRAIL'],
                fields: ['name', 'typeName', 'id', 'propertyValue'],
              }],
            },
            view: { mode: 'ghostOthers', focus: true },
          },
        },
      },
      {
        request: 'show beams on ground floor',
        response: {
          intentSummary: 'Show beams on the ground floor.',
          ambiguityWarning: null,
          query: {
            version: '0.1',
            select: 'elements',
            from: 'physicalElements',
            where: { and: [{ ifcClass: 'IfcBeam' }, { storey: 'ground floor' }] },
            view: { mode: 'ghostOthers', focus: true },
          },
        },
      },
      {
        request: 'color by storey',
        response: {
          intentSummary: 'Color physical elements by storey.',
          ambiguityWarning: null,
          query: {
            version: '0.1',
            select: 'elements',
            from: 'physicalElements',
            where: {},
            view: { mode: 'colorBy', colorByProperty: 'storey', focus: true },
          },
        },
      },
    ],
  }, null, 2);
}

export function buildBimLlmAgentRepairPrompt({
  utterance,
  modelSummary,
  invalidQuery,
  validationErrors,
}) {
  return JSON.stringify({
    task: 'Repair this invalid BQL query for the BIM request.',
    guidance: [
      ...PROMPT_GUIDANCE,
      'Return only corrected JSON in the same responseShape.',
      'Fix every validation error. Do not preserve invalid fields or enum values.',
    ],
    responseShape: {
      intentSummary: 'short sentence',
      ambiguityWarning: 'optional short sentence or null',
      query: BQL_SCHEMA_SUMMARY,
    },
    userRequest: utterance,
    modelSummary,
    invalidQuery,
    validationErrors,
  }, null, 2);
}


function extractJsonObject(text) {
  const raw = String(text ?? '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? raw;
  if (candidate.startsWith('{')) return candidate;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first >= 0 && last > first) return candidate.slice(first, last + 1);
  return candidate;
}

export function parseBimLlmAgentReply(reply) {
  const parsed = JSON.parse(extractJsonObject(reply));
  const query = parsed.query ?? parsed;
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error('BIM agent did not return a BQL query object.');
  }
  return {
    query,
    intentSummary: parsed.intentSummary ?? 'Agent drafted a BQL query.',
    ambiguityWarning: parsed.ambiguityWarning ?? null,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  };
}
