'use client';

import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';

export function ThemeControl({ userId }: Readonly<{ userId: string }>) {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const key = `sgi.appearance.${userId}`;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(key);
    } catch {
      /* Preference storage is optional. */
    }
    const selected = saved === 'light' || saved === 'dark' ? saved : 'system';
    document.documentElement.dataset.theme = selected;
    const scheduled = window.setTimeout(() => setTheme(selected), 0);
    return () => {
      window.clearTimeout(scheduled);
      delete document.documentElement.dataset.theme;
    };
  }, [userId]);

  function change(value: Theme) {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem(`sgi.appearance.${userId}`, value);
    } catch {
      /* Still applies for this visit. */
    }
  }

  return (
    <label className="theme-control">
      <span>Apariencia</span>
      <select
        aria-label="Apariencia"
        value={theme}
        onChange={(event) => change(event.target.value as Theme)}
      >
        <option value="system">Del dispositivo</option>
        <option value="light">Claro</option>
        <option value="dark">Oscuro</option>
      </select>
    </label>
  );
}
