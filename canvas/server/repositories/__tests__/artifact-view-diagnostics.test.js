import { describe, expect, it, vi } from 'vitest';
import {
  recordArtifactViewDiagnostics,
  summarizeArtifactViewDiagnostics,
} from '../artifact-view-diagnostics.js';

describe('artifact view diagnostics repository', () => {
  it('records only positive rollout counters', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };
    const rows = await recordArtifactViewDiagnostics({
      projectId: 'p1',
      mode: 'shadow',
      eventType: 'comparison',
      counts: { loads: 1, missing_view: 0 },
    }, db);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1].slice(0, 5)).toEqual([
      'p1', 'shadow', 'comparison', 'loads', 1,
    ]);
    expect(rows).toEqual([{ id: 1 }]);
  });

  it('maps aggregate summary rows', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          mode: 'shadow', event_type: 'comparison', category: 'loads', count: '4',
          last_seen_at: '2026-07-12T00:00:00.000Z',
        }],
      }),
    };
    await expect(summarizeArtifactViewDiagnostics('p1', { hours: 48 }, db)).resolves.toEqual([{
      mode: 'shadow', eventType: 'comparison', category: 'loads', count: 4,
      lastSeenAt: '2026-07-12T00:00:00.000Z',
    }]);
    expect(db.query.mock.calls[0][1]).toEqual(['p1', 48]);
  });
});
