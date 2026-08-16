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

  const role = await readRole(userId);
  const suspended = Boolean(existing?.is_suspended);

  if (recordLogin && !suspended) {
    await supabaseAdmin
      .from('profiles')
      .update({ last_login_at: new Date().toISOString(), email })
      .eq('id', userId);
    await supabaseAdmin.from('login_activity').insert({
      user_id: userId,
      email,
      user_agent: (userAgent ?? '').slice(0, 300) || null,
    });
  }

  return {
    userId,
    email,
    displayName: existing?.display_name ?? email.split('@')[0] ?? 'Viewer',
    role,
    suspended,
  };
}
