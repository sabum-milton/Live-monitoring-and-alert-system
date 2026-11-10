'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/lib/auth-context';
import { LiveProvider } from '@/lib/live-context';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LiveProvider>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </LiveProvider>
      <Toaster position="top-right" richColors closeButton />
    </AuthProvider>
  );
}
