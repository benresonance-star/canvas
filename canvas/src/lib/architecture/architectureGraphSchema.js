/** @typedef {{ name: string, type: string, description?: string }} ArchitectureIO */

/**
 * @typedef {object} ArchitectureNodeDef
 * @property {string} id
 * @property {string} label
 * @property {'client-ui'|'client-hooks'|'client-sync'|'client-storage'|'api'|'postgres'|'external'} layer
 * @property {string} component
 * @property {string} purpose
 * @property {string} why
 * @property {string[]} triggers
 * @property {string} codeRef
 * @property {ArchitectureIO[]} inputs
 * @property {ArchitectureIO[]} outputs
 * @property {string[]} [functions]
 * @property {string} [runtimeKey]
 * @property {boolean} [agentInspectable]
 */

/**
 * @typedef {object} ArchitecturePipeDef
 * @property {string} id
 * @property {string} source
 * @property {string} target
 * @property {string} pipeLabel
 * @property {string} dataFlow
 * @property {string[]} payloadTypes
 * @property {string} trigger
 * @property {string} why
 * @property {string[]} [functions]
 * @property {string[]} [inputs]
 * @property {string[]} [outputs]
 */

/**
 * @typedef {object} ArchitectureActionStep
 * @property {string[]} edgeIds
 * @property {string[]} activeNodeIds
 * @property {string} label
 * @property {string} description
 * @property {string} [codeRef]
 */

/**
 * @typedef {object} ArchitectureActionDef
 * @property {string} id
 * @property {string} label
 * @property {ArchitectureActionStep[]} steps
 * @property {'overview'} [mode]
 */

const NODE_LAYERS = new Set([
  'client-ui',
  'client-hooks',
  'client-sync',
  'client-storage',
  'api',
  'postgres',
  'external',
]);

const REQUIRED_NODE_FIELDS = [
  'id', 'label', 'layer', 'component', 'purpose', 'why', 'triggers', 'codeRef', 'inputs', 'outputs',
];

const REQUIRED_PIPE_FIELDS = [
  'id', 'source', 'target', 'pipeLabel', 'dataFlow', 'payloadTypes', 'trigger', 'why',
];

/**
 * @param {Partial<ArchitectureNodeDef> & Pick<ArchitectureNodeDef, 'id'|'label'|'layer'|'component'|'purpose'|'why'|'triggers'|'codeRef'|'inputs'|'outputs'>} def
 */
export function defineNode(def) {
  return {
    functions: [],
    agentInspectable: true,
    ...def,
  };
}

/**
 * @param {Partial<ArchitecturePipeDef> & Pick<ArchitecturePipeDef, 'id'|'source'|'target'|'pipeLabel'|'dataFlow'|'payloadTypes'|'trigger'|'why'>} def
 */
export function definePipe(def) {
  return {
    functions: [],
    inputs: [],
    outputs: [],
    ...def,
  };
}

/**
 * @param {ArchitectureNodeDef[]} nodes
 */
export function validateNodes(nodes) {
  const ids = new Set();
  for (const node of nodes) {
    for (const field of REQUIRED_NODE_FIELDS) {
      if (node[field] == null) {
        throw new Error(`Node ${node.id ?? '?'} missing required field: ${field}`);
      }
      if ((field === 'inputs' || field === 'outputs' || field === 'triggers')
        && !Array.isArray(node[field])) {
        throw new Error(`Node ${node.id ?? '?'} field ${field} must be an array`);
      }
    }
    if (!NODE_LAYERS.has(node.layer)) {
      throw new Error(`Node ${node.id} has invalid layer: ${node.layer}`);
    }
    if (ids.has(node.id)) throw new Error(`Duplicate node id: ${node.id}`);
    ids.add(node.id);
  }
  return ids;
}

/**
 * @param {ArchitecturePipeDef[]} pipes
 * @param {Set<string>} nodeIds
 */
export function validatePipes(pipes, nodeIds) {
  const ids = new Set();
  for (const pipe of pipes) {
    for (const field of REQUIRED_PIPE_FIELDS) {
      if (!pipe[field] || (Array.isArray(pipe[field]) && pipe[field].length === 0)) {
        throw new Error(`Pipe ${pipe.id ?? '?'} missing required field: ${field}`);
      }
    }
    if (!nodeIds.has(pipe.source)) throw new Error(`Pipe ${pipe.id} unknown source: ${pipe.source}`);
    if (!nodeIds.has(pipe.target)) throw new Error(`Pipe ${pipe.id} unknown target: ${pipe.target}`);
    if (ids.has(pipe.id)) throw new Error(`Duplicate pipe id: ${pipe.id}`);
    ids.add(pipe.id);
  }
}

export { NODE_LAYERS, REQUIRED_NODE_FIELDS, REQUIRED_PIPE_FIELDS };
