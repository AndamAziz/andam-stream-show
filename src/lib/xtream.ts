/**
 * Server-side Xtream Codes helpers.
 *
 * Provider credentials live in the `sources` table (service-role only) and are
 * used exclusively here, on the server. Nothing in this module returns a URL
 * that contains a username or password to the browser.
 */

export const RELAY_BASE = 'https://relay.andam.uk:8443/proxy?url=';

export type Source = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  username: string;
  password: string;
};

export type XtreamKind = 'live' | 'vod' | 'series';

export function relayUrl(upstream: string): string {
  return RELAY_BASE + encodeURIComponent(upstream);
}

export function relayHeaders(): Record<string, string> {
  return { 'X-Relay-Token': process.env['RELAY_TOKEN'] ?? DEFAULT_RELAY_TOKEN };
}

/** The relay token shipped with the project; overridable through a secret. */
const DEFAULT_RELAY_TOKEN =
  '009c95e9a8c6e50d992b8313bb90b01948b4a58e870bd69504a640b32306a5da';

function apiUrl(source: Source, params: Record<string, string>): string {
  const base = source.base_url.replace(/\/+$/, '');
  const qs = new URLSearchParams({
    username: source.username,
    password: source.password,
    ...params,
  });
  return `${base}/player_api.php?${qs.toString()}`;
}

/**
 * Calls player_api.php server-side. Never called from the browser.
 *
 * Some panels reject a server IP intermittently (403/429/5xx) while the same
 * request succeeds through the relay, so the direct call is retried once and
 * then repeated through the relay before we report a failure.
 */
export async function playerApi<T>(source: Source, params: Record<string, string>): Promise<T> {
  const target = apiUrl(source, params);
  const attempts: Array<() => Promise<Response>> = [
    () => fetch(target, { headers: { 'User-Agent': 'AndamTV/1.0', Accept: 'application/json' } }),
    () => fetch(target, { headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20', Accept: '*/*' } }),
    () =>
      fetch(relayUrl(target), {
        headers: { ...relayHeaders(), 'User-Agent': 'AndamTV/1.0', Accept: 'application/json' },
        redirect: 'follow',
      }),
  ];

  let lastStatus = 0;
  let lastError = '';
  for (let i = 0; i < attempts.length; i += 1) {
    let res: Response;
    try {
      res = await attempts[i]!();
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'network error';
      continue;
    }
    if (!res.ok) {
      lastStatus = res.status;
      try {
        await res.body?.cancel();
      } catch {
        /* nothing to drain */
      }
      if (i < attempts.length - 1) await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      lastError = 'provider returned a malformed response';
    }
  }
  throw new Error(
    lastStatus ? `provider responded ${lastStatus}` : lastError || 'provider unreachable',
  );
}


export function liveStreamUrl(source: Source, streamId: string | number, ext = 'm3u8'): string {
  const base = source.base_url.replace(/\/+$/, '');
  return `${base}/live/${source.username}/${source.password}/${streamId}.${ext}`;
}

export function vodStreamUrl(source: Source, streamId: string | number, ext = 'mp4'): string {
  const base = source.base_url.replace(/\/+$/, '');
  return `${base}/movie/${source.username}/${source.password}/${streamId}.${ext}`;
}

export function seriesStreamUrl(source: Source, episodeId: string | number, ext = 'mp4'): string {
  const base = source.base_url.replace(/\/+$/, '');
  return `${base}/series/${source.username}/${source.password}/${episodeId}.${ext}`;
}

/** {base}/timeshift/{u}/{p}/{duration}/{yyyy-MM-dd:HH-mm}/{stream_id}.m3u8 */
export function timeshiftUrl(
  source: Source,
  streamId: string | number,
  durationMinutes: number,
  start: string,
): string {
  const base = source.base_url.replace(/\/+$/, '');
  return `${base}/timeshift/${source.username}/${source.password}/${durationMinutes}/${start}/${streamId}.m3u8`;
}
