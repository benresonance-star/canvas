import { describe, expect, it } from 'vitest';
import { buildAddMenuItems } from '../../components/addMenuItems.js';
import { shouldOpenCanvasAddMenu } from '../../components/AddMenu.jsx';

describe('buildAddMenuItems', () => {
  it('disables project items without an active project', () => {
    const items = buildAddMenuItems({
      syncLock: 'live',
      activeProjectId: null,
      folderLinked: true,
    });
    expect(items.find((item) => item.id === 'sonic')?.disabled).toBe(true);
    expect(items.find((item) => item.id === 'flow')?.disabled).toBe(true);
    expect(items.find((item) => item.id === 'link')?.disabled).toBe(false);
  });

  it('includes Sonic Studio as a project-backed item', () => {
    const items = buildAddMenuItems({
      syncLock: 'live',
      activeProjectId: 'project-1',
      folderLinked: false,
    });
    const sonic = items.find((item) => item.id === 'sonic');
    expect(sonic?.label).toBe('Add Sonic Studio');
    expect(sonic?.disabled).toBe(false);
  });

  it('keeps task and note visible but disabled without a folder', () => {
    const items = buildAddMenuItems({
      syncLock: 'live',
      activeProjectId: 'project-1',
      folderLinked: false,
    });
    const task = items.find((item) => item.id === 'task');
    const note = items.find((item) => item.id === 'note');
    expect(task?.disabled).toBe(true);
    expect(note?.disabled).toBe(true);
    expect(task?.disabledReason).toContain('folder');
  });

  it('disables all items while sync is locked', () => {
    const items = buildAddMenuItems({
      syncLock: 'busy',
      activeProjectId: 'project-1',
      folderLinked: true,
    });
    expect(items.every((item) => item.disabled)).toBe(true);
  });
});

describe('shouldOpenCanvasAddMenu', () => {
  it('blocks editable targets', () => {
    const event = {
      defaultPrevented: false,
      target: { tagName: 'INPUT', isContentEditable: false },
    };
    expect(shouldOpenCanvasAddMenu(event)).toBe(false);
  });

  it('allows canvas background targets', () => {
    const event = {
      defaultPrevented: false,
      target: { tagName: 'DIV', isContentEditable: false },
    };
    expect(shouldOpenCanvasAddMenu(event)).toBe(true);
  });
});
