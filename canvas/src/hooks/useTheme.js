import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { THEME_CYCLE, THEME_STORAGE_KEY } from '../lib/constants.js';

const themeListeners = new Set();

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

function emitTheme(theme) {
  for (const listener of themeListeners) {
    listener(theme);
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(readStoredTheme);

  useEffect(() => {
    const onExternalChange = (next) => {
      setThemeState(next);
    };
    themeListeners.add(onExternalChange);
    return () => themeListeners.delete(onExternalChange);
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    const value = isValidTheme(next) ? next : 'light';
    setThemeState(value);
    emitTheme(value);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const value = nextTheme(current);
      emitTheme(value);
      return value;
    });
  }, []);

  return { theme, setTheme, cycleTheme, toggleTheme: cycleTheme };
}
