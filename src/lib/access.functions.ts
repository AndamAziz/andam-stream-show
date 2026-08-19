import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** What the signed-in viewer may open (IPTV is always open). */
export const getMyAccess = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { effectiveSections, isOwnerEmail } = await import('@/lib/access.server');
    // Platform owners are never gated.
    if (isOwnerEmail((context.claims as { email?: string } | null)?.email ?? null)) {
      return { admin: true, sections: ['live', 'movies', 'series'] };
    }
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (isAdmin) return { admin: true, sections: ['live', 'movies', 'series'] };
    // Grants tied to an expired/revoked code no longer count.
    return { admin: false, sections: await effectiveSections(context.userId) as string[] };
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
