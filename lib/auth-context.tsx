'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase/client';
import type { Profile, Role } from './types';

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Unable to load profile', error);
      setProfile(null);
      return;
    }
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      (async () => {
        if (cancelled) return;
        setSession(nextSession);
        if (nextSession?.user) {
          await loadProfile(nextSession.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(
        error.message.toLowerCase().includes('invalid')
          ? 'Email or password is incorrect.'
          : 'Unable to sign in. Please try again.'
      );
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        throw new Error(
          error.message.toLowerCase().includes('already')
            ? 'An account with that email already exists.'
            : 'Unable to create the account. Please try again.'
        );
      }
      if (!data.session) {
        throw new Error('Account created, but sign-in is required. Please sign in.');
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, profile, role: profile?.role ?? null, loading, signIn, signUp, signOut }),
    [session, profile, loading, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
