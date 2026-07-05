import { componentTypeToAssemblyKind, emptyPreparedBimModel } from './types.js';
import webIfcWasmUrl from 'web-ifc/web-ifc.wasm?url';

const COMMON_IFC_CLASS_CONSTANTS = [
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCDOOR',
  'IFCWINDOW',
  'IFCSLAB',
  'IFCBEAM',
  'IFCCOLUMN',
  'IFCPLATE',
  'IFCMEMBER',
  'IFCSTAIR',
  'IFCSPACE',
  'IFCBUILDINGSTOREY',
  'IFCCURTAINWALL',
  'IFCROOF',
  'IFCFURNISHINGELEMENT',
  'IFCFLOWTERMINAL',
  'IFCDISTRIBUTIONELEMENT',
  'IFCBUILDINGELEMENTPROXY',
];

function yieldToBrowser() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function scalar(value) {
  if (value == null) return null;
  if (typeof value === 'object' && 'value' in value) return value.value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

function ifcClassFromConstant(constantName) {
  const raw = String(constantName ?? '').replace(/^IFC/, '');
  if (!raw) return 'IfcElement';
  return `Ifc${raw.charAt(0)}${raw.slice(1).toLowerCase()}`;
}

function lineLabel(line) {
  return scalar(line?.Name) ?? scalar(line?.ObjectType) ?? scalar(line?.LongName) ?? scalar(line?.GlobalId) ?? null;
}

function refExpressId(ref) {
  const value = scalar(ref) ?? ref?.expressID ?? ref?.ExpressID ?? ref;
  return Number.isFinite(value) ? value : null;
}

function refList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.size === 'function' && typeof value.get === 'function') {
    const result = [];
    for (let i = 0; i < value.size(); i += 1) result.push(value.get(i));
    return result;
  }
  return [value];
}

function linePropertyEntries(line, elementId, sourceFileHash) {
  const names = ['Name', 'Description', 'ObjectType', 'Tag', 'PredefinedType', 'Elevation', 'LongName'];
  return names
    .map((name) => {
      const value = scalar(line?.[name]);
      if (value == null || value === '') return null;
      return {
        id: `${elementId}:${name}`,
        elementId,
        psetName: 'IFC Attributes',
        propertyName: name,
        value,
        unit: null,
        source: 'ifc-attribute',
        sourceFileHash,
      };
    })
    .filter(Boolean);
}

function getLineSafe(ifcApi, modelId, expressId) {
  if (!Number.isFinite(expressId)) return null;
  try {
    return ifcApi.GetLine(modelId, expressId, true);
  } catch {
    return null;
  }
}

function quantityValue(line) {
  const fields = [
    ['LengthValue', 'length'],
    ['AreaValue', 'area'],
    ['VolumeValue', 'volume'],
    ['CountValue', 'count'],
    ['WeightValue', 'weight'],
    ['TimeValue', 'time'],
    ['NominalValue', 'value'],
  ];
  for (const [field, kind] of fields) {
    const value = scalar(line?.[field]);
    if (value != null && value !== '') return { value, kind };
  }
  return null;
}

function psetPropertyEntries({ ifcApi, modelId, definitionId, elementId, sourceFileHash }) {
  const definition = getLineSafe(ifcApi, modelId, definitionId);
  const definitionName = lineLabel(definition) ?? 'IFC Properties';
  const hasProperties = refList(definition?.HasProperties);
  const quantities = refList(definition?.Quantities);
  const propertyEntries = hasProperties.map((propertyRef) => {
    const property = getLineSafe(ifcApi, modelId, refExpressId(propertyRef));
    const propertyName = scalar(property?.Name);
    const value = scalar(property?.NominalValue);
    if (!propertyName || value == null || value === '') return null;
    return {
      id: `${elementId}:${definitionId}:${refExpressId(propertyRef)}`,
      elementId,
      psetName: definitionName,
      propertyName,
      value,
      unit: scalar(property?.Unit) ?? null,
      source: 'ifc-property',
      sourceFileHash,
    };
  }).filter(Boolean);
  const quantityEntries = quantities.map((quantityRef) => {
    const quantity = getLineSafe(ifcApi, modelId, refExpressId(quantityRef));
    const propertyName = scalar(quantity?.Name);
    const quantityData = quantityValue(quantity);
    if (!propertyName || !quantityData) return null;
    return {
      id: `${elementId}:${definitionId}:${refExpressId(quantityRef)}`,
      elementId,
      psetName: definitionName,
      propertyName,
      value: quantityData.value,
      unit: scalar(quantity?.Unit) ?? null,
      source: 'ifc-quantity',
      quantityKind: quantityData.kind,
      sourceFileHash,
    };
  }).filter(Boolean);
  return [...propertyEntries, ...quantityEntries];
}

function archicadSemanticProperties(properties) {
  const result = {};
  properties.forEach((property) => {
    const path = `${property.psetName}.${property.propertyName}`;
    if (path === 'Canvas.ComponentType') result.componentType = property.value;
    if (path === 'Canvas.AssemblyId') result.assemblyId = property.value;
    if (path === 'Canvas.MemberRole') result.memberRole = property.value;
    if (path === 'Canvas.ComponentName') result.componentName = property.value;
  });
  return result;
}

export function buildSemanticAssemblies(elements, properties) {
  const propertiesByElement = new Map();
  properties.forEach((property) => {
    if (!propertiesByElement.has(property.elementId)) propertiesByElement.set(property.elementId, []);
    propertiesByElement.get(property.elementId).push(property);
  });
  const groups = new Map();
  const warnings = [];
  elements.forEach((element) => {
    const semantic = archicadSemanticProperties(propertiesByElement.get(element.id) ?? []);
    if (semantic.componentType && !semantic.assemblyId) {
      warnings.push(`Semantic metadata ignored for ${element.name || element.ifcGlobalId}: Canvas.ComponentType requires Canvas.AssemblyId.`);
      return;
    }
    if (semantic.assemblyId && !semantic.componentType) {
      warnings.push(`Semantic metadata ignored for ${element.name || element.ifcGlobalId}: Canvas.AssemblyId requires Canvas.ComponentType.`);
      return;
    }
    if (!semantic.componentType || !semantic.assemblyId) return;
    const key = `${semantic.componentType}:${semantic.assemblyId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: semantic.assemblyId,
        modelId: element.modelId,
        kind: componentTypeToAssemblyKind(semantic.componentType),
        sourceSystem: 'Archicad',
        sourceRule: 'Canvas.ComponentType+Canvas.AssemblyId',
        label: semantic.componentName ?? semantic.assemblyId,
        confidence: 'explicit',
        properties: {
          componentType: semantic.componentType,
        },
        members: [],
      });
    }
    groups.get(key).members.push({
      assemblyId: semantic.assemblyId,
      elementId: element.id,
      memberRole: semantic.memberRole ?? null,
      ifcGlobalId: element.ifcGlobalId,
      ifcClass: element.ifcClass,
    });
  });
  return {
    semanticAssemblies: [...groups.values()].map(({ members, ...assembly }) => assembly),
    assemblyMembers: [...groups.values()].flatMap((group) => group.members),
    warnings,
  };
}

function getLinesWithType(ifcApi, modelId, typeCode) {
  if (!Number.isFinite(typeCode)) return [];
  let ids = null;
  try {
    ids = ifcApi.GetLineIDsWithType(modelId, typeCode);
  } catch {
    return [];
  }
  const result = [];
  const size = ids?.size?.() ?? 0;
  for (let i = 0; i < size; i += 1) {
    const expressId = ids.get(i);
    const line = getLineSafe(ifcApi, modelId, expressId);
    if (line) result.push({ expressId, line });
  }
  return result;
}

export function applyIfcRelationshipEvidence({
  WebIFC,
  ifcApi,
  modelId,
  elements,
  properties,
  relationships,
  provenance,
  metadata,
}) {
  const byExpressId = new Map(elements.map((element) => [element.expressId, element]));

  getLinesWithType(ifcApi, modelId, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE).forEach(({ expressId, line }) => {
    const storeyId = refExpressId(line?.RelatingStructure);
    const storey = getLineSafe(ifcApi, modelId, storeyId);
    const storeyLabel = lineLabel(storey);
    refList(line?.RelatedElements).forEach((ref) => {
      const element = byExpressId.get(refExpressId(ref));
      if (!element) return;
      if (storeyLabel) element.storeyId = storeyLabel;
      relationships.push({
        id: `rel:${expressId}:${element.id}:contained-in`,
        modelId: metadata.fingerprint,
        fromElementId: element.id,
        toElementId: storeyLabel ?? `ifc:${storeyId}`,
        relationshipType: 'containedInSpatialStructure',
        sourceExpressId: expressId,
      });
    });
  });

  getLinesWithType(ifcApi, modelId, WebIFC.IFCRELDEFINESBYTYPE).forEach(({ expressId, line }) => {
    const typeId = refExpressId(line?.RelatingType);
    const typeLine = getLineSafe(ifcApi, modelId, typeId);
    const typeName = lineLabel(typeLine);
    refList(line?.RelatedObjects).forEach((ref) => {
      const element = byExpressId.get(refExpressId(ref));
      if (!element) return;
      if (typeName) element.typeName = typeName;
      relationships.push({
        id: `rel:${expressId}:${element.id}:defined-by-type`,
        modelId: metadata.fingerprint,
        fromElementId: element.id,
        toElementId: typeName ?? `ifc:${typeId}`,
        relationshipType: 'definedByType',
        sourceExpressId: expressId,
      });
    });
  });

  getLinesWithType(ifcApi, modelId, WebIFC.IFCRELDEFINESBYPROPERTIES).forEach(({ expressId, line }) => {
    const definitionId = refExpressId(line?.RelatingPropertyDefinition);
    refList(line?.RelatedObjects).forEach((ref) => {
      const element = byExpressId.get(refExpressId(ref));
      if (!element) return;
      properties.push(...psetPropertyEntries({
        ifcApi,
        modelId,
        definitionId,
        elementId: element.id,
        sourceFileHash: metadata.sourceFileHash,
      }));
      relationships.push({
        id: `rel:${expressId}:${element.id}:defined-by-properties`,
        modelId: metadata.fingerprint,
        fromElementId: element.id,
        toElementId: `ifc:${definitionId}`,
        relationshipType: 'definedByProperties',
        sourceExpressId: expressId,
      });
      provenance.push({
        id: `prov:${element.id}:properties:${expressId}`,
        recordType: 'properties',
        recordId: element.id,
        ifcGlobalId: element.ifcGlobalId,
        ifcClass: element.ifcClass,
        sourceFileHash: metadata.sourceFileHash,
        extractionRule: 'web-ifc-rel-defines-by-properties',
        createdAt: metadata.createdAt,
      });
    });
  });
}

export async function projectIfcEvidence({ arrayBuffer, metadata, onProgress = () => {} }) {
  const prepared = emptyPreparedBimModel(metadata);
  try {
    const WebIFC = await import('web-ifc');
    const ifcApi = new WebIFC.IfcAPI();
    onProgress({ kind: 'ifc', message: 'Loading web-ifc WASM runtime' });
    await ifcApi.Init((path) => (
      String(path).endsWith('.wasm') ? webIfcWasmUrl : path
    ), true);
    onProgress({ kind: 'ifc', message: 'Opening IFC model bytes' });
    const modelId = ifcApi.OpenModel(new Uint8Array(arrayBuffer));
    const elements = [];
    const properties = [];
    const provenance = [];
    for (const constantName of COMMON_IFC_CLASS_CONSTANTS) {
      const typeCode = WebIFC[constantName];
      if (!Number.isFinite(typeCode)) continue;
      let ids = null;
      try {
        ids = ifcApi.GetLineIDsWithType(modelId, typeCode);
      } catch {
        ids = null;
      }
      const size = ids?.size?.() ?? 0;
      if (size > 0) {
        onProgress({
          kind: 'elements',
          message: `Extracting ${ifcClassFromConstant(constantName)} elements`,
          current: elements.length,
          total: null,
        });
      }
      for (let i = 0; i < size; i += 1) {
        const expressId = ids.get(i);
        let line = null;
        try {
          line = ifcApi.GetLine(modelId, expressId, true);
        } catch {
          line = null;
        }
        const ifcGlobalId = scalar(line?.GlobalId) ?? String(expressId);
        const elementId = `ifc:${ifcGlobalId}`;
        const ifcClass = ifcClassFromConstant(constantName);
        const element = {
          id: elementId,
          modelId: metadata.fingerprint,
          expressId,
          ifcGlobalId,
          ifcClass,
          name: scalar(line?.Name) ?? ifcClass,
          typeName: scalar(line?.ObjectType) ?? scalar(line?.PredefinedType) ?? null,
          storeyId: null,
          fragmentsObjectId: ifcGlobalId,
          nativeAuthoringId: scalar(line?.Tag) ?? null,
        };
        elements.push(element);
        properties.push(...linePropertyEntries(line, elementId, metadata.sourceFileHash));
        provenance.push({
          id: `prov:${elementId}`,
          recordType: 'element',
          recordId: elementId,
          ifcGlobalId,
          ifcClass,
          sourceFileHash: metadata.sourceFileHash,
          extractionRule: 'web-ifc-line',
          createdAt: metadata.createdAt,
        });
        if ((i + 1) % 75 === 0) {
          onProgress({
            kind: 'elements',
            message: `Extracted ${elements.length} elements so far`,
            current: elements.length,
            total: null,
          });
          await yieldToBrowser();
        }
      }
      if (size > 0) await yieldToBrowser();
    }
    const relationships = [];
    onProgress({
      kind: 'relationships',
      message: 'Resolving storey, type, property, and quantity relationships',
      current: elements.length,
      total: null,
    });
    await yieldToBrowser();
    applyIfcRelationshipEvidence({
      WebIFC,
      ifcApi,
      modelId,
      elements,
      properties,
      relationships,
      provenance,
      metadata,
    });
    onProgress({
      kind: 'properties',
      message: `Projected ${properties.length} properties and ${relationships.length} relationships`,
      current: properties.length,
      total: null,
    });
    await yieldToBrowser();
    ifcApi.CloseModel(modelId);
    onProgress({ kind: 'semantic', message: 'Building explicit semantic assemblies from Canvas metadata' });
    const semantic = buildSemanticAssemblies(elements, properties);
    onProgress({
      kind: 'summary',
      message: `Extracted ${elements.length} elements, ${properties.length} properties, ${relationships.length} relationships`,
    });
    return {
      ...prepared,
      elements,
      properties,
      relationships,
      provenance,
      semanticAssemblies: semantic.semanticAssemblies,
      assemblyMembers: semantic.assemblyMembers,
      warnings: [
        ...(elements.length ? [] : ['No common IFC building elements were extracted from this file yet.']),
        ...semantic.warnings,
      ],
    };
  } catch (error) {
    return {
      ...prepared,
      warnings: [`IFC evidence extraction fell back: ${error?.message || 'web-ifc unavailable'}`],
    };
  }
}
