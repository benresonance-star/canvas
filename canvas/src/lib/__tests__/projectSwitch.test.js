import { describe, it, expect } from 'vitest';
import {
  shouldApplyProjectLoad,
  buildSwitchPlaceholderState,
} from '../projectSwitch.js';

describe('shouldApplyProjectLoad', () => {
  it('rejects when requested project id is missing', () => {
    expect(shouldApplyProjectLoad(null, 'a', 1, 1)).toBe(false);
  });

  it('rejects when requested id does not match current active ref', () => {
    expect(shouldApplyProjectLoad('b', 'a', 1, 1)).toBe(false);
  });

  it('accepts when ids match and switch sequence is unchanged', () => {
    expect(shouldApplyProjectLoad('a', 'a', 2, 2)).toBe(true);
  });

  it('rejects when switch sequence advanced during async load', () => {
    expect(shouldApplyProjectLoad('a', 'a', 1, 2)).toBe(false);
  });

  it('accepts when no switch sequence is tracked (boot path)', () => {
    expect(shouldApplyProjectLoad('a', 'a', null, null)).toBe(true);
  });
});

describe('buildSwitchPlaceholderState', () => {
  const defaultName = 'Untitled Project';

  it('clears cards without resetting canvas view', () => {
    expect(buildSwitchPlaceholderState(null, defaultName)).toEqual({
      projectName: defaultName,
      cards: [],
    });
  });

  it('uses index row name when present', () => {
    expect(
      buildSwitchPlaceholderState({ name: '  My Project  ' }, defaultName),
    ).toEqual({
      projectName: 'My Project',
      cards: [],
    });
  });

  it('falls back to default when name is blank', () => {
    expect(buildSwitchPlaceholderState({ name: '   ' }, defaultName)).toEqual({
      projectName: defaultName,
      cards: [],
    });
  });
});
