import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  DEFAULT_THEME,
  loadThemeMeta,
  type ThemeMeta,
} from './themeLoader';

const STORAGE_KEY = 'aspects.theme';

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export interface UseThemeResult {
  theme: string;
  themes: ThemeMeta[];
  loading: boolean;
  setTheme: (name: string) => void;
}

export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<string>(() => readStored());
  const [themes, setThemes] = useState<ThemeMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applyTheme(theme).catch(() => {
      /* applyTheme уже логирует */
    });
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    loadThemeMeta()
      .then((list) => {
        if (!cancelled) {
          setThemes(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((name: string) => {
    setThemeState(name);
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      /* quota */
    }
  }, []);

  return { theme, themes, loading, setTheme };
}