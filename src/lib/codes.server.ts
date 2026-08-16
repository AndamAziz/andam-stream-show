/** Server-only activation-code administration (admin role already verified). */
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { SECTIONS, type Section } from '@/lib/access.server';

export type CodeStatus = 'active' | 'used' | 'expired' | 'revoked';

export type AdminCode = {
  id: string;
  code: string;
  sourceId: string | null;
  provider: string;
  sections: Section[];
  note: string;
  expiresAt: string | null;
  maxUses: number;
  uses: number;
  status: CodeStatus;
  createdAt: string;
  redeemedBy: Array<{ email: string; at: string }>;
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

function statusOf(row: {
  revoked: boolean;
  expires_at: string | null;
  uses: number;
  max_uses: number;
}): CodeStatus {
  if (row.revoked) return 'revoked';
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  if (row.uses >= row.max_uses) return 'used';
  return 'active';
}

export async function listCodes(): Promise<AdminCode[]> {
  const [{ data: codes }, { data: sources }, { data: redemptions }] = await Promise.all([
    supabaseAdmin
      .from('activation_codes')
      .select('id, code, source_id, sections, note, expires_at, max_uses, uses, revoked, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin.from('sources').select('id, name'),
    supabaseAdmin
      .from('activation_code_redemptions')
      .select('code_id, email, created_at')
      .order('created_at', { ascending: false }),
  ]);

  const names = new Map((sources ?? []).map((s) => [s.id, s.name]));

  return (codes ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    sourceId: row.source_id,
    provider: row.source_id ? (names.get(row.source_id) ?? 'Unknown provider') : 'All providers',
    sections: (row.sections ?? []).filter((s): s is Section => SECTIONS.includes(s as Section)),
    note: row.note ?? '',
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
    status: statusOf(row),
    createdAt: row.created_at,
    redeemedBy: (redemptions ?? [])
      .filter((r) => r.code_id === row.id)
      .map((r) => ({ email: r.email ?? 'unknown', at: r.created_at })),
  }));
}

export async function createCode(input: {
  createdBy: string;
  sourceId: string | null;
  sections: Section[];
  maxUses: number;
  expiresAt: string | null;
  note: string;
}): Promise<{ code: string }> {
  const sections = input.sections.filter((s) => SECTIONS.includes(s));
  if (!sections.length) throw new Error('Pick at least one section to unlock');

  const code = randomCode();
  const { error } = await supabaseAdmin.from('activation_codes').insert({
    code,
    source_id: input.sourceId,
    sections,
    note: input.note.slice(0, 200) || null,
    max_uses: Math.min(Math.max(1, Math.round(input.maxUses)), 1000),
    expires_at: input.expiresAt,
    created_by: input.createdBy,
  });
  if (error) throw new Error(error.message);
  return { code };
}

/** Unused codes are deleted outright; redeemed ones are revoked to keep history. */
export async function revokeCode(id: string): Promise<{ deleted: boolean }> {
  const { data: row } = await supabaseAdmin
    .from('activation_codes')
    .select('id, uses')
    .eq('id', id)
    .maybeSingle();
  if (!row) return { deleted: false };
  if (row.uses === 0) {
    await supabaseAdmin.from('activation_codes').delete().eq('id', id);
    return { deleted: true };
  }
  await supabaseAdmin.from('activation_codes').update({ revoked: true }).eq('id', id);
  return { deleted: false };
}

/** Manual override so an admin can unlock or re-lock a viewer without a code. */
export async function setEntitlement(
  userId: string,
  section: Section,
  grant: boolean,
): Promise<void> {
  if (grant) {
    await supabaseAdmin
      .from('user_entitlements')
      .upsert(
        { user_id: userId, section, source_id: null },
        { onConflict: 'user_id,section,source_id', ignoreDuplicates: true },
      );
    return;
  }
  await supabaseAdmin.from('user_entitlements').delete().eq('user_id', userId).eq('section', section);
}

export async function listEntitlements(
  userIds: string[],
): Promise<Record<string, Section[]>> {
  if (!userIds.length) return {};
  const { data } = await supabaseAdmin
    .from('user_entitlements')
    .select('user_id, section')
    .in('user_id', userIds);
  const out: Record<string, Section[]> = {};
  for (const row of data ?? []) {
    const section = row.section as Section;
    if (!SECTIONS.includes(section)) continue;
    (out[row.user_id] ??= []).push(section);
  }
  return out;
}
