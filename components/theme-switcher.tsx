'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';

export function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-300 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] group"
      aria-label="Toggle theme"
    >
      {/* Sun icon - shown in dark theme */}
      <Sun className="absolute w-5 h-5 text-[var(--text-secondary)] opacity-100 group-hover:text-[var(--accent-amber)] transition-all duration-300 rotate-0 scale-100" />
      
      {/* Moon icon - shown in light theme */}
      <Moon className="absolute w-5 h-5 text-[var(--text-secondary)] opacity-0 group-hover:text-[var(--accent-cyan)] transition-all duration-300 -rotate-90 scale-0" />
      
      {/* Hide both when in light theme */}
      {theme === 'light' && (
        <>
          <Sun className="absolute w-5 h-5 text-[var(--text-secondary)] opacity-0 transition-all duration-300" />
          <Moon className="w-5 h-5 text-[var(--text-secondary)] group-hover:text-[var(--accent-cyan)] transition-colors duration-300" />
        </>
      )}
    </button>
  );
}
