import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Panel } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  createActivationCode,
  deleteActivationCode,
  renewActivationCode,
  getActivationCodes,
  getProviders,
  revokeActivationCode,
} from '@/lib/admin.functions';

export const Route = createFileRoute('/_authenticated/admin/codes')({
  head: () => ({
    meta: [
      { title: 'Andam activation codes' },
      {
        name: 'description',
        content: 'Generate, track and revoke activation codes that unlock Live TV, Movies and Shows.',
      },
      { property: 'og:title', content: 'Andam activation codes' },
      {
        property: 'og:description',
        content: 'Generate, track and revoke activation codes that unlock Live TV, Movies and Shows.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: CodesPage,
});

type Section = 'live' | 'movies' | 'series';

const SECTION_LABELS: Array<{ key: Section; label: string }> = [
  { key: 'live', label: 'Live TV' },
  { key: 'movies', label: 'Movies' },
  { key: 'series', label: 'Shows' },
];

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-accent/15 text-accent',
  used: 'bg-secondary text-muted-foreground',
  expired: 'bg-secondary text-muted-foreground',
  revoked: 'bg-destructive/15 text-destructive',
};

function CodesPage() {
  const qc = useQueryClient();
  const [sourceId, setSourceId] = useState('');
  const [sections, setSections] = useState<Section[]>(['live']);
  const [maxUses, setMaxUses] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [fresh, setFresh] = useState('');
  const [error, setError] = useState('');
  const [renewing, setRenewing] = useState<{ id: string; code: string; date: string } | null>(null);

  const providers = useQuery({ queryKey: ['admin', 'providers'], queryFn: () => getProviders() });
  const codes = useQuery({ queryKey: ['admin', 'codes'], queryFn: () => getActivationCodes() });

  const create = useMutation({
    mutationFn: () =>
      createActivationCode({
        data: {
          sourceId: sourceId || null,
          sections,
          maxUses: Number(maxUses) || 1,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null,
          note,
        },
      }),
    onSuccess: (res) => {
      setFresh(res.code);
      setError('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['admin', 'codes'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const refreshCodes = () => qc.invalidateQueries({ queryKey: ['admin', 'codes'] });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeActivationCode({ data: { id } }),
    onSuccess: () => {
      setError('');
      refreshCodes();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteActivationCode({ data: { id } }),
    onSuccess: () => {
      setError('');
      refreshCodes();
    },
    onError: (e: Error) => setError(e.message),
  });

  const renew = useMutation({
    mutationFn: (v: { id: string; expiresAt: string | null }) =>
      renewActivationCode({ data: v }),
    onSuccess: () => {
      setError('');
      setRenewing(null);
      refreshCodes();
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = (key: Section) =>
    setSections((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Activation codes</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        New viewers can only open IPTV. A code unlocks Live TV, Movies or Shows — optionally for one
        provider only.
      </p>

      <Panel title="Generate a code" description="Pick what the code unlocks, then share it with the viewer.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="code-provider">Provider</Label>
            <select
              id="code-provider"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">All providers</option>
              {(providers.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Sections unlocked</Label>
            <div className="flex flex-wrap gap-2">
              {SECTION_LABELS.map((s) => (
                <Button
                  key={s.key}
                  type="button"
                  size="sm"
                  variant={sections.includes(s.key) ? 'default' : 'secondary'}
                  className="min-h-11"
                  onClick={() => toggle(s.key)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="code-uses">Max uses</Label>
            <Input
              id="code-uses"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))}
              placeholder="1"
              className="min-h-11"
            />
            <p className="text-xs text-muted-foreground">1 = single use.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="code-expiry">Expires on (optional)</Label>
            <Input
              id="code-expiry"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="min-h-11"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="code-note">Note (optional)</Label>
            <Input
              id="code-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Who is this for?"
              className="min-h-11"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            className="min-h-11"
            disabled={!sections.length || create.isPending}
            onClick={() => create.mutate()}
          >
            Generate code
          </Button>
          {fresh && (
            <span className="rounded-md bg-accent/15 px-3 py-2 font-mono text-sm text-accent">
              {fresh}
            </span>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </Panel>

      <Panel title="Issued codes" description="Status, usage and who redeemed each code.">
        {codes.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (codes.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No codes yet.</p>
        ) : (
          <div className="space-y-2">
            {(codes.data ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm">{c.code}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[c.status] ?? 'bg-secondary'}`}
                  >
                    {c.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.provider}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.sections
                      .map((s) => SECTION_LABELS.find((l) => l.key === s)?.label ?? s)
                      .join(', ')}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.uses}/{c.maxUses} used
                  </span>
                  {c.expiresAt && (
                    <span className="text-xs text-muted-foreground">
                      expires {c.expiresAt.slice(0, 10)}
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {/* Expired / revoked / exhausted codes can be revived in place so
                        the string already handed to a viewer keeps working. */}
                    {c.status !== 'active' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11"
                        onClick={() => setRenewing({ id: c.id, code: c.code, date: '' })}
                      >
                        Renew
                      </Button>
                    )}
                    {/* Redeemed codes keep their history: revoke, never delete. */}
                    {c.uses > 0 ? (
                      c.status !== 'revoked' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11"
                          onClick={() => revoke.mutate(c.id)}
                        >
                          Revoke
                        </Button>
                      )
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11 text-destructive"
                        onClick={() => remove.mutate(c.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
                {c.note && <p className="mt-2 text-xs text-muted-foreground">{c.note}</p>}
                {c.redeemedBy.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Redeemed by{' '}
                    {c.redeemedBy.map((r) => `${r.email} (${r.at.slice(0, 10)})`).join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
