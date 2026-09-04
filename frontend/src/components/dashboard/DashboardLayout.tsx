import type { ReactNode } from 'react';

interface DashboardLayoutProps {
  header: ReactNode;
  children: ReactNode;
}

export function DashboardLayout({ header, children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen">
      {header}
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
