import { describe, it, expect } from 'vitest';
import {
  isRevisionStaleBanner,
  resolveSyncBanner,
  shouldShowRefreshFromServer,
} from '../syncUi.js';
import { strings } from '../../content/strings.js';

describe('syncUi', () => {
  it('resolveSyncBanner clears revision stale text when live', () => {
    expect(
      resolveSyncBanner('live', strings.projects.serverRevisionStale),
    ).toBeNull();
    expect(resolveSyncBanner('live', 'Other banner')).toBe('Other banner');
  });

  it('shouldShowRefreshFromServer is disabled (auto-reconcile handles drift)', () => {
    expect(
      shouldShowRefreshFromServer(
        'stale',
        strings.projects.serverRevisionStale,
        true,
      ),
    ).toBe(false);
    expect(isRevisionStaleBanner(strings.projects.serverRevisionStale)).toBe(true);
  });
});
