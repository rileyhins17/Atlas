'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/ui';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'atlas-theme';

/**
 * Flips the document between light and dark, persisting the choice. The actual
 * initial theme is set before paint by the inline script in the root layout
 * (no flash); this control just reads and toggles it. Renders a placeholder
 * until mounted so server and client markup match.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  if (!theme) return <span style={{ width: 34, height: 34 }} aria-hidden />;

  const next: Theme = theme === 'light' ? 'dark' : 'light';
  function toggle() {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / storage disabled — theme just won't persist */
    }
    setTheme(next);
  }

  return (
    <IconButton label={`Switch to ${next} theme`} onClick={toggle}>
      {theme === 'light' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
    </IconButton>
  );
}
