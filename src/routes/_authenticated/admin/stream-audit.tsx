import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Panel, Stat } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import {
  codecGroup,
  download,
  listAuditSources,
  rowsToCsv,
  runStreamAudit,
  type AuditRow,
} from '@/lib/stream-audit';

export const Route = createFileRoute('/_authenticated/admin/stream-audit')({
  head: () => ({
    meta: [
      { title: 'Andam stream audit' },
      {
        name: 'description',
        content: 'Bulk-probe playlist channels and see which stream types and codecs fail.',
      },
      { property: 'og:title', content: 'Andam stream audit' },
      {
        property: 'og:description',
        content: 'Bulk-probe playlist channels and see which stream types and codecs fail.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: StreamAuditPage,
});

const SIZES = [50, 100, 250, 500, 0] as const;
const KINDS = ['hls', 'mpegts', 'flv', 'dash', 'file', 'bad', 'error'] as const;

type SortKey = 'num' | 'name' | 'group' | 'kindOf' | 'codec' | 'result';

function pct(n: number, total: number) {
  return total ? `${Math.round((n / total) * 1000) / 10}%` : '0%';
}

function StreamAuditPage() {
  const [source, setSource] = useState('');
  const [sampleSize, setSampleSize] = useState<number>(100);
  const [random, setRandom] = useState(true);
  const [concurrency, setConcurrency] = useState(6);
  const [probeCodecs, setProbeCodecs] = useState(true);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [filterKind, setFilterKind] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'num', dir: 1 });
  const stopRef = useRef(false);

  const sources = useQuery({
    queryKey: ['audit', 'sources'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return listAuditSources(data.session?.access_token ?? null);
    },
  });

  const activeSource = source || sources.data?.[0]?.id || '';

  const start = useCallback(async () => {
    setError('');
    setRows([]);
    setRunning(true);
    stopRef.current = false;
    setProgress({ done: 0, total: 0 });
    try {
      const { data } = await supabase.auth.getSession();
      await runStreamAudit({
        source: activeSource,
        sampleSize,
        random,
        concurrency,
        probeCodecs,
        authToken: data.session?.access_token ?? null,
        onProgress: (done, total) => setProgress({ done, total }),
        onRow: (row) => setRows((prev) => [...prev, row]),
        shouldStop: () => stopRef.current,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audit failed');
    } finally {
      setRunning(false);
    }
  }, [activeSource, sampleSize, random, concurrency, probeCodecs]);

  const kindCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.kindOf, (map.get(r.kindOf) ?? 0) + 1);
    return map;
  }, [rows]);

  const codecCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.kindOf !== 'mpegts') continue;
      const g = codecGroup(r);
      map.set(g, (map.get(g) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const mpegtsTotal = kindCounts.get('mpegts') ?? 0;
  const passCount = rows.filter((r) => r.ok).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!filterKind || r.kindOf === filterKind) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.group.toLowerCase().includes(q) ||
          r.error.toLowerCase().includes(q) ||
          r.videoCodec.toLowerCase().includes(q)),
    );
    const value = (r: AuditRow) => {
      if (sort.key === 'codec') return codecGroup(r);
      if (sort.key === 'result') return r.ok ? 'pass' : 'fail';
      return r[sort.key];
    };
    return [...list].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb)) * sort.dir;
    });
  }, [rows, filterKind, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }));

  const percentDone = progress.total ? (progress.done / progress.total) * 100 : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Stream audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Probes a sample of playlist channels and reports what each stream really is, plus the
          video codec for raw streams. Diagnostic only — nothing here changes playback.
        </p>
      </div>

      <Panel title="Audit settings">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Playlist source</span>
            <select
              className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm"
              value={activeSource}
              onChange={(e) => setSource(e.target.value)}
              disabled={running}
            >
              {(sources.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Sample size</span>
            <select
              className="h-11 w-full rounded-md border border-border bg-secondary px-3 text-sm"
              value={sampleSize}
              onChange={(e) => setSampleSize(Number(e.target.value))}
              disabled={running}
            >
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'All channels (slow)' : `${n} channels`}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Concurrent probes (3–10)</span>
            <Input
              type="number"
              min={3}
              max={10}
              value={concurrency}
              disabled={running}
              onChange={(e) => setConcurrency(Number(e.target.value) || 6)}
            />
          </label>

          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={random}
                disabled={running}
                onChange={(e) => setRandom(e.target.checked)}
              />
              Random sample (otherwise first N)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={probeCodecs}
                disabled={running}
                onChange={(e) => setProbeCodecs(e.target.checked)}
              />
              Detect codec for raw MPEG-TS channels
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button className="min-h-11" onClick={start} disabled={running || !activeSource}>
            {running ? 'Auditing…' : 'Run audit'}
          </Button>
          {running && (
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() => {
                stopRef.current = true;
              }}
            >
              Stop
            </Button>
          )}
          {rows.length > 0 && !running && (
            <>
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={() => download('stream-audit.csv', rowsToCsv(rows), 'text/csv')}
              >
                Export CSV
              </Button>
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={() =>
                  download(
                    'stream-audit.json',
                    JSON.stringify({ source: activeSource, rows }, null, 2),
                    'application/json',
                  )
                }
              >
                Export JSON
              </Button>
            </>
          )}
        </div>

        {(running || progress.total > 0) && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>
                {progress.done} of {progress.total} probed
              </span>
              <span>{Math.round(percentDone)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${percentDone}%` }}
              />
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </Panel>

      {rows.length > 0 && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Probed" value={rows.length} />
            <Stat label="Playable" value={passCount} hint={pct(passCount, rows.length)} />
            <Stat
              label="Failing"
              value={rows.length - passCount}
              hint={pct(rows.length - passCount, rows.length)}
            />
            <Stat label="Raw MPEG-TS" value={mpegtsTotal} hint={pct(mpegtsTotal, rows.length)} />
          </div>

          <Panel title="By stream type">
            <ul className="grid gap-2 text-sm md:grid-cols-2">
              {KINDS.filter((k) => kindCounts.get(k)).map((k) => (
                <li key={k} className="flex justify-between rounded-md bg-secondary px-3 py-2">
                  <span className="font-mono text-xs uppercase">{k}</span>
                  <span>
                    {kindCounts.get(k)} · {pct(kindCounts.get(k) ?? 0, rows.length)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          {mpegtsTotal > 0 && (
            <Panel title="MPEG-TS video codecs" description="Only raw MPEG-TS channels are probed.">
              <ul className="grid gap-2 text-sm md:grid-cols-2">
                {codecCounts.map(([name, count]) => (
                  <li key={name} className="flex justify-between rounded-md bg-secondary px-3 py-2">
                    <span>{name}</span>
                    <span>
                      {count} · {pct(count, mpegtsTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title={`Per-channel results (${visible.length})`}>
            <div className="mb-3 flex flex-wrap gap-3">
              <Input
                placeholder="Search name, group, codec, error"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <select
                className="h-10 rounded-md border border-border bg-secondary px-3 text-sm"
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value)}
              >
                <option value="">All types</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-[32rem] overflow-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-secondary text-muted-foreground">
                  <tr>
                    {(
                      [
                        ['num', '#'],
                        ['name', 'Channel'],
                        ['group', 'Group'],
                        ['kindOf', 'Type'],
                        ['codec', 'Codec'],
                        ['result', 'Result'],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        className="cursor-pointer whitespace-nowrap px-3 py-2 font-medium"
                        onClick={() => toggleSort(key)}
                      >
                        {label}
                        {sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{r.num}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.group}</td>
                      <td className="px-3 py-2 font-mono uppercase">{r.kindOf}</td>
                      <td className="px-3 py-2">{r.kindOf === 'mpegts' ? codecGroup(r) : '—'}</td>
                      <td
                        className={`px-3 py-2 font-medium ${r.ok ? 'text-emerald-400' : 'text-destructive'}`}
                      >
                        {r.ok ? 'pass' : 'fail'}
                      </td>
                      <td className="max-w-[22rem] truncate px-3 py-2 text-muted-foreground">
                        {r.error || `${r.status ?? ''} ${r.contentType}`.trim()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
