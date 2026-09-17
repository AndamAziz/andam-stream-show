import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Panel } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  changeProviderInvite,
  createProviderInvite,
  getProviderInvites,
  getProviders,
  getProviderSubmissions,
  importProviderSubmission,
  rejectProviderSubmission,
  removeProviderInvite,
  removeProviderSubmission,
} from '@/lib/admin.functions';

const DESCRIPTION =
  'Send each provider a private link so they can submit their own channel list, then review and import it into Live TV.';

export const Route = createFileRoute('/_authenticated/admin/submissions')({
  head: () => ({
    meta: [
      { title: 'Andam provider portal' },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:title', content: 'Andam provider portal' },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: SubmissionsPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-primary/15 text-primary',
  imported: 'bg-accent/15 text-accent',
  rejected: 'bg-destructive/15 text-destructive',
};

function SubmissionsPage() {
  const qc = useQueryClient();
  const [sourceId, setSourceId] = useState('');
  const [label, setLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const providers = useQuery({ queryKey: ['admin', 'providers'], queryFn: () => getProviders() });
  const invites = useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: () => getProviderInvites(),
  });
  const submissions = useQuery({
    queryKey: ['admin', 'submissions'],
    queryFn: () => getProviderSubmissions({ data: {} }),
  });

  const reload = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['admin', 'invites'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'submissions'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] }),
    ]);
  };

  const portalLink = (token: string) =>
    `${typeof window === 'undefined' ? '' : window.location.origin}/provider-portal?p=${token}`;

  const create = useMutation({
    mutationFn: () =>
      createProviderInvite({
        data: {
          sourceId,
          label,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null,
        },
      }),
    onSuccess: async (res) => {
      setError('');
      setLabel('');
      setExpiresAt('');
      setMessage(`Link created: ${portalLink(res.token)}`);
      await reload();
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggleInvite = useMutation({
    mutationFn: (input: { id: string; revoked: boolean }) => changeProviderInvite({ data: input }),
    onSuccess: reload,
    onError: (e: Error) => setError(e.message),
  });

  const deleteInvite = useMutation({
    mutationFn: (id: string) => removeProviderInvite({ data: { id } }),
    onSuccess: reload,
    onError: (e: Error) => setError(e.message),
  });

  const importOne = useMutation({
    mutationFn: (input: { id: string; replace: boolean }) =>
      importProviderSubmission({ data: input }),
    onSuccess: async (res) => {
      setError('');
      setMessage(`Imported — Live TV now has ${res.channelCount} channels in ${res.groupCount} groups.`);
      await reload();
    },
    onError: (e: Error) => setError(e.message),
  });

  const rejectOne = useMutation({
    mutationFn: (id: string) => rejectProviderSubmission({ data: { id } }),
    onSuccess: reload,
    onError: (e: Error) => setError(e.message),
  });

  const deleteOne = useMutation({
    mutationFn: (id: string) => removeProviderSubmission({ data: { id } }),
    onSuccess: reload,
    onError: (e: Error) => setError(e.message),
  });

  const busy = importOne.isPending || rejectOne.isPending || deleteOne.isPending;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Provider portal</h1>
        <p className="text-sm text-muted-foreground">{DESCRIPTION}</p>
      </header>

      {message && (
        <p className="mb-4 break-all rounded-md bg-accent/15 px-3 py-2 text-sm text-accent">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Panel title="New portal link" description="The provider needs no account — only this link.">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label htmlFor="inv-source">Provider</Label>
            <select
              id="inv-source"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">Select…</option>
              {(providers.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="inv-label">Label</Label>
            <Input
              id="inv-label"
              value={label}
              placeholder="Contact name"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="inv-exp">Expires</Label>
            <Input
              id="inv-exp"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="min-h-11 w-full"
              disabled={!sourceId || create.isPending}
              onClick={() => {
                setMessage('');
                create.mutate();
              }}
            >
              Create link
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Portal links">
        {invites.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : invites.data && invites.data.length > 0 ? (
          <ul className="space-y-3">
            {invites.data.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {inv.sourceName}
                    {inv.label && <span className="text-muted-foreground"> · {inv.label}</span>}
                  </p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {portalLink(inv.token)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {inv.revoked ? 'Revoked' : 'Active'}
                    {inv.expiresAt ? ` · expires ${inv.expiresAt.slice(0, 10)}` : ''}
                    {inv.lastUsedAt ? ` · last used ${inv.lastUsedAt.slice(0, 10)}` : ''}
                    {inv.pending > 0 ? ` · ${inv.pending} waiting for review` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11"
                    onClick={() => navigator.clipboard?.writeText(portalLink(inv.token))}
                  >
                    Copy link
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11"
                    onClick={() => toggleInvite.mutate({ id: inv.id, revoked: !inv.revoked })}
                  >
                    {inv.revoked ? 'Re-enable' : 'Revoke'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    onClick={() => {
                      if (!confirm('Delete this portal link?')) return;
                      deleteInvite.mutate(inv.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No portal links yet.</p>
        )}
      </Panel>

      <Panel title="Submitted lists" description="Nothing goes live until you import it.">
        {submissions.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : submissions.data && submissions.data.length > 0 ? (
          <ul className="space-y-3">
            {submissions.data.map((sub) => (
              <li key={sub.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {sub.sourceName}
                      {sub.inviteLabel && (
                        <span className="text-muted-foreground"> · {sub.inviteLabel}</span>
                      )}
                      <span
                        className={`ml-2 rounded px-2 py-0.5 text-xs ${STATUS_STYLES[sub.status] ?? 'bg-secondary text-muted-foreground'}`}
                      >
                        {sub.status}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {sub.channelCount} channels · sent {sub.createdAt.slice(0, 10)}
                      {sub.contact ? ` · ${sub.contact}` : ''}
                    </p>
                    {sub.preview.length > 0 && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {sub.preview.join(' · ')}
                      </p>
                    )}
                    {sub.note && <p className="mt-1 text-xs text-muted-foreground">{sub.note}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sub.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() => {
                            setMessage('');
                            importOne.mutate({ id: sub.id, replace: true });
                          }}
                        >
                          Import (replace)
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() => {
                            setMessage('');
                            importOne.mutate({ id: sub.id, replace: false });
                          }}
                        >
                          Add to list
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() => rejectOne.mutate(sub.id)}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm('Delete this submission?')) return;
                        deleteOne.mutate(sub.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No lists submitted yet.</p>
        )}
      </Panel>
    </>
  );
}
