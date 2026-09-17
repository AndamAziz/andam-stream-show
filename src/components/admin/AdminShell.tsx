import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

const NAV = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/providers', label: 'Providers' },
  { to: '/admin/content', label: 'Content' },
  { to: '/admin/codes', label: 'Activation codes' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/monitoring', label: 'Monitoring' },
] as const;

export function AdminShell({ children, email }: { children: ReactNode; email: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: '/auth', replace: true });
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="border-b border-border bg-sidebar md:w-60 md:shrink-0 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between p-4 md:block">
            <Link to="/" className="text-xl font-bold tracking-tight text-primary">
              ANDAM
            </Link>
            <p className="hidden pt-1 text-xs text-muted-foreground md:block">CEO admin panel</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:px-3">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/admin' }}
                className="min-h-11 whitespace-nowrap rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-primary/15 data-[status=active]:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden p-3 md:mt-auto md:block">
            <p className="truncate px-1 pb-2 text-xs text-muted-foreground">{email}</p>
            <Button variant="secondary" className="min-h-11 w-full" onClick={signOut}>
              Log out
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-8">
          <div className="mb-6 flex items-center justify-between gap-3 md:hidden">
            <span className="truncate text-xs text-muted-foreground">{email}</span>
            <Button variant="secondary" size="sm" className="min-h-11" onClick={signOut}>
              Log out
            </Button>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="mb-8 rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
