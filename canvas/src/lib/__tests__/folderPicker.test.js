import { describe, it, expect } from 'vitest';
import { folderPickerId, buildDirectoryPickerOptions } from '../folderPicker.js';

describe('folderPicker', () => {
  it('folderPickerId is stable per project', () => {
    expect(folderPickerId('abc-123')).toBe('canvas-folder-abc-123');
  });

  it('buildDirectoryPickerOptions includes id when projectId provided', () => {
    const opts = buildDirectoryPickerOptions('p1');
    expect(opts.mode).toBe('readwrite');
    expect(opts.id).toBe('canvas-folder-p1');
  });

  it('buildDirectoryPickerOptions omits id without projectId', () => {
    const opts = buildDirectoryPickerOptions('');
    expect(opts.mode).toBe('readwrite');
    expect(opts.id).toBeUndefined();
  });
});
