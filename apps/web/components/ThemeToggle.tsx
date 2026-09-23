'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/ui';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'atlas-theme';

/**
 * The document's light/dark theme and a way to flip it, persisting the choice.
 * The initial theme is set before paint by the inline script in the root
 * layout (no flash); this only reads and toggles it. `null` until mounted, so
 * server and client markup match.
 */
export function useThemeMode(): [Theme | null, () => void] {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / storage disabled — theme just won't persist */
    }
    setTheme(next);
  }

  return [theme, toggle];
}

/** The compact control, for the sidebar and the sign-in screen. */
export function ThemeToggle() {
  const [theme, toggle] = useThemeMode();

  if (!theme) return <span style={{ width: 34, height: 34 }} aria-hidden />;

  const next: Theme = theme === 'light' ? 'dark' : 'light';
  return (
    <IconButton label={`Switch to ${next} theme`} onClick={toggle}>
      {theme === 'light' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
    </IconButton>
  );
}
