import { createServerFn } from '@tanstack/react-start';

/**
 * Public provider-portal endpoints.
 *
 * These are deliberately unauthenticated: a provider proves who they are with
 * the secret link key alone. Every call re-validates that key server-side, and
 * nothing here reveals provider credentials, relay details or viewer data.
 */

export const getPortalInvite = createServerFn({ method: 'POST' })
  .inputValidator((input: { token: string }) => ({ token: String(input.token ?? '').trim() }))
  .handler(async ({ data }) => {
    const { loadInvite, listInviteSubmissions } = await import('@/lib/portal.server');
    const invite = await loadInvite(data.token);
    if (!invite) return { valid: false as const };
    return {
      valid: true as const,
      providerName: invite.providerName,
      label: invite.label,
      note: invite.note,
      expiresAt: invite.expiresAt,
      submissions: await listInviteSubmissions(invite.id),
    };
  });

export const submitProviderChannels = createServerFn({ method: 'POST' })
  .inputValidator((input: { token: string; contact?: string; note?: string; playlist: string }) => ({
    token: String(input.token ?? '').trim(),
    contact: String(input.contact ?? '').slice(0, 200),
    note: String(input.note ?? '').slice(0, 1000),
    playlist: String(input.playlist ?? ''),
  }))
  .handler(async ({ data }) => {
    const { loadInvite, recordSubmission } = await import('@/lib/portal.server');
    const invite = await loadInvite(data.token);
    if (!invite) throw new Error('This link is no longer valid. Ask Andam for a new one.');
    const result = await recordSubmission({
      invite,
      contact: data.contact,
      note: data.note,
      playlist: data.playlist,
    });
    return { ok: true as const, channelCount: result.channelCount };
  });
