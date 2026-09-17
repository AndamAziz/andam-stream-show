/**
 * Provider portal (server-only).
 *
 * Each stream provider gets a secret link from the admin panel. Opening it
 * proves who they are — there is no account — and lets them paste their channel
 * list. Submissions are stored untouched and stay invisible to viewers until an
 * admin imports them into Live TV.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { parseM3u } from '@/lib/m3u.server';

export const MAX_PLAYLIST_CHARS = 5_000_000;

export type PortalInvite = {
  id: string;
  sourceId: string;
  providerName: string;
  label: string;
  note: string;
  expiresAt: string | null;
};

export type PortalSubmission = {
  id: string;
  status: string;
  channelCount: number;
  note: string;
  createdAt: string;
  reviewedAt: string | null;
};

const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 40-character random link key; unguessable and safe in a URL. */
export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('');
}

/** Resolves a portal link, or null when it is unknown, revoked or expired. */
export async function loadInvite(token: string): Promise<PortalInvite | null> {
  if (!/^[a-z0-9]{16,64}$/.test(token)) return null;
  const { data, error } = await supabaseAdmin
    .from('provider_invites')
    .select('id, source_id, label, note, expires_at, revoked, sources(name)')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.revoked) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;

  const source = data.sources as { name?: string } | null;
  return {
    id: data.id,
    sourceId: data.source_id,
    providerName: source?.name ?? 'Andam',
    label: data.label ?? '',
    note: data.note ?? '',
    expiresAt: data.expires_at,
  };
}

/** Stores a pasted channel list for admin review. */
export async function recordSubmission(input: {
  invite: PortalInvite;
  contact: string;
  note: string;
  playlist: string;
}): Promise<{ id: string; channelCount: number }> {
  const playlist = input.playlist.trim();
  if (!playlist) throw new Error('Paste your channel list first');
  if (playlist.length > MAX_PLAYLIST_CHARS) {
    throw new Error('That list is too large — please split it into smaller parts');
  }
  const channelCount = parseM3u(playlist).length;
  if (channelCount === 0) {
    throw new Error(
      'No channels found. Use the standard playlist format: an #EXTINF line followed by the stream link.',
    );
  }

  const { data, error } = await supabaseAdmin
    .from('provider_submissions')
    .insert({
      invite_id: input.invite.id,
      source_id: input.invite.sourceId,
      contact: input.contact.slice(0, 200),
      note: input.note.slice(0, 1000),
      playlist,
      channel_count: channelCount,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from('provider_invites')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', input.invite.id);

  return { id: data.id, channelCount };
}

/** Submission history for one portal link, so the provider can track progress. */
export async function listInviteSubmissions(inviteId: string): Promise<PortalSubmission[]> {
  const { data, error } = await supabaseAdmin
    .from('provider_submissions')
    .select('id, status, channel_count, note, created_at, reviewed_at')
    .eq('invite_id', inviteId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    channelCount: r.channel_count,
    note: r.note ?? '',
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
  }));
}
