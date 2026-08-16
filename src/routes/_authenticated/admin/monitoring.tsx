import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { Panel, Stat } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { getAdminOverview } from '@/lib/admin.functions';

export const Route = createFileRoute('/_authenticated/admin/monitoring')({
  component: MonitoringPage,
});

function MonitoringPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => getAdminOverview(),
    refetchInterval: 30_000,
  });

  const providerName = (id: string | null) =>
    (data?.providers ?? []).find((p) => p.id === id)?.name ?? '—';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Monitoring</h1>
        <Button variant="secondary" className="min-h-11" onClick={() => refetch()}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Relay /health"
          value={isLoading ? '—' : data?.relay.ok ? 'OK' : 'FAIL'}
          hint={data ? `HTTP ${data.relay.status} in ${data.relay.ms}ms` : ''}
        />
        <Stat label="Active providers" value={data?.activeProviders ?? '—'} />
        <Stat label="Users" value={data?.totalUsers ?? '—'} />
        <Stat label="Logged errors" value={data?.recentErrors.length ?? '—'} />
      </div>

      <Panel title="Relay proxy response">
        <pre className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs text-muted-foreground">
          {data?.relay.detail || 'no response body'}
        </pre>
      </Panel>

      <Panel title="Recent playback errors" description="403 / 411 / timeout events logged by the stream proxy.">
        {(data?.recentErrors.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No playback errors logged.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(data?.recentErrors ?? []).map((e, i) => (
              <li key={i} className="py-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-mono text-xs">
                    {e.status ?? '—'} · {e.kind ?? '—'} · id {e.item_id ?? '—'} ·{' '}
                    {providerName(e.source_id)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                {e.message && <p className="text-xs text-muted-foreground">{e.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent logins">
        <ul className="divide-y divide-border text-sm">
          {(data?.recentLogins ?? []).map((l, i) => (
            <li key={i} className="py-2">
              <div className="flex flex-wrap justify-between gap-2">
                <span>{l.email ?? 'unknown'}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString()}
                </span>
              </div>
              {l.user_agent && (
                <p className="truncate text-xs text-muted-foreground">{l.user_agent}</p>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
