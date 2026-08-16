import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** What the signed-in viewer may open (IPTV is always open). */
export const getMyAccess = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from('user_entitlements')
      .select('section')
      .eq('user_id', context.userId);
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    const sections = [...new Set((data ?? []).map((r) => String(r.section)))];
    return {
      admin: !!isAdmin,
      sections: isAdmin ? ['live', 'movies', 'series'] : sections,
    };
  });

export const redeemMyCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => input)
  .handler(async ({ data, context }) => {
    const { redeemCode } = await import('@/lib/access.server');
    return redeemCode(
      context.userId,
      (context.claims as { email?: string } | null)?.email ?? null,
      data.code,
    );
  });
