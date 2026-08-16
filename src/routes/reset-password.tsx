import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/reset-password')({
  head: () => ({
    meta: [
      { title: 'Choose a new Andam password' },
      { name: 'description', content: 'Set a new password for your Andam streaming account.' },
      { property: 'og:title', content: 'Choose a new Andam password' },
      {
        property: 'og:description',
        content: 'Finish resetting your Andam account password to get back to watching.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const isRecovery =
      window.location.hash.includes('type=recovery') ||
      new URLSearchParams(window.location.search).has('code');
    supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session) || isRecovery);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) setError(err.message);
    else {
      setDone(true);
      setTimeout(() => navigate({ to: '/auth', replace: true }), 1500);
    }
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        {!ready && (
          <p className="mt-3 text-sm text-muted-foreground">
            Open this page from the reset link in your email.
          </p>
        )}
        {done ? (
          <p className="mt-4 text-sm text-accent">Password updated. Redirecting to sign in…</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <Label htmlFor="pw">New password</Label>
            <Input
              id="pw"
              type="password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="min-h-11 w-full">
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
