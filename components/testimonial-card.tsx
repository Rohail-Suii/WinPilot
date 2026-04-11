import { Star } from 'lucide-react';
import { PremiumCard } from './premium-card';

interface TestimonialCardProps {
  quote: string;
  author: string;
  title: string;
  image?: string;
  rating?: number;
  className?: string;
}

export function TestimonialCard({
  quote,
  author,
  title,
  image,
  rating = 5,
  className = '',
}: TestimonialCardProps) {
  return (
    <PremiumCard
      glassEffect
      className={`p-6 md:p-8 flex flex-col ${className}`}
    >
      {/* Stars */}
      {rating > 0 && (
        <div className="flex gap-1 mb-4">
          {Array.from({ length: rating }).map((_, i) => (
            <Star
              key={i}
              size={16}
              className="fill-[var(--accent-amber)] text-[var(--accent-amber)]"
            />
          ))}
        </div>
      )}

      {/* Quote */}
      <blockquote className="text-[var(--text-secondary)] mb-6 flex-grow text-base md:text-lg italic">
        &ldquo;{quote}&rdquo;
      </blockquote>

      {/* Author info */}
      <div className="flex items-center gap-3">
        {image && (
          <img
            src={image}
            alt={author}
            className="w-10 h-10 rounded-full object-cover border border-[var(--border-color)]"
          />
        )}
        <div>
          <div className="font-semibold text-[var(--text-primary)] text-sm">
            {author}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {title}
          </div>
        </div>
      </div>
    </PremiumCard>
  );
}
