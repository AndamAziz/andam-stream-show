import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { Panel, Stat } from '@/components/admin/AdminShell';
import { getAdminOverview } from '@/lib/admin.functions';

export const Route = createFileRoute('/_authenticated/admin/')({
  head: () => ({
    meta: [
      { title: 'Andam admin overview' },
      { name: 'description', content: 'Relay health, provider stats and recent activity for the Andam streaming service.' },
      { property: 'og:title', content: 'Andam admin overview' },
      { property: 'og:description', content: 'Relay health, provider stats and recent activity for the Andam streaming service.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
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

      <p className="mb-6 text-sm">
        <Link to="/admin/monitoring" className="text-accent hover:underline">
          View login activity →
        </Link>
      </p>

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
