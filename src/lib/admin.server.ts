/**
 * Server-only helpers for the CEO admin panel.
 *
 * Every exported helper assumes the caller has already been authenticated by
 * `requireSupabaseAuth`. Role verification happens here, against the database,
 * so a client-side "isAdmin" flag can never grant access.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { Database } from '@/integrations/supabase/types';
import { playerApi, type Source } from '@/lib/xtream';

export { supabaseAdmin };

type UserClient = SupabaseClient<Database>;

/** Throws unless the signed-in caller holds the `admin` role in the database. */
export async function assertAdmin(supabase: UserClient, userId: string): Promise<void> {
  const { data, error } = await supabase.rpc('has_role', {
    _user_id: userId,
    _role: 'admin',
  });
  if (error) throw new Error('Role check failed');
  if (data !== true) throw new Error('Forbidden: admin role required');
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '•'.repeat(value.length);
  return `${'•'.repeat(Math.max(4, value.length - 2))}${value.slice(-2)}`;
}

/** Re-authenticates the admin with their own password before revealing secrets. */
export async function verifyOwnPassword(email: string, password: string): Promise<boolean> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return false;
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.ok;
}

export type ProviderProbe = {
  ok: boolean;
  message: string;
  live: number;
  vod: number;
  series: number;
  archive: boolean;
  expires?: string;
};

/** Pings player_api.php and counts what each of the four sections would show. */
export async function probeProvider(source: Source): Promise<ProviderProbe> {
  try {
    const info = await playerApi<{
      user_info?: { auth?: number; status?: string; exp_date?: string | number };
    }>(source, {});
    if (info.user_info && info.user_info.auth === 0) {
      return { ok: false, message: 'Credentials rejected by provider', live: 0, vod: 0, series: 0, archive: false };
    }

    const [live, vod, series] = await Promise.all([
      playerApi<Array<{ tv_archive?: number | string }>>(source, { action: 'get_live_streams' }).catch(() => []),
      playerApi<unknown[]>(source, { action: 'get_vod_streams' }).catch(() => []),
      playerApi<unknown[]>(source, { action: 'get_series' }).catch(() => []),
    ]);

    const liveList = Array.isArray(live) ? live : [];
    const exp = info.user_info?.exp_date;
    return {
      ok: true,
      message: info.user_info?.status ? `Account status: ${info.user_info.status}` : 'Connection successful',
      live: liveList.length,
      vod: Array.isArray(vod) ? vod.length : 0,
      series: Array.isArray(series) ? series.length : 0,
      archive: liveList.some((s) => Number(s.tv_archive) === 1),
      ...(exp ? { expires: new Date(Number(exp) * 1000).toISOString().slice(0, 10) } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Connection failed',
      live: 0,
      vod: 0,
      series: 0,
      archive: false,
    };
  }
}

/** Relay proxy health check used by the monitoring dashboard. */
export async function relayHealth(): Promise<{ ok: boolean; status: number; detail: string; ms: number }> {
  const started = Date.now();
  try {
    const res = await fetch('https://relay.andam.uk:8443/health', {
      headers: { 'X-Relay-Token': process.env['RELAY_TOKEN'] ?? '' },
    });
    const detail = (await res.text()).slice(0, 200);
    return { ok: res.ok, status: res.status, detail, ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      detail: err instanceof Error ? err.message : 'unreachable',
      ms: Date.now() - started,
    };
  }
}
