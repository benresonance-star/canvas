export const LAYER_ORDER = [
  'client-ui',
  'client-hooks',
  'client-sync',
  'client-storage',
  'api',
  'postgres',
  'external',
];

export const LAYER_Y = {
  'client-ui': 0,
  'client-hooks': 250,
  'client-sync': 520,
  'client-storage': 820,
  'api': 1080,
  postgres: 1340,
  external: 1600,
};

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 72;
export const NODE_GAP_X = 56;
export const LAYER_GROUP_PADDING = 20;
export const LAYER_ORIGIN_X = 40;
export const LAYER_NODE_Y = 36;

export const LAYER_LABELS = {
  'client-ui': 'Client UI',
  'client-hooks': 'Client hooks',
  'client-sync': 'Client sync',
  'client-storage': 'Client storage',
  api: 'API',
  postgres: 'Postgres',
  external: 'External',
};
