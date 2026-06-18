import { describe, expect, it } from 'vitest';
import { buildWorkspaceViewBundles } from '../buildWorkspaceViewBundles.js';

describe('buildWorkspaceViewBundles', () => {
  it('passes agent context removal handler through the agent bundle', () => {
    const handleRemoveContextCard = () => {};

    const bundles = buildWorkspaceViewBundles({ handleRemoveContextCard });

    expect(bundles.agent.handleRemoveContextCard).toBe(handleRemoveContextCard);
  });
});
