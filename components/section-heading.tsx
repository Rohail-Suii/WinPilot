import { ReactNode } from 'react';

interface SectionHeadingProps {
  title: ReactNode;
  subtitle?: ReactNode;
  centered?: boolean;
  className?: string;
  gradient?: boolean;
}

export function SectionHeading({
  title,
  subtitle,
  centered = true,
  className = '',
  gradient = true,
}: SectionHeadingProps) {
  return (
    <div className={`${centered ? 'text-center' : ''} ${className}`}>
      <h2
        className={`text-4xl md:text-5xl font-bold tracking-tight mb-4 ${
          gradient ? 'gradient-text' : 'text-[var(--text-primary)]'
        } text-balance`}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-lg md:text-xl text-[var(--text-secondary)] max-w-3xl mx-auto text-balance">
          {subtitle}
        </p>
      )}
    </div>
  );
}
