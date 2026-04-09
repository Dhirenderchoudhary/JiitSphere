'use client';

import { useEffect, useState } from 'react';
import { MoonStar, Sun } from 'lucide-react';
import { Button } from 'components/ui/button';

const THEME_KEY = 'jaypee_theme';

const applyTheme = (isDark) => {
  document.documentElement.classList.toggle('dark', isDark);
};

export default function ThemeToggleButton({ className = '' }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    const useDark = saved ? saved === 'dark' : true;
    setIsDark(useDark);
    applyTheme(useDark);
    if (!saved) {
      window.localStorage.setItem(THEME_KEY, 'dark');
    }
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    applyTheme(next);
    window.localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={toggleTheme}
      className={className}
      aria-label={mounted && isDark ? 'Switch to light gradient theme' : 'Switch to dark gradient theme'}
      title={mounted && isDark ? 'Light gradient theme' : 'Dark gradient theme'}
    >
      {mounted && isDark ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
    </Button>
  );
}
