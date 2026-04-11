import { ReactNode } from 'react';

interface PremiumInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: ReactNode;
  icon?: ReactNode;
}

export function PremiumInput({
  label,
  error,
  helper,
  icon,
  className = '',
  ...props
}: PremiumInputProps) {
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={props.id}
          className="block text-sm font-medium text-[var(--text-primary)] mb-2"
        >
          {label}
        </label>
      )}
      
      <div className="relative">
        <input
          {...props}
          className={`w-full px-4 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-300 focus:outline-none focus:border-[var(--accent-cyan)] focus:ring-1 focus:ring-[var(--accent-cyan)] focus:ring-opacity-30 disabled:opacity-50 disabled:cursor-not-allowed ${
            icon ? 'pl-10' : ''
          } ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''} ${className}`}
        />
        
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
            {icon}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-1.5">{error}</p>
      )}
      
      {helper && !error && (
        <p className="text-xs text-[var(--text-tertiary)] mt-1.5">{helper}</p>
      )}
    </div>
  );
}
