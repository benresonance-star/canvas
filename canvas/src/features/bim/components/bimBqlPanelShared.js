export const BQL_PRESET_QUERIES = {
  allBeams: {
    label: 'All beams',
    query: {
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      where: { ifcClass: 'IfcBeam' },
      view: { mode: 'ghostOthers', focus: true },
    },
  },
  groundFloor: {
    label: 'Ground floor',
    query: {
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      where: { storey: 'GROUND FLOOR' },
      view: { mode: 'isolate', focus: true },
    },
  },
  windows: {
    label: 'Windows',
    query: {
      version: '0.1',
      select: 'elements',
      from: 'allBimObjects',
      where: {
        or: [
          { ifcClass: 'IfcWindow' },
          { semanticType: 'WindowAssembly' },
        ],
      },
      view: { mode: 'highlight', focus: true },
    },
  },
  colorByStorey: {
    label: 'Color by storey',
    query: {
      version: '0.1',
      select: 'elements',
      from: 'physicalElements',
      view: { mode: 'colorBy', colorByProperty: 'storey', focus: true },
    },
  },
};
