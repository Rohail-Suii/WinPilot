'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { PremiumButton } from './premium-button';
import { ThemeSwitcher } from './theme-switcher';

interface NavLink {
  label: string;
  href: string;
}

const navLinks: NavLink[] = [
  { label: 'Features', href: '/features' },
  { label: 'About', href: '/about' },
  { label: 'Privacy', href: '/privacy' },
];

export function PremiumHeader() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--border-color)] glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-xl text-[var(--text-primary)] hover:text-[var(--accent-cyan)] transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-magenta)] flex items-center justify-center text-[var(--text-inverse)] font-bold">
              LB
            </div>
            <span className="hidden sm:inline">LinkedBoost</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] transition-colors text-sm font-medium"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center gap-3">
            <ThemeSwitcher />

            {/* Auth Buttons - Desktop */}
            <div className="hidden sm:flex items-center gap-2">
              <PremiumButton
                variant="ghost"
                size="sm"
                href="/login"
              >
                Sign In
              </PremiumButton>
              <PremiumButton
                variant="primary"
                size="sm"
                href="/register"
              >
                Get Started
              </PremiumButton>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Toggle menu"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden border-t border-[var(--border-color)] py-4 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] transition-colors text-sm font-medium"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            
            <div className="pt-4 flex flex-col gap-2 px-4">
              <PremiumButton
                variant="ghost"
                size="md"
                href="/login"
                className="w-full justify-center"
              >
                Sign In
              </PremiumButton>
              <PremiumButton
                variant="primary"
                size="md"
                href="/register"
                className="w-full justify-center"
              >
                Get Started
              </PremiumButton>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
