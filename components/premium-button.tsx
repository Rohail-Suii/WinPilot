import { ReactNode } from 'react';

interface PremiumButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  glowing?: boolean;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const baseStyles = 'inline-flex items-center justify-center font-semibold transition-all duration-300 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

const variants = {
  primary: 'bg-[var(--accent-cyan)] text-[var(--text-inverse)] hover:bg-[var(--accent-cyan-light)] active:scale-95 focus-visible:ring-[var(--accent-cyan)]',
  secondary: 'bg-[var(--accent-magenta)] text-[var(--text-inverse)] hover:bg-[var(--accent-magenta-light)] active:scale-95 focus-visible:ring-[var(--accent-magenta)]',
  ghost: 'bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:scale-95',
  outline: 'bg-transparent border border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] active:scale-95',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm gap-2',
  md: 'px-4 py-2.5 text-base gap-2',
  lg: 'px-6 py-3 text-lg gap-3',
};

export function PremiumButton({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  glowing = false,
  onClick,
  href,
  disabled = false,
  type = 'button',
}: PremiumButtonProps) {
  const buttonClass = `${baseStyles} ${variants[variant]} ${sizes[size]} ${glowing ? 'glow-pulse' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`;

  if (href) {
    return (
      <a href={href} className={buttonClass}>
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={buttonClass}
    >
      {children}
    </button>
  );
}
