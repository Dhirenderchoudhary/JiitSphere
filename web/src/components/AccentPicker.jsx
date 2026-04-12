'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from 'lib/utils';

const ACCENTS = [
  { name: 'yellow', primary: '45 93% 47%', foreground: '0 0% 0%', hex: '#eab308' },
  { name: 'blue', primary: '217 91% 60%', foreground: '0 0% 100%', hex: '#3B82F6' },
  { name: 'red', primary: '0 84% 60%', foreground: '0 0% 100%', hex: '#EF4444' },
  { name: 'grey', primary: '240 5% 34%', foreground: '0 0% 100%', hex: '#52525b' },
];

export default function AccentPicker() {
  const [activeAccent, setActiveAccent] = useState('yellow');
  const [theme, setTheme] = useState('dark');

  // Synchronize state with storage on first render to match the blocking init script
  useEffect(() => {
    const savedTheme = localStorage.getItem('jiitsphere-theme') || 'dark';
    const savedAccent = localStorage.getItem('jiitsphere-accent') || 'yellow';
    setTheme(savedTheme);
    setActiveAccent(savedAccent);
    
    // We don't re-apply DOM changes here because the head script handles the initial load.
    // React state just needs to catch up so the UI matches.
  }, []);

  const applyAccent = useCallback((name, currentTheme = theme) => {
    const accent = ACCENTS.find(a => a.name === name);
    if (!accent) return;

    setActiveAccent(name);
    localStorage.setItem('jiitsphere-accent', name);

    const root = document.documentElement;
    if (currentTheme === 'dark') {
      root.style.setProperty('--primary', accent.primary);
      root.style.setProperty('--primary-foreground', accent.foreground);
      root.style.setProperty('--ring', accent.primary);
    } else {
      // Light Mode: High-Fidelity Neutral (Black)
      root.style.setProperty('--primary', '0 0% 0%');
      root.style.setProperty('--primary-foreground', '0 0% 100%');
      root.style.setProperty('--ring', '0 0% 0%');
    }
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('jiitsphere-theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // Re-apply logic based on new theme
    applyAccent(activeAccent, newTheme);
  };

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/20 sm:bg-muted/10 rounded-none border border-border/10 backdrop-blur-md">
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="p-1 hover:bg-white/5 rounded-none transition-colors group flex items-center justify-center"
        title="Toggle dark/light mode"
      >
        {theme === 'dark' ? (
          <Sun className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
        ) : (
          <Moon className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
      </button>

      <div className="h-3 w-px bg-border/20 mx-0.5" />

      {/* Accent circles (only interactive/colored in Dark mode?) 
          User said "Accent only on dark mode", so maybe we hide or grey them out in light mode?
          The plan suggested subtly indicating they are a dark mode feature.
      */}
      <div className={cn(
        "flex items-center gap-1.5 transition-all duration-500",
        theme === 'light' ? "opacity-30 pointer-events-none grayscale" : "opacity-100"
      )}>
        {ACCENTS.map((accent) => (
          <button
            key={accent.name}
            onClick={() => applyAccent(accent.name)}
            className="relative group p-0.5"
            title={theme === 'dark' ? `Switch to ${accent.name} accent` : "Accents are only available in Dark Mode"}
          >
            <div 
              className={cn(
                    "size-3 rounded-full border border-white/10 transition-all duration-300",
                    activeAccent === accent.name && theme === 'dark'
                      ? "scale-110 shadow-[0_0_8px_hsla(var(--primary),0.3)]" 
                      : "opacity-60 hover:opacity-100"
              )}
              style={{ backgroundColor: accent.hex }}
            />
            {activeAccent === accent.name && theme === 'dark' && (
              <motion.div
                layoutId="accent-active"
                className="absolute -inset-0.5 border border-primary/40 rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
