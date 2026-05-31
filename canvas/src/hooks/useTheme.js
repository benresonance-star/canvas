import { useCallback, useLayoutEffect, useState } from 'react';
import { THEME_CYCLE, THEME_STORAGE_KEY } from '../lib/constants.js';

export function isValidTheme(theme) {
  return THEME_CYCLE.includes(theme);
}

export function nextTheme(current) {
  const i = THEME_CYCLE.indexOf(current);
  const next = i === -1 ? 0 : (i + 1) % THEME_CYCLE.length;
  return THEME_CYCLE[next];
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isValidTheme(stored)) return stored;
  } catch {
    /* ignore */
  }
  return 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState(readStoredTheme);

  useLayoutEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(isValidTheme(next) ? next : 'light');
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((t) => nextTheme(t));
  }, []);

  return { theme, setTheme, cycleTheme, toggleTheme: cycleTheme };
}
