'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth-context';
import { Activity, AlertTriangle, HeartPulse, LockKeyhole, ShieldPlus, Stethoscope } from 'lucide-react';

export function AuthGate() {
  const { signIn, signUp, loading } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError('Enter a valid email address and a password of at least 6 characters.');
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      setError('Enter your full name.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, fullName.trim());
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(217,55%,15%)]">
        <div className="flex items-center gap-3 text-slate-300">
          <HeartPulse className="h-5 w-5 animate-pulse text-sky-300" />
          Preparing the monitoring console…
        </div>
      </div>
    );
  }

  return (
    <div className="carewatch-grid flex min-h-screen items-center justify-center bg-[hsl(217,55%,15%)] px-4 py-10">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="hidden text-slate-200 lg:block">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/20 ring-1 ring-sky-400/30">
              <ShieldPlus className="h-6 w-6 text-sky-300" />
            </span>
            <div>
              <p className="text-lg font-semibold text-white">CareWatch</p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Intelligent patient monitoring
              </p>
            </div>
          </div>
          <h1 className="text-3xl font-semibold leading-tight text-white">
            One patient. One device. Continuous vigilance.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
            CareWatch reads vital signs from an ESP32 bedside unit, classifies each parameter against
            configurable limits, and routes alerts to the nurse on duty — with a full audit trail of
            every acknowledgment and resolution.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            <Feature icon={<HeartPulse className="h-4 w-4 text-emerald-400" />} text="Heart rate, SpO2, temperature and respiratory rate" />
            <Feature icon={<AlertTriangle className="h-4 w-4 text-amber-400" />} text="Explainable NORMAL / ABNORMAL / CRITICAL classification" />
            <Feature icon={<Activity className="h-4 w-4 text-sky-400" />} text="Nurse acknowledgment, resolution and audit history" />
          </ul>
        </div>

        <Card className="border-white/10 bg-white/95 p-6 shadow-2xl backdrop-blur">
          <div className="mb-5 flex items-center gap-2 text-slate-900 lg:hidden">
            <ShieldPlus className="h-5 w-5 text-sky-600" />
            <span className="font-semibold">CareWatch</span>
          </div>
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <TabsContent value="signin" className="mt-0 space-y-4">
                <Field id="signin-email" label="Work email">
                  <Input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nurse@hospital.example"
                  />
                </Field>
              </TabsContent>

              <TabsContent value="signup" className="mt-0 space-y-4">
                <Field id="signup-name" label="Full name">
                  <Input
                    id="signup-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Nurse A. Mensah"
                  />
                </Field>
                <Field id="signup-email" label="Work email">
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nurse@hospital.example"
                  />
                </Field>
              </TabsContent>

              <Field id="password" label="Password">
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                />
              </Field>

              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={busy} className="w-full gap-2">
                <LockKeyhole className="h-4 w-4" />
                {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </form>
          </Tabs>

          <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
            <Stethoscope className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The first account created becomes the administrator and can adjust alert thresholds. Later
            accounts are created as nurses. This is a university prototype and is not a clinically
            certified medical device.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-2.5">
      {icon}
      {text}
    </li>
  );
}
