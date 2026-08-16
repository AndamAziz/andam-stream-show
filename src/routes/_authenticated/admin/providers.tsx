import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Panel } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  getProviders,
  refreshProviderPlaylist,
  removeProvider,
  revealProviderPassword,
  testProviderConnection,
  upsertProvider,
} from '@/lib/admin.functions';

export const Route = createFileRoute('/_authenticated/admin/providers')({
  head: () => ({
    meta: [
      { title: 'Andam provider management' },
      { name: 'description', content: 'Add, edit and test the IPTV providers powering Andam Live TV.' },
      { property: 'og:title', content: 'Andam provider management' },
      { property: 'og:description', content: 'Add, edit and test the IPTV providers powering Andam Live TV.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: ProvidersPage,
});

type FormState = {
  id?: string;
  type: 'xtream' | 'm3u';
  name: string;
  slug: string;
  base_url: string;
  username: string;
  password: string;
  playlist_url: string;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
};

const emptyForm: FormState = {
  type: 'xtream',
  name: '',
  slug: '',
  base_url: '',
  username: '',
  password: '',
  playlist_url: '',
  is_active: true,
  is_public: true,
  sort_order: 0,
};

type Probe = Awaited<ReturnType<typeof testProviderConnection>>;

function ProvidersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState('');
  const [probes, setProbes] = useState<Record<string, Probe>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealFor, setRevealFor] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState('');

  const providers = useQuery({ queryKey: ['admin', 'providers'], queryFn: () => getProviders() });

  const save = useMutation({
    mutationFn: () =>
      upsertProvider({
        data: {
          ...(form.id ? { id: form.id } : {}),
          type: form.type,
          name: form.name,
          slug: form.slug,
          base_url: form.base_url,
          username: form.username,
          playlist_url: form.playlist_url,
          ...(form.password ? { password: form.password } : {}),
          is_active: form.is_active,
          is_public: form.is_public,
          sort_order: Number(form.sort_order) || 0,
        },
      }),
    onSuccess: () => {
      setForm(emptyForm);
      setMessage('Provider saved. Viewers see the change immediately.');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => removeProvider({ data: { id } }),
    onSuccess: () => {
      setMessage('Provider deleted.');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const refresh = useMutation({
    mutationFn: (id: string) => refreshProviderPlaylist({ data: { id } }),
    onSuccess: (res) => {
      setMessage(
        `Playlist refreshed — ${res.channelCount} channels across ${res.categoryCount} categories.`,
      );
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const test = useMutation({
    mutationFn: (input: { id?: string }) =>
      testProviderConnection({
        data: input.id
          ? { id: input.id }
          : { base_url: form.base_url, username: form.username, password: form.password },
      }),
    onSuccess: (result, input) => setProbes((p) => ({ ...p, [input.id ?? 'form']: result })),
    onError: (e: Error) => setMessage(e.message),
  });

  const reveal = useMutation({
    mutationFn: (id: string) => revealProviderPassword({ data: { id, adminPassword } }),
    onSuccess: (res, id) => {
      setRevealed((r) => ({ ...r, [id]: res.password }));
      setRevealFor(null);
      setAdminPassword('');
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const sections = (p: Probe) =>
    [
      p.live > 0 ? 'Direct' : null,
      p.vod > 0 ? 'Movies' : null,
      p.series > 0 ? 'Series' : null,
      p.archive ? 'Replay' : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'none';

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Providers</h1>
      {message && <p className="mb-4 text-sm text-accent">{message}</p>}

      <Panel
        title={form.id ? 'Edit provider' : 'Add provider'}
        description="Credentials are stored server-side and never sent to viewers."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="min-h-11" />
          </div>
          <div className="space-y-2">
            <Label>Slug (optional)</Label>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="min-h-11" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Source type</Label>
            <div className="flex gap-2">
              {(['xtream', 'm3u'] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  className="min-h-11"
                  variant={form.type === t ? 'default' : 'secondary'}
                  onClick={() => setForm({ ...form, type: t })}
                >
                  {t === 'xtream' ? 'Xtream (Live TV)' : 'M3U playlist (IPTV)'}
                </Button>
              ))}
            </div>
          </div>

          {form.type === 'm3u' && (
            <div className="space-y-2 md:col-span-2">
              <Label>Playlist URL</Label>
              <Input
                placeholder="https://raw.githubusercontent.com/user/repo/main/playlist.m3u"
                value={form.playlist_url}
                onChange={(e) => setForm({ ...form, playlist_url: e.target.value })}
                className="min-h-11 font-mono"
              />
            </div>
          )}

          <div className={`space-y-2 md:col-span-2 ${form.type === 'm3u' ? 'hidden' : ''}`}>
            <Label>Base URL</Label>
            <Input
              placeholder="http://line.example.com:8080"
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              className="min-h-11 font-mono"
            />
          </div>
          <div className={`space-y-2 ${form.type === 'm3u' ? 'hidden' : ''}`}>
            <Label>Username</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="min-h-11 font-mono" />
          </div>
          <div className={`space-y-2 ${form.type === 'm3u' ? 'hidden' : ''}`}>
            <Label>{form.id ? 'Password (leave blank to keep)' : 'Password'}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="min-h-11 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>Sort order</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              className="min-h-11"
            />
          </div>
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_public} onCheckedChange={(v) => setForm({ ...form, is_public: v })} />
              Available to all users
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button className="min-h-11" disabled={save.isPending} onClick={() => save.mutate()}>
            {form.id ? 'Save changes' : 'Add provider'}
          </Button>
          {form.type === 'xtream' && (
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={test.isPending}
              onClick={() => test.mutate({})}
            >
              Test connection
            </Button>
          )}
          {form.type === 'm3u' && form.id && (
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate(form.id as string)}
            >
              Refresh playlist
            </Button>
          )}
          {form.id && (
            <Button variant="ghost" className="min-h-11" onClick={() => setForm(emptyForm)}>
              Cancel
            </Button>
          )}
        </div>

        {probes['form'] && (
          <p className={`mt-3 text-sm ${probes['form'].ok ? 'text-accent' : 'text-destructive'}`}>
            {probes['form'].message} — {probes['form'].live} channels, {probes['form'].vod} movies,{' '}
            {probes['form'].series} series · sections: {sections(probes['form'])}
          </p>
        )}
      </Panel>

      <Panel title="Configured providers">
        {providers.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-3">
            {(providers.data ?? []).map((p) => {
              const probe = probes[p.id];
              return (
                <div key={p.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {p.name}{' '}
                        <span className="text-xs text-muted-foreground">({p.slug})</span>
                      </p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {p.type === 'm3u' ? 'IPTV · M3U playlist' : 'Live TV · Xtream'}
                      </p>
                      {p.type === 'm3u' ? (
                        <>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {p.playlist_url}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {p.playlist
                              ? `${p.playlist.channelCount} channels · ${p.playlist.categoryCount} categories · refreshed ${new Date(p.playlist.fetchedAt).toLocaleString()}`
                              : 'not parsed yet'}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {p.base_url}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {p.username} / {revealed[p.id] ?? p.passwordMasked}
                          </p>
                        </>
                      )}
                      <p className="mt-1 text-xs">
                        <span className={p.is_active ? 'text-accent' : 'text-muted-foreground'}>
                          {p.is_active ? 'active' : 'inactive'}
                        </span>
                        {' · '}
                        {p.is_public ? 'all users' : 'granted users only'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {p.type === 'xtream' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="min-h-11"
                          onClick={() => test.mutate({ id: p.id })}
                        >
                          Test
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="min-h-11"
                          disabled={refresh.isPending}
                          onClick={() => refresh.mutate(p.id)}
                        >
                          Refresh playlist
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11"
                        onClick={() =>
                          setForm({
                            id: p.id,
                            type: p.type,
                            name: p.name,
                            slug: p.slug,
                            base_url: p.base_url,
                            username: p.username,
                            password: '',
                            playlist_url: p.playlist_url,
                            is_active: p.is_active,
                            is_public: p.is_public,
                            sort_order: p.sort_order,
                          })
                        }
                      >
                        Edit
                      </Button>
                      {p.type === 'xtream' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="min-h-11"
                          onClick={() => setRevealFor(revealFor === p.id ? null : p.id)}
                        >
                          Reveal
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="min-h-11"
                        onClick={() => {
                          if (confirm(`Delete provider "${p.name}"?`)) del.mutate(p.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {revealFor === p.id && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Confirm with your own password</Label>
                        <Input
                          type="password"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          className="min-h-11 w-56"
                        />
                      </div>
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={reveal.isPending}
                        onClick={() => reveal.mutate(p.id)}
                      >
                        Reveal password
                      </Button>
                    </div>
                  )}

                  {probe && (
                    <p className={`mt-3 text-sm ${probe.ok ? 'text-accent' : 'text-destructive'}`}>
                      {probe.message} — {probe.live} channels, {probe.vod} movies, {probe.series} series
                      {probe.expires ? ` · expires ${probe.expires}` : ''} · sections: {sections(probe)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
