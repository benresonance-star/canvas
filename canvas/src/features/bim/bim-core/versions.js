export const BIM_PROJECTION_SCHEMA_VERSION = 'bim-projection-v0.3';
export const BIM_CONNECTOR_RULE_VERSION = 'bim-connectors-v0.1';
export const BIM_FRAGMENTS_CONVERTER_VERSION = 'thatopen-fragments-v0.2';

export function bimPipelineVersions() {
  return {
    projectionSchemaVersion: BIM_PROJECTION_SCHEMA_VERSION,
    connectorRuleVersion: BIM_CONNECTOR_RULE_VERSION,
    fragmentsConverterVersion: BIM_FRAGMENTS_CONVERTER_VERSION,
  };
}
