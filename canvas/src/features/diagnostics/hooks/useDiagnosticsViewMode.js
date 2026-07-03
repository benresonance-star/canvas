import { useCallback, useState } from 'react';

/** @typedef {'2d' | '3d'} DiagnosticsViewMode */

export function useDiagnosticsViewMode() {
  const [viewMode, setViewModeState] = useState(/** @type {DiagnosticsViewMode} */ ('2d'));
  const [concentrateEnabled, setConcentrateEnabledState] = useState(false);

  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewModeState((current) => (current === '2d' ? '3d' : '2d'));
  }, []);

  const setConcentrateEnabled = useCallback((enabled) => {
    setConcentrateEnabledState(enabled);
  }, []);

  const toggleConcentrate = useCallback(() => {
    setConcentrateEnabledState((current) => !current);
  }, []);

  return {
    viewMode,
    setViewMode,
    toggleViewMode,
    is3d: viewMode === '3d',
    concentrateEnabled,
    setConcentrateEnabled,
    toggleConcentrate,
  };
}
