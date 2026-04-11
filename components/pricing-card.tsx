import { ReactNode } from 'react';
import { PremiumButton } from './premium-button';
import { PremiumCard } from './premium-card';
import { Check } from 'lucide-react';

interface PricingCardProps {
  name: string;
  description?: string;
  price?: string | ReactNode;
  period?: string;
  features: string[];
  cta?: string;
  ctaVariant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  onCtaClick?: () => void;
  ctaHref?: string;
  highlighted?: boolean;
  badge?: string;
  className?: string;
}

export function PricingCard({
  name,
  description,
  price,
  period,
  features,
  cta = 'Get Started',
  ctaVariant = 'primary',
  onCtaClick,
  ctaHref,
  highlighted = false,
  badge,
  className = '',
}: PricingCardProps) {
  return (
    <PremiumCard
      glassEffect={!highlighted}
      hoverable
      className={`p-6 md:p-8 flex flex-col h-full transition-all duration-300 ${
        highlighted
          ? 'ring-2 ring-var(--accent-cyan) scale-105 md:scale-110 shadow-2xl'
          : 'hover:ring-1 hover:ring-var(--border-color)'
      } ${className}`}
    >
      {/* Badge */}
      {badge && (
        <div className="mb-4">
          <span className="inline-block px-3 py-1 text-xs font-semibold text-var(--text-inverse) bg-gradient-to-r from-var(--accent-cyan) to-var(--accent-magenta) rounded-full">
            {badge}
          </span>
        </div>
      )}

      {/* Plan name */}
      <h3 className="text-2xl font-bold text-var(--text-primary) mb-2">
        {name}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-var(--text-secondary) text-sm mb-4">
          {description}
        </p>
      )}

      {/* Price */}
      {price && (
        <div className="mb-6">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold bg-gradient-to-r from-var(--accent-cyan) to-var(--accent-magenta) bg-clip-text text-transparent">
              {price}
            </span>
            {period && (
              <span className="text-var(--text-secondary) text-sm">
                {period}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Features */}
      <div className="space-y-3 mb-8 flex-grow">
        {features.map((feature, index) => (
          <div key={index} className="flex items-start gap-3">
            <Check className="w-5 h-5 text-var(--accent-cyan) flex-shrink-0 mt-0.5" />
            <span className="text-var(--text-secondary) text-sm">{feature}</span>
          </div>
        ))}
      </div>

      {/* CTA Button */}
      <PremiumButton
        variant={ctaVariant}
        size="lg"
        className="w-full"
        onClick={onCtaClick}
        href={ctaHref}
      >
        {cta}
      </PremiumButton>
    </PremiumCard>
  );
}
