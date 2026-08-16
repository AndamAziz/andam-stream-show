import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { syncMyAccount } from '@/lib/account.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/auth')({
  head: () => ({
    meta: [
      { title: 'Sign in to Andam' },
      {
        name: 'description',
        content: 'Sign in or create your Andam account to watch live TV, movies and shows.',
      },
      { property: 'og:title', content: 'Sign in to Andam' },
      {
        property: 'og:description',
        content: 'Access your Andam live TV providers, movies and shows from any device.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: AuthPage,
});

type Mode = 'signin' | 'signup' | 'forgot';

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const account = await syncMyAccount({ data: { recordLogin: false } });
      navigate({ to: account.role === 'admin' ? '/admin' : '/', replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err) throw err;
        setNotice('Password reset link sent. Check your inbox.');
        return;
      }

      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
        if (!data.session) {
          setNotice('Account created. Check your email to confirm before signing in.');
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }

      const account = await syncMyAccount({ data: { recordLogin: true } });
      if (account.suspended) {
        await supabase.auth.signOut();
        setError('This account has been suspended. Contact the administrator.');
        return;
      }
      navigate({ to: account.role === 'admin' ? '/admin' : '/', replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
        <Link to="/" className="mb-8 text-2xl font-bold tracking-tight text-primary">
          ANDAM
        </Link>
        <h1 className="text-3xl font-semibold">
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === 'forgot'
            ? 'We will email you a link to choose a new password.'
            : 'Live TV, movies and shows in one place.'}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11"
            />
          </div>

          {mode !== 'forgot' && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-11"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-accent">{notice}</p>}

          <Button type="submit" disabled={busy} className="min-h-11 w-full">
            {busy
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Sign up'
                  : 'Send reset link'}
          </Button>
        </form>

        <div className="mt-6 space-y-2 text-sm text-muted-foreground">
          {mode !== 'signin' && (
            <button type="button" className="underline" onClick={() => setMode('signin')}>
              Back to sign in
            </button>
          )}
          {mode === 'signin' && (
            <>
              <div>
                <button type="button" className="underline" onClick={() => setMode('signup')}>
                  Create an account
                </button>
              </div>
              <div>
                <button type="button" className="underline" onClick={() => setMode('forgot')}>
                  Forgot your password?
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
