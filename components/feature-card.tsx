import { ReactNode } from 'react';
import { PremiumCard } from './premium-card';

interface FeatureCardProps {
  icon?: ReactNode;
  title: string;
  description: string;
  badge?: string;
  details?: string[];
  className?: string;
}

export function FeatureCard({
  icon,
  title,
  description,
  badge,
  details,
  className = '',
}: FeatureCardProps) {
  return (
    <PremiumCard
      glassEffect
      hoverable
      spotlight
      className={`p-6 md:p-8 h-full flex flex-col ${className}`}
    >
      <div className="flex items-start justify-between mb-4">
        {icon && (
          <div className="flex-shrink-0">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-magenta)] text-[var(--text-inverse)]">
              {icon}
            </div>
          </div>
        )}
        {badge && (
          <span className="inline-block px-3 py-1 text-xs font-semibold text-[var(--accent-cyan)] bg-[var(--bg-secondary)] rounded-full border border-[var(--border-color)]">
            {badge}
          </span>
        )}
      </div>

      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
        {title}
      </h3>

      <p className="text-[var(--text-secondary)] mb-4 flex-grow">
        {description}
      </p>

      {details && details.length > 0 && (
        <ul className="space-y-2 text-sm text-[var(--text-tertiary)]">
          {details.map((detail, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-[var(--accent-cyan)] font-bold mt-0.5">
                •
              </span>
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      )}
    </PremiumCard>
  );
}
