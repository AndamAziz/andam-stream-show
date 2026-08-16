import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';

export type AccountState = {
  userId: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  suspended: boolean;
};

/** Client-side session state. Role is informational only — the server re-checks. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading, user: session?.user ?? null };
}

export async function signOutEverywhere(): Promise<void> {
  await supabase.auth.signOut();
}
