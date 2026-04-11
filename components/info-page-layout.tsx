import { ReactNode } from 'react';
import { PremiumHeader } from './premium-header';
import { PremiumFooter } from './premium-footer';

interface InfoPageLayoutProps {
  children: ReactNode;
}

export function InfoPageLayout({ children }: InfoPageLayoutProps) {
  return (
    <div className="min-h-screen bg-var(--bg-primary)">
      <PremiumHeader />
      <main className="flex-1">
        {children}
      </main>
      <PremiumFooter />
    </div>
  );
}
