import { resolveElementLayer } from './bimElementLayers.js';

export const BIM_5D_PLAN_LIMIT = 12;
export const BIM_5D_RATE_ROW_LIMIT = 200;
export const BIM_5D_GROUP_BY_VALUES = ['ifcClass', 'typeName', 'storey', 'layer', 'semanticType', 'classification', 'resultSet'];
export const BIM_5D_QUANTITY_SOURCES = ['ifc', 'derived', 'manual'];
export const BIM_5D_CONFIDENCE_VALUES = ['measured', 'estimated', 'manual'];

function uniqueStrings(values, limit = 10000) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].slice(0, limit);
}

function safeIsoDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeMatch(match) {
  if (!match || typeof match !== 'object' || Array.isArray(match)) return {};
  return {
    ifcClass: match.ifcClass == null ? null : String(match.ifcClass),
    typeName: match.typeName == null ? null : String(match.typeName),
    storey: match.storey == null ? null : String(match.storey),
    layer: match.layer == null ? null : String(match.layer),
    semanticType: match.semanticType == null ? null : String(match.semanticType),
    classificationCode: match.classificationCode == null ? null : String(match.classificationCode),
    resultSetId: match.resultSetId == null ? null : String(match.resultSetId),
  };
}

function normalizeRateRow(entry, index = 0) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const unitCost = Number(entry.unitCost);
  return {
    id: String(entry.id ?? `rate-${index}`),
    label: String(entry.label ?? `Rate ${index + 1}`).slice(0, 80),
    match: normalizeMatch(entry.match),
    quantityName: String(entry.quantityName ?? 'Area').trim() || 'Area',
    unit: String(entry.unit ?? '').trim(),
    unitCost: Number.isFinite(unitCost) ? unitCost : 0,
    costCategory: entry.costCategory == null ? null : String(entry.costCategory).slice(0, 80),
    costType: entry.costType == null ? null : String(entry.costType).slice(0, 80),
    classificationCode: entry.classificationCode == null ? null : String(entry.classificationCode).slice(0, 80),
    classificationSystem: entry.classificationSystem == null ? null : String(entry.classificationSystem).slice(0, 80),
    formula: entry.formula == null ? null : String(entry.formula).slice(0, 200),
    notes: String(entry.notes ?? '').slice(0, 1000),
  };
}

export function normalizeBim5dCostPlans(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const createdAt = safeIsoDate(entry.createdAt, new Date(0).toISOString());
      return {
        id: String(entry.id ?? `cost-plan-${index}`),
        name: String(entry.name ?? `Cost plan ${index + 1}`).slice(0, 80),
        currency: String(entry.currency ?? 'USD').slice(0, 8).toUpperCase(),
        createdAt,
        updatedAt: safeIsoDate(entry.updatedAt, createdAt),
        groupBy: BIM_5D_GROUP_BY_VALUES.includes(entry.groupBy) ? entry.groupBy : 'ifcClass',
        rateRows: Array.isArray(entry.rateRows)
          ? entry.rateRows.map(normalizeRateRow).filter(Boolean).slice(0, BIM_5D_RATE_ROW_LIMIT)
          : [],
        notes: String(entry.notes ?? '').slice(0, 1000),
      };
    })
    .filter(Boolean)
    .slice(0, BIM_5D_PLAN_LIMIT);
}

function buildPropertiesByElement(preparedModel) {
  const map = new Map();
  for (const property of preparedModel?.properties ?? []) {
    if (!map.has(property.elementId)) map.set(property.elementId, []);
    map.get(property.elementId).push(property);
  }
  return map;
}

function buildAssemblyKindByElement(preparedModel) {
  const assemblyById = new Map((preparedModel?.semanticAssemblies ?? []).map((assembly) => [assembly.id, assembly]));
  const map = new Map();
  for (const member of preparedModel?.assemblyMembers ?? []) {
    const assembly = assemblyById.get(member.assemblyId);
    if (assembly?.kind) map.set(member.elementId, assembly.kind);
  }
  return map;
}

function findQuantity(properties = [], quantityName = '') {
  const target = String(quantityName ?? '').toLowerCase();
  return properties.find((property) => (
    property.source === 'ifc-quantity'
    && (
      String(property.propertyName ?? '').toLowerCase() === target
      || (target === 'area' && String(property.propertyName ?? '').toLowerCase().includes('area'))
      || (target === 'volume' && String(property.propertyName ?? '').toLowerCase().includes('volume'))
      || (target === 'length' && String(property.propertyName ?? '').toLowerCase().includes('length'))
    )
    && Number.isFinite(Number(property.value))
  )) ?? null;
}

function elementLayer(element, properties) {
  return resolveElementLayer(properties) || 'Unassigned';
}

function groupKeyForElement(element, properties, groupBy, resultSets = [], assemblyKindsByElement = new Map()) {
  if (groupBy === 'ifcClass') return element.ifcClass ?? 'Unknown class';
  if (groupBy === 'typeName') return element.typeName ?? 'No type';
  if (groupBy === 'storey') return element.storeyId ?? 'No storey';
  if (groupBy === 'layer') return elementLayer(element, properties);
  if (groupBy === 'classification') {
    const classification = properties.find((property) => /classification|uniclass|masterformat|omniclass|cost code/i.test(`${property.psetName}.${property.propertyName}`));
    return classification?.value ? String(classification.value) : 'No classification';
  }
  if (groupBy === 'resultSet') {
    const resultSet = resultSets.find((entry) => entry.elementIds?.includes(element.id));
    return resultSet?.name ?? 'No result set';
  }
  if (groupBy === 'semanticType') return assemblyKindsByElement.get(element.id) ?? element.ifcClass ?? 'Physical element';
  return 'Unknown';
}

function matchText(actual, expected) {
  if (!expected) return true;
  return String(actual ?? '').toLowerCase() === String(expected).toLowerCase();
}

function rateMatchesElement(rate, element, properties, resultSets = [], assemblyKindsByElement = new Map()) {
  const match = rate.match ?? {};
  if (!matchText(element.ifcClass, match.ifcClass)) return false;
  if (!matchText(element.typeName, match.typeName)) return false;
  if (!matchText(element.storeyId, match.storey)) return false;
  if (!matchText(elementLayer(element, properties), match.layer)) return false;
  if (!matchText(assemblyKindsByElement.get(element.id), match.semanticType)) return false;
  if (match.resultSetId) {
    const resultSet = resultSets.find((entry) => entry.id === match.resultSetId);
    if (!resultSet?.elementIds?.includes(element.id)) return false;
  }
  return true;
}

function firstMatchingRate(rates, element, properties, resultSets, assemblyKindsByElement) {
  return rates.find((rate) => rateMatchesElement(rate, element, properties, resultSets, assemblyKindsByElement)) ?? null;
}

export function buildBim5dTakeoffRows(preparedModel, plan, resultSets = []) {
  const normalizedPlan = normalizeBim5dCostPlans([plan])[0] ?? normalizeBim5dCostPlans([{}])[0];
  const propertiesByElement = buildPropertiesByElement(preparedModel);
  const assemblyKindsByElement = buildAssemblyKindByElement(preparedModel);
  const groups = new Map();
  for (const element of preparedModel?.elements ?? []) {
    const properties = propertiesByElement.get(element.id) ?? [];
    const rate = firstMatchingRate(normalizedPlan.rateRows, element, properties, resultSets, assemblyKindsByElement);
    const quantityName = rate?.quantityName ?? 'Area';
    const quantity = findQuantity(properties, quantityName);
    const groupKey = groupKeyForElement(element, properties, normalizedPlan.groupBy, resultSets, assemblyKindsByElement);
    const rowId = `${normalizedPlan.groupBy}:${groupKey}:${quantityName}:${quantity?.unit ?? rate?.unit ?? ''}`;
    const row = groups.get(rowId) ?? {
      id: rowId,
      label: groupKey,
      elementIds: [],
      assemblyIds: [],
      quantityName,
      quantityValue: 0,
      unit: quantity?.unit ?? rate?.unit ?? '',
      quantitySource: 'ifc',
      confidence: 'measured',
      unitCost: rate?.unitCost,
      totalCost: 0,
      currency: normalizedPlan.currency,
      missingQuantityCount: 0,
      missingRateCount: 0,
    };
    row.elementIds.push(element.id);
    if (quantity) row.quantityValue += Number(quantity.value);
    else row.missingQuantityCount += 1;
    if (rate) {
      row.unitCost = rate.unitCost;
      row.totalCost = row.quantityValue * rate.unitCost;
    } else {
      row.missingRateCount += 1;
    }
    groups.set(rowId, row);
  }
  return [...groups.values()].sort((left, right) => String(left.label).localeCompare(String(right.label)));
}

export function summarizeBim5dTakeoff(rows = []) {
  const totalCost = rows.reduce((sum, row) => sum + (Number(row.totalCost) || 0), 0);
  return {
    rowCount: rows.length,
    elementCount: uniqueStrings(rows.flatMap((row) => row.elementIds ?? [])).length,
    totalCost,
    missingQuantityCount: rows.reduce((sum, row) => sum + (row.missingQuantityCount ?? 0), 0),
    missingRateCount: rows.reduce((sum, row) => sum + (row.missingRateCount ?? 0), 0),
  };
}

export function createBim5dCostPlan({ name = 'Cost plan', currency = 'USD', now = new Date().toISOString() } = {}) {
  return normalizeBim5dCostPlans([{
    id: `bim-5d-plan:${now}:${Math.random().toString(36).slice(2, 8)}`,
    name,
    currency,
    createdAt: now,
    updatedAt: now,
    groupBy: 'ifcClass',
    rateRows: [],
    notes: '',
  }])[0];
}
