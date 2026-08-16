import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Bootstraps the profile/role rows and returns the caller's account state. */
export const syncMyAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { recordLogin?: boolean }) => ({
    recordLogin: Boolean(input?.recordLogin),
  }))
  .handler(async ({ data, context }) => {
    const { syncAccount } = await import('@/lib/account.server');
    const email = typeof context.claims['email'] === 'string' ? context.claims['email'] : '';
    return syncAccount(
      context.userId,
      email,
      getRequestHeader('user-agent') ?? null,
      data.recordLogin,
    );
  });
