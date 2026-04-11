import { ReactNode } from 'react';

interface PremiumCardProps {
  children: ReactNode;
  className?: string;
  glassEffect?: boolean;
  hoverable?: boolean;
  spotlight?: boolean;
  gradient?: boolean;
}

export function PremiumCard({
  children,
  className = '',
  glassEffect = true,
  hoverable = true,
  spotlight = false,
  gradient = false,
}: PremiumCardProps) {
  const baseStyles = 'rounded-xl transition-all duration-300';
  
  const glassStyles = glassEffect
    ? 'glass'
    : 'bg-var(--bg-secondary) border border-var(--border-color)';
  
  const hoverStyles = hoverable
    ? 'hover:shadow-lg hover:border-var(--border-light) cursor-pointer'
    : '';
  
  const spotlightStyles = spotlight ? 'spotlight-card' : '';
  
  const gradientStyles = gradient
    ? 'relative overflow-hidden'
    : '';

  return (
    <div
      className={`${baseStyles} ${glassStyles} ${hoverStyles} ${spotlightStyles} ${gradientStyles} ${className}`}
    >
      {gradient && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-var(--accent-cyan) to-var(--accent-magenta)" />
      )}
      <div className={gradient ? 'relative z-10' : ''}>
        {children}
      </div>
    </div>
  );
}
