import { useCallback, useEffect, useState } from 'react';
import { SPREADSHEET_VIEWER_MODES, SPREADSHEET_VIEWER_STORAGE_KEY } from '../lib/constants.js';

const spreadsheetViewerListeners = new Set();

export function isValidSpreadsheetViewer(viewer) {
  return SPREADSHEET_VIEWER_MODES.includes(viewer);
}

function readStoredViewer() {
  try {
    const stored = localStorage.getItem(SPREADSHEET_VIEWER_STORAGE_KEY);
    if (isValidSpreadsheetViewer(stored)) return stored;
  } catch {
    /* ignore */
  }
  return 'simple';
}

function emitSpreadsheetViewer(viewer) {
  for (const listener of spreadsheetViewerListeners) {
    listener(viewer);
  }
}

export function useSpreadsheetViewerPreference() {
  const [viewer, setViewerState] = useState(readStoredViewer);

  useEffect(() => {
    const onExternalChange = (next) => {
      setViewerState(next);
    };
    spreadsheetViewerListeners.add(onExternalChange);
    return () => spreadsheetViewerListeners.delete(onExternalChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SPREADSHEET_VIEWER_STORAGE_KEY, viewer);
    } catch {
      /* ignore */
    }
  }, [viewer]);

  const setViewer = useCallback((next) => {
    const value = isValidSpreadsheetViewer(next) ? next : 'simple';
    setViewerState(value);
    emitSpreadsheetViewer(value);
  }, []);

  return { viewer, setViewer };
}
