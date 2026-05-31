import { isUlid } from './shared/ulid.js';
import { CLUSTER_STATUSES } from './shared/types.js';

export function validateCluster(cluster) {
  if (!cluster?.id || !isUlid(cluster.id)) throw new Error('cluster.id: invalid ULID');
  if (!cluster.name) throw new Error('cluster.name is required');
  if (!CLUSTER_STATUSES.includes(cluster.status)) throw new Error('invalid cluster status');
  if (!Array.isArray(cluster.members)) throw new Error('cluster.members must be an array');
}
