'use client';

import { useAuth } from '@/lib/auth-context';
import { useLive } from '@/lib/live-context';
import { AuthGate } from './auth-gate';
import { Sidebar } from './sidebar';
import { SystemStrip } from './system-strip';
import { HeartPulse } from 'lucide-react';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { loading: liveLoading } = useLive();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-500">
          <HeartPulse className="h-5 w-5 animate-pulse text-sky-600" />
          Loading CareWatch…
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthGate />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <SystemStrip />
        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-7">
          {liveLoading ? (
            <div className="space-y-4">
              <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((key) => (
                  <div key={key} className="h-44 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
