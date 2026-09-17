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
import { playerApi, relayConfig, relayHeaders, relayUrl, type Source } from '@/lib/xtream';

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

/**
 * Relay proxy health check used by the monitoring dashboard.
 *
 * The relay exposes no `/health` route — asking for one returns nginx's 404 and
 * made a perfectly healthy relay read as FAIL. Instead we exercise the path the
 * player actually uses: a real proxied request to a provider, with that
 * provider's own relay address and token.
 */
export type HealthSource = Source & {
  is_active?: boolean | null;
  type?: string | null;
};

export async function relayHealth(
  sources: HealthSource[] = [],
): Promise<{ ok: boolean; status: number; detail: string; ms: number }> {
  const started = Date.now();
  const source = sources.find(
    (s) => s.is_active && s.type === 'xtream' && Boolean(s.base_url),
  );
  if (!source) {
    return {
      ok: false,
      status: 0,
      detail: 'No active provider to test the relay with.',
      ms: 0,
    };
  }

  const relay = relayConfig(source);
  const upstream = `${source.base_url}/player_api.php?username=${encodeURIComponent(
    source.username ?? '',
  )}&password=${encodeURIComponent(source.password ?? '')}`;

  const ac = new AbortController();
  const guard = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(relayUrl(upstream, relay), {
      headers: { ...relayHeaders(relay), 'User-Agent': 'AndamTV/1.0' },
      redirect: 'follow',
      signal: ac.signal,
    });
    const body = (await res.text()).slice(0, 400);
    const authed = /"auth"\s*:\s*1/.test(body);
    return {
      ok: res.ok && authed,
      status: res.status,
      detail: res.ok
        ? `${source.name}: ${authed ? 'relay reached the provider and the account is active' : 'relay answered but the provider rejected the account'}\n${body}`
        : body || `relay returned HTTP ${res.status}`,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      detail: err instanceof Error ? err.message : 'unreachable',
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(guard);
  }
}
