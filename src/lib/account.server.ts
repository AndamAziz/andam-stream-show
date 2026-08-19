/** Server-only account helpers (profile bootstrap, role lookup, login log). */
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export type Account = {
  userId: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  suspended: boolean;
};

export async function readRole(userId: string): Promise<'admin' | 'user'> {
  const { data } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);
  return (data ?? []).some((r) => r.role === 'admin') ? 'admin' : 'user';
}

/**
 * Creates the profile row + default role on first sight of a user, and returns
 * the authoritative account state. `auth.users` is never modified here.
 */
export async function syncAccount(
  userId: string,
  email: string,
  userAgent: string | null,
  recordLogin: boolean,
  sessionId: string | null = null,
): Promise<Account> {
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id, email, display_name, is_suspended')
    .eq('id', userId)
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from('profiles').insert({
      id: userId,
      email,
      display_name: email.split('@')[0] ?? 'Viewer',
    });
    await supabaseAdmin.from('user_roles').insert({ user_id: userId, role: 'user' });
  }

  const { isOwnerEmail } = await import('@/lib/access.server');
  const owner = isOwnerEmail(email);

  // Platform owners always hold the admin role, even if the row went missing.
  if (owner) {
    await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id,role', ignoreDuplicates: true });
  }

  const role = owner ? 'admin' : await readRole(userId);
  const suspended = owner ? false : Boolean(existing?.is_suspended);

  if (recordLogin && !suspended) {
    await supabaseAdmin
      .from('profiles')
      .update({ last_login_at: new Date().toISOString(), email })
      .eq('id', userId);

    // One row per auth session: background token refreshes and page reloads
    // reuse the same `session_id`, so the unique index de-duplicates them.
    const row = {
      user_id: userId,
      email,
      user_agent: (userAgent ?? '').slice(0, 300) || null,
      session_id: sessionId,
    };
    if (sessionId) {
      await supabaseAdmin
        .from('login_activity')
        .upsert(row, { onConflict: 'user_id,session_id', ignoreDuplicates: true });
    } else {
      // No session claim (older tokens): fall back to a 10-minute quiet window
      // so a re-entered sign-in screen cannot spam the log.
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from('login_activity')
        .select('id')
        .eq('user_id', userId)
        .gte('created_at', since)
        .limit(1);
      if (!(recent ?? []).length) await supabaseAdmin.from('login_activity').insert(row);
    }
  }


  return {
    userId,
    email,
    displayName: existing?.display_name ?? email.split('@')[0] ?? 'Viewer',
    role,
    suspended,
  };
}
