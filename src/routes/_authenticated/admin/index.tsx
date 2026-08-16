import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { Panel, Stat } from '@/components/admin/AdminShell';
import { getAdminOverview } from '@/lib/admin.functions';

export const Route = createFileRoute('/_authenticated/admin/')({
  component: Overview,
});

function Overview() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => getAdminOverview(),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Overview</h1>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active providers" value={isLoading ? '—' : data?.activeProviders ?? 0} hint={`${data?.totalProviders ?? 0} total`} />
        <Stat label="Registered users" value={isLoading ? '—' : data?.totalUsers ?? 0} />
        <Stat
          label="Relay proxy"
          value={isLoading ? '—' : data?.relay.ok ? 'Healthy' : 'Down'}
          hint={data ? `HTTP ${data.relay.status} · ${data.relay.ms}ms` : ''}
        />
        <Stat label="Recent errors" value={isLoading ? '—' : data?.recentErrors.length ?? 0} hint="last 15 logged" />
      </div>

      <Panel title="Recent login activity">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data?.recentLogins.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No sign-ins recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {data?.recentLogins.map((l, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{l.email ?? 'unknown'}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Providers" description="Active state per configured provider.">
        <ul className="divide-y divide-border text-sm">
          {(data?.providers ?? []).map((p) => (
            <li key={p.id} className="flex justify-between py-2">
              <span>{p.name}</span>
              <span className={p.active ? 'text-accent' : 'text-muted-foreground'}>
                {p.active ? 'active' : 'inactive'}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
