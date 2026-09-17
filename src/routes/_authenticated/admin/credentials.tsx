import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Panel } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getProviderCredentials,
  rebuildLiveChannels,
  resetLiveChannels,
  saveProviderCredentials,
} from '@/lib/admin.functions';

const DESCRIPTION =
  'Store each stream provider relay address and token, then rebuild the Live TV channel list from those saved values.';

export const Route = createFileRoute('/_authenticated/admin/credentials')({
  head: () => ({
    meta: [
      { title: 'Andam provider credentials' },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:title', content: 'Andam provider credentials' },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: CredentialsPage,
});

function CredentialsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string>('');
  const [relayUrl, setRelayUrl] = useState('');
  const [relayToken, setRelayToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const rows = useQuery({
    queryKey: ['admin', 'credentials'],
    queryFn: () => getProviderCredentials(),
  });

  const reload = () => qc.invalidateQueries({ queryKey: ['admin', 'credentials'] });

  const save = useMutation({
    mutationFn: (input: { id: string; relayUrl: string; relayToken: string; clearToken: boolean }) =>
      saveProviderCredentials({
        data: {
          id: input.id,
          relayUrl: input.relayUrl,
          relayToken: input.relayToken,
          clearToken: input.clearToken,
        },
      }),
    onSuccess: async () => {
      setEditing('');
      setRelayToken('');
      setError('');
      setMessage('Saved.');
      await reload();
    },
    onError: (e: Error) => setError(e.message),
  });

  const rebuild = useMutation({
    mutationFn: (id: string) => rebuildLiveChannels({ data: { id } }),
    onSuccess: async (res) => {
      setError('');
      setMessage(`Rebuilt ${res.channelCount} channels in ${res.groupCount} groups.`);
      await reload();
    },
    onError: (e: Error) => setError(e.message),
  });

  const reset = useMutation({
    mutationFn: (id: string) => resetLiveChannels({ data: { id } }),
    onSuccess: async () => {
      setError('');
      setMessage('Stored channel list cleared — Live TV reads the provider directly again.');
      await reload();
    },
    onError: (e: Error) => setError(e.message),
  });

  const busy = save.isPending || rebuild.isPending || reset.isPending;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Provider credentials</h1>
        <p className="text-sm text-muted-foreground">{DESCRIPTION}</p>
      </header>

      {message && (
        <p className="mb-4 rounded-md bg-accent/15 px-3 py-2 text-sm text-accent">{message}</p>
      )}
      {error && (
        <p className="mb-4 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Panel title="Streams" description="One row per provider. Blank relay values use the shared relay.">
        {rows.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : rows.data && rows.data.length > 0 ? (
          <ul className="space-y-3">
            {rows.data.map((row) => (
              <li key={row.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {row.name}{' '}
                      <span className="text-xs uppercase text-muted-foreground">{row.type}</span>
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {row.type === 'm3u' ? row.playlist_url : row.base_url}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Relay: {row.effectiveRelay}
                      {row.usesSharedRelay ? ' (shared)' : ' (own)'} · Token:{' '}
                      {row.relayTokenMasked || 'shared'} · Stored channels: {row.curatedChannels}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => {
                        setMessage('');
                        setError('');
                        setEditing(editing === row.id ? '' : row.id);
                        setRelayUrl(row.relay_url);
                        setRelayToken('');
                      }}
                    >
                      {editing === row.id ? 'Close' : 'Edit relay'}
                    </Button>
                    {row.type === 'xtream' && (
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => {
                          setMessage('');
                          rebuild.mutate(row.id);
                        }}
                      >
                        Refresh channels
                      </Button>
                    )}
                    {row.curatedChannels > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm(`Clear the stored channel list for ${row.name}?`)) return;
                          setMessage('');
                          reset.mutate(row.id);
                        }}
                      >
                        Clear list
                      </Button>
                    )}
                  </div>
                </div>

                {editing === row.id && (
                  <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor={`relay-${row.id}`}>Relay address</Label>
                      <Input
                        id={`relay-${row.id}`}
                        value={relayUrl}
                        placeholder="https://relay.example.com:8443/proxy"
                        onChange={(e) => setRelayUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`token-${row.id}`}>Relay token</Label>
                      <Input
                        id={`token-${row.id}`}
                        value={relayToken}
                        placeholder="Leave blank to keep the current token"
                        onChange={(e) => setRelayToken(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2 md:col-span-2">
                      <Button
                        className="min-h-11"
                        disabled={busy}
                        onClick={() =>
                          save.mutate({
                            id: row.id,
                            relayUrl,
                            relayToken,
                            clearToken: false,
                          })
                        }
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() =>
                          save.mutate({ id: row.id, relayUrl: '', relayToken: '', clearToken: true })
                        }
                      >
                        Use shared relay
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No providers yet.</p>
        )}
      </Panel>
    </>
  );
}
