import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getPortalInvite, submitProviderChannels } from '@/lib/portal.functions';

const DESCRIPTION =
  'Stream providers submit their own channel playlist to Andam through a private link — no account needed.';

type Search = { p?: string };

export const Route = createFileRoute('/provider-portal')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    p: typeof search['p'] === 'string' ? search['p'] : undefined,
  }),
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
  component: PortalPage,
});

function PortalPage() {
  const { p: token } = Route.useSearch();
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [playlist, setPlaylist] = useState('');
  const [sent, setSent] = useState(0);
  const [error, setError] = useState('');

  const invite = useQuery({
    queryKey: ['portal', token],
    queryFn: () => getPortalInvite({ data: { token: token ?? '' } }),
    enabled: Boolean(token),
    retry: false,
  });

  const submit = useMutation({
    mutationFn: () =>
      submitProviderChannels({ data: { token: token ?? '', contact, note, playlist } }),
    onSuccess: async (res) => {
      setError('');
      setPlaylist('');
      setNote('');
      setSent(res.channelCount);
      await invite.refetch();
    },
    onError: (e: Error) => setError(e.message),
  });

  const shell = (children: React.ReactNode) => (
    <div className="dark min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-2xl font-bold tracking-tight text-primary">ANDAM</p>
        {children}
      </div>
    </div>
  );

  if (!token || (invite.isFetched && !invite.data?.valid)) {
    return shell(
      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">This link is not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask Andam for a new submission link.
        </p>
      </div>,
    );
  }

  if (!invite.data?.valid) {
    return shell(<p className="mt-8 text-sm text-muted-foreground">Loading…</p>);
  }

  const data = invite.data;

  return shell(
    <>
      <header className="mt-6">
        <h1 className="text-2xl font-semibold">Submit your channel list</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.providerName}
          {data.label ? ` · ${data.label}` : ''}
          {data.expiresAt ? ` · link valid until ${data.expiresAt.slice(0, 10)}` : ''}
        </p>
        {data.note && <p className="mt-2 text-sm text-muted-foreground">{data.note}</p>}
      </header>

      {sent > 0 && (
        <p className="mt-4 rounded-md bg-accent/15 px-3 py-2 text-sm text-accent">
          Thank you — {sent} channels received. Andam will review them before they go live.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-4 md:p-6">
        <div>
          <Label htmlFor="contact">Your name or email (optional)</Label>
          <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="playlist">Playlist</Label>
          <Textarea
            id="playlist"
            className="min-h-64 font-mono text-xs"
            placeholder={'#EXTM3U\n#EXTINF:-1 tvg-logo="..." group-title="Sport",Channel name\nhttp://...'}
            value={playlist}
            onChange={(e) => setPlaylist(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Paste the whole M3U playlist text, including the channel links.
          </p>
        </div>
        <Button
          className="min-h-11 w-full"
          disabled={playlist.trim().length < 10 || submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? 'Sending…' : 'Send list'}
        </Button>
      </div>

      {data.submissions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your previous submissions
          </h2>
          <ul className="mt-3 space-y-2">
            {data.submissions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm"
              >
                <span>
                  {s.channelCount} channels · {s.createdAt.slice(0, 10)}
                </span>
                <span className="text-muted-foreground">{s.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>,
  );
}
