import { describe, it, expect, vi } from 'vitest';
import {
  FOLDER_PICKER_ID_MAX_LENGTH,
  folderPickerId,
  buildDirectoryPickerOptions,
  isFolderPickerBusyError,
  isFolderPickerIdError,
  pickProjectDirectoryHandle,
  shouldRetryDirectoryPickerWithoutId,
} from '../folderPicker.js';

const SAMPLE_UUID = '61ddb4a2-4436-4bbe-9d9e-55da064717e6';

describe('folderPicker', () => {
  it('folderPickerId is stable per project and within API max length', () => {
    expect(folderPickerId('abc-123')).toBe('abc123');
    expect(folderPickerId(SAMPLE_UUID)).toBe('61ddb4a244364bbe9d9e55da064717e6');
    expect(folderPickerId(SAMPLE_UUID).length).toBe(FOLDER_PICKER_ID_MAX_LENGTH);
    expect(folderPickerId(SAMPLE_UUID)).toBe(folderPickerId(SAMPLE_UUID));
  });

  it('buildDirectoryPickerOptions includes id when projectId provided', () => {
    const opts = buildDirectoryPickerOptions('p1');
    expect(opts.mode).toBe('readwrite');
    expect(opts.id).toBe('p1');
    expect(opts.id.length).toBeLessThanOrEqual(FOLDER_PICKER_ID_MAX_LENGTH);
  });

  it('buildDirectoryPickerOptions omits id without projectId', () => {
    const opts = buildDirectoryPickerOptions('');
    expect(opts.mode).toBe('readwrite');
    expect(opts.id).toBeUndefined();
  });

  it('pickProjectDirectoryHandle does not open a second picker on TypeError', async () => {
    const showDirectoryPicker = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('id failed'))
      .mockRejectedValueOnce(new DOMException('already active', 'InvalidStateError'));
    vi.stubGlobal('window', { showDirectoryPicker });

    await expect(pickProjectDirectoryHandle('p1')).rejects.toThrow('id failed');
    expect(showDirectoryPicker).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('pickProjectDirectoryHandle retries once without id on NotSupportedError', async () => {
    const handle = { name: 'folder' };
    const showDirectoryPicker = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('unsupported', 'NotSupportedError'))
      .mockResolvedValueOnce(handle);
    vi.stubGlobal('window', { showDirectoryPicker });

    await expect(pickProjectDirectoryHandle('p1')).resolves.toBe(handle);
    expect(showDirectoryPicker).toHaveBeenCalledTimes(2);
    expect(showDirectoryPicker.mock.calls[1][0]).toEqual({ mode: 'readwrite' });

    vi.unstubAllGlobals();
  });

  it('shouldRetryDirectoryPickerWithoutId handles TypeError from showDirectoryPicker', () => {
    expect(
      shouldRetryDirectoryPickerWithoutId(
        new TypeError("Failed to execute 'showDirectoryPicker' on 'Window'"),
        true,
      ),
    ).toBe(true);
    expect(shouldRetryDirectoryPickerWithoutId(new TypeError('other'), true)).toBe(
      false,
    );
  });

  it('isFolderPickerIdError detects id length failures', () => {
    expect(
      isFolderPickerIdError({
        message:
          "Failed to execute 'showDirectoryPicker' on 'Window': ID 'x' cannot be longer than 32 characters.",
      }),
    ).toBe(true);
    expect(isFolderPickerIdError({ name: 'NotSupportedError' })).toBe(false);
  });

  it('pickProjectDirectoryHandle retries without id on id length error', async () => {
    const handle = { name: 'folder' };
    const showDirectoryPicker = vi
      .fn()
      .mockRejectedValueOnce(
        new DOMException(
          "ID 'canvas-folder-uuid' cannot be longer than 32 characters.",
          'NotSupportedError',
        ),
      )
      .mockResolvedValueOnce(handle);
    vi.stubGlobal('window', { showDirectoryPicker });

    await expect(pickProjectDirectoryHandle(SAMPLE_UUID)).resolves.toBe(handle);
    expect(showDirectoryPicker).toHaveBeenCalledTimes(2);
    expect(showDirectoryPicker.mock.calls[1][0]).toEqual({ mode: 'readwrite' });

    vi.unstubAllGlobals();
  });

  it('isFolderPickerBusyError detects InvalidStateError and message', () => {
    expect(
      isFolderPickerBusyError({
        name: 'InvalidStateError',
        message: "Failed to execute 'showDirectoryPicker' on 'Window'",
      }),
    ).toBe(true);
    expect(
      isFolderPickerBusyError({
        message: 'File picker already active.',
      }),
    ).toBe(true);
    expect(isFolderPickerBusyError({ name: 'AbortError' })).toBe(false);
  });
});
