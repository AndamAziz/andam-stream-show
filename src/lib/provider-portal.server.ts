/**
 * Admin-side operations for provider credentials, portal links and submissions.
 *
 * Callers must already have passed `assertAdmin`; these helpers run with the
 * service role.
 */
import { supabaseAdmin, maskSecret } from '@/lib/admin.server';
import {
  clearLiveChannels,
  countLiveChannels,
  refreshLiveFromProvider,
  writeLiveChannels,
} from '@/lib/live-channels.server';
import { newInviteToken } from '@/lib/portal.server';
import { relayConfig, type Source } from '@/lib/xtream';

export type CredentialRow = {
  id: string;
  slug: string;
  name: string;
  type: 'xtream' | 'm3u';
  base_url: string;
  username: string;
  passwordMasked: string;
  playlist_url: string;
  relay_url: string;
  relay_token: string;
  relayTokenMasked: string;
  /** The relay actually used for this provider, after falling back to the shared one. */
  effectiveRelay: string;
  usesSharedRelay: boolean;
  curatedChannels: number;
};

export type InviteRow = {
  id: string;
  sourceId: string;
  sourceName: string;
  label: string;
  token: string;
  note: string;
  expiresAt: string | null;
  revoked: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  pending: number;
};

export type SubmissionRow = {
  id: string;
  sourceId: string;
  sourceName: string;
  inviteLabel: string;
  contact: string;
  note: string;
  channelCount: number;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  /** First few channel names, so an admin can sanity-check before importing. */
  preview: string[];
};

/* ------------------------- Provider credentials ------------------------- */

export async function listCredentials(): Promise<CredentialRow[]> {
  const { data, error } = await supabaseAdmin
    .from('sources')
    .select(
      'id, slug, name, type, base_url, username, password, playlist_url, relay_url, relay_token',
    )
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);

  const shared = relayConfig();
  return Promise.all(
    (data ?? []).map(async (s) => {
      const relay = relayConfig({ relay_url: s.relay_url, relay_token: s.relay_token });
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        type: (s.type === 'm3u' ? 'm3u' : 'xtream') as 'xtream' | 'm3u',
        base_url: s.base_url ?? '',
        username: s.username ?? '',
        passwordMasked: maskSecret(s.password ?? ''),
        playlist_url: s.playlist_url ?? '',
        relay_url: s.relay_url ?? '',
        relay_token: '',
        relayTokenMasked: maskSecret(s.relay_token ?? ''),
        effectiveRelay: relay.base,
        usesSharedRelay: relay.base === shared.base && relay.token === shared.token,
        // Only Xtream providers keep a curated Live TV list; the playlist rows of
        // an M3U provider belong to IPTV and must never be counted or cleared here.
        curatedChannels: s.type === 'm3u' ? 0 : await countLiveChannels(s.id),
      };
    }),
  );
}

/** Saves (or clears) the relay address and token stored against one provider. */
export async function saveCredentials(input: {
  id: string;
  relayUrl: string;
  relayToken?: string | undefined;
  clearToken?: boolean | undefined;
}): Promise<{ ok: true }> {
  const relayUrl = input.relayUrl.trim();
  if (relayUrl && !/^https?:\/\//i.test(relayUrl)) {
    throw new Error('Relay address must start with http:// or https://');
  }

  const patch: { relay_url: string | null; relay_token?: string | null } = {
    relay_url: relayUrl || null,
  };
  if (input.clearToken) patch.relay_token = null;
  else if (input.relayToken && input.relayToken.trim()) patch.relay_token = input.relayToken.trim();

  const { error } = await supabaseAdmin.from('sources').update(patch).eq('id', input.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function loadSource(id: string): Promise<Source & { type: string; name: string }> {
  const { data, error } = await supabaseAdmin
    .from('sources')
    .select('id, slug, name, type, base_url, username, password, relay_url, relay_token')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    type: data.type,
    base_url: data.base_url ?? '',
    username: data.username ?? '',
    password: data.password ?? '',
    relay_url: data.relay_url,
    relay_token: data.relay_token,
  };
}

/** Rebuilds a provider's Live TV channel list from its stored credentials. */
export async function rebuildLiveChannels(
  id: string,
): Promise<{ channelCount: number; groupCount: number }> {
  const source = await loadSource(id);
  if (source.type !== 'xtream') {
    throw new Error('Only Xtream providers can be rebuilt from stored credentials');
  }
  if (!source.base_url || !source.username || !source.password) {
    throw new Error('This provider is missing its server address, username or password');
  }
  return refreshLiveFromProvider(source);
}

/** Drops the curated list so Live TV reads straight from the provider again. */
export async function resetLiveChannels(id: string): Promise<{ ok: true }> {
  const source = await loadSource(id);
  if (source.type === 'm3u') {
    throw new Error('This is an IPTV playlist provider — refresh it from the Providers page instead');
  }
  await clearLiveChannels(id);
  return { ok: true };
}

/* ----------------------------- Portal links ----------------------------- */

export async function listInvites(): Promise<InviteRow[]> {
  const [{ data, error }, { data: subs }] = await Promise.all([
    supabaseAdmin
      .from('provider_invites')
      .select(
        'id, source_id, label, token, note, expires_at, revoked, last_used_at, created_at, sources(name)',
      )
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('provider_submissions').select('invite_id, status').eq('status', 'pending'),
  ]);
  if (error) throw new Error(error.message);

  const pending = new Map<string, number>();
  for (const row of subs ?? []) {
    if (row.invite_id) pending.set(row.invite_id, (pending.get(row.invite_id) ?? 0) + 1);
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceName: (r.sources as { name?: string } | null)?.name ?? '',
    label: r.label ?? '',
    token: r.token,
    note: r.note ?? '',
    expiresAt: r.expires_at,
    revoked: r.revoked,
    lastUsedAt: r.last_used_at,
    createdAt: r.created_at,
    pending: pending.get(r.id) ?? 0,
  }));
}

export async function createInvite(input: {
  sourceId: string;
  label: string;
  note: string;
  expiresAt: string | null;
  createdBy: string;
}): Promise<{ token: string }> {
  if (!input.sourceId) throw new Error('Pick the provider this link belongs to');
  const token = newInviteToken();
  const { error } = await supabaseAdmin.from('provider_invites').insert({
    source_id: input.sourceId,
    label: input.label.trim().slice(0, 120),
    note: input.note.trim().slice(0, 1000),
    expires_at: input.expiresAt,
    token,
    created_by: input.createdBy,
  });
  if (error) throw new Error(error.message);
  return { token };
}

export async function setInviteRevoked(id: string, revoked: boolean): Promise<{ ok: true }> {
  const { error } = await supabaseAdmin.from('provider_invites').update({ revoked }).eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteInvite(id: string): Promise<{ ok: true }> {
  const { error } = await supabaseAdmin.from('provider_invites').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ----------------------------- Submissions ----------------------------- */

export async function listSubmissions(status?: string): Promise<SubmissionRow[]> {
  let query = supabaseAdmin
    .from('provider_submissions')
    .select(
      'id, source_id, contact, note, channel_count, status, created_at, reviewed_at, playlist, sources(name), provider_invites(label)',
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const { parseM3u } = await import('@/lib/m3u.server');
  return (data ?? []).map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceName: (r.sources as { name?: string } | null)?.name ?? '',
    inviteLabel: (r.provider_invites as { label?: string } | null)?.label ?? '',
    contact: r.contact ?? '',
    note: r.note ?? '',
    channelCount: r.channel_count,
    status: r.status,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
    // Parse only the head of the list: full lists can be megabytes.
    preview: parseM3u((r.playlist ?? '').slice(0, 20_000))
      .slice(0, 6)
      .map((c) => c.name),
  }));
}

/**
 * Imports a submitted list into Live TV.
 *
 * `replace` swaps the provider's whole curated list; otherwise the submitted
 * channels are appended after the ones already there.
 */
export async function importSubmission(input: {
  id: string;
  adminId: string;
  replace: boolean;
}): Promise<{ channelCount: number; groupCount: number }> {
  const { data, error } = await supabaseAdmin
    .from('provider_submissions')
    .select('id, source_id, playlist, status')
    .eq('id', input.id)
    .single();
  if (error) throw new Error(error.message);

  const { parseM3u } = await import('@/lib/m3u.server');
  const parsed = parseM3u(data.playlist ?? '');
  if (parsed.length === 0) throw new Error('This submission contains no readable channels');

  const { listLiveChannels } = await import('@/lib/live-channels.server');
  const existing = input.replace ? [] : await listLiveChannels(data.source_id);
  const offset = existing.length;

  const incoming = parsed.map((c, i) => ({
    key: `s${input.id.slice(0, 8)}-${i + 1}`,
    num: offset + i + 1,
    name: c.name,
    logo: c.logo,
    group: c.group,
    url: c.url,
    mediaKind: 'auto',
  }));

  const channelCount = await writeLiveChannels(data.source_id, [...existing, ...incoming]);

  const { error: markError } = await supabaseAdmin
    .from('provider_submissions')
    .update({
      status: 'imported',
      reviewed_by: input.adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', input.id);
  if (markError) throw new Error(markError.message);

  return {
    channelCount,
    groupCount: new Set([...existing, ...incoming].map((c) => c.group)).size,
  };
}

export async function rejectSubmission(id: string, adminId: string): Promise<{ ok: true }> {
  const { error } = await supabaseAdmin
    .from('provider_submissions')
    .update({ status: 'rejected', reviewed_by: adminId, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteSubmission(id: string): Promise<{ ok: true }> {
  const { error } = await supabaseAdmin.from('provider_submissions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
