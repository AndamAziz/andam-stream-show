import { createServerFn } from '@tanstack/react-start';

import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { OverrideKind } from '@/lib/overrides.server';

/**
 * Every function here re-checks the caller's `admin` role in the database via
 * `assertAdmin` before touching data. A client flag alone grants nothing.
 */

async function guard(supabase: unknown, userId: string) {
  const { assertAdmin } = await import('@/lib/admin.server');
  await assertAdmin(supabase as never, userId);
  return import('@/lib/admin-ops.server');
}

export const getAdminOverview = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ops = await guard(context.supabase, context.userId);
    return ops.adminOverview();
  });

export const getProviders = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ops = await guard(context.supabase, context.userId);
    return ops.listProviders();
  });

export const upsertProvider = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      type?: 'xtream' | 'm3u';
      name: string;
      slug?: string;
      base_url?: string;
      username?: string;
      password?: string;
      playlist_url?: string;
      is_active: boolean;
      is_public: boolean;
      sort_order: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    return ops.saveProvider(data);
  });

export const removeProvider = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    await ops.deleteProvider(data.id);
    return { ok: true };
  });

export const refreshProviderPlaylist = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    return ops.refreshProviderPlaylist(data.id);
  });

export const testProviderConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { id?: string; base_url?: string; username?: string; password?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    return ops.testProvider(data);
  });

export const revealProviderPassword = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; adminPassword: string }) => input)
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    const email = typeof context.claims['email'] === 'string' ? context.claims['email'] : '';
    if (!email) throw new Error('Could not determine your account email');
    return { password: await ops.revealPassword(email, data.adminPassword, data.id) };
  });

export const getUsers = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ops = await guard(context.supabase, context.userId);
    return ops.listUsers();
  });

export const changeUserRole = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: 'admin' | 'user' }) => input)
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    await ops.setUserRole(context.userId, data.userId, data.role);
    return { ok: true };
  });

export const changeUserSuspension = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; suspended: boolean }) => input)
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    await ops.setUserSuspended(context.userId, data.userId, data.suspended);
    return { ok: true };
  });

export const changeUserAccess = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; sourceId: string; grant: boolean }) => input)
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    await ops.setUserAccess(data.userId, data.sourceId, data.grant);
    return { ok: true };
  });

export const getOverrides = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sourceId: string }) => input)
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    return ops.listOverrides(data.sourceId);
  });

export const saveContentOverride = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      sourceId: string;
      kind: OverrideKind;
      itemId: string;
      label?: string;
      hidden?: boolean;
      sortOrder?: number | null;
      logoUrl?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    await ops.saveOverride(data);
    return { ok: true };
  });

export const clearContentOverride = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sourceId: string; kind: OverrideKind; itemId: string }) => input)
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    await ops.clearOverride(data.sourceId, data.kind, data.itemId);
    return { ok: true };
  });

export const getProviderItems = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { sourceId: string; kind: OverrideKind; categoryId?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const ops = await guard(context.supabase, context.userId);
    return ops.listProviderItems(data.sourceId, data.kind, data.categoryId ?? '');
  });

export const clearLoginActivity = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ops = await guard(context.supabase, context.userId);
    return ops.clearLoginActivity();
  });

export const getFeaturedChannels = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context.supabase, context.userId);
    const { listFeatured } = await import('@/lib/featured.server');
    return listFeatured();
  });

export const saveFeaturedChannel = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pattern: string; sortOrder: number }) => input)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, context.userId);
    const { saveFeatured } = await import('@/lib/featured.server');
    await saveFeatured(data.pattern, data.sortOrder);
    return { ok: true };
  });

export const removeFeaturedChannel = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, context.userId);
    const { removeFeatured } = await import('@/lib/featured.server');
    await removeFeatured(data.id);
    return { ok: true };
  });

/* ---------------- Activation codes ---------------- */

export const getActivationCodes = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context.supabase, context.userId);
    const { listCodes } = await import('@/lib/codes.server');
    return listCodes();
  });

export const createActivationCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      sourceId: string | null;
      sections: Array<'live' | 'movies' | 'series'>;
      maxUses: number;
      expiresAt: string | null;
      note?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await guard(context.supabase, context.userId);
    const { createCode } = await import('@/lib/codes.server');
    return createCode({
      createdBy: context.userId,
      sourceId: data.sourceId,
      sections: data.sections,
      maxUses: data.maxUses,
      expiresAt: data.expiresAt,
      note: data.note ?? '',
    });
  });

export const revokeActivationCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await guard(context.supabase, context.userId);
    const { revokeCode } = await import('@/lib/codes.server');
    return revokeCode(data.id);
  });

export const changeUserSectionAccess = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { userId: string; section: 'live' | 'movies' | 'series'; grant: boolean }) => input,
  )
  .handler(async ({ data, context }) => {
    await guard(context.supabase, context.userId);
    const { setEntitlement } = await import('@/lib/codes.server');
    await setEntitlement(data.userId, data.section, data.grant);
    return { ok: true };
  });
