/**
 * Lightweight up/down health checks for Live TV and IPTV sources.
 *
 * Used by the source switchers to show a status badge. Checks are cheap and
 * time-boxed: an Xtream source is probed with a bare player_api.php call, a
 * playlist source with a ranged GET of its playlist URL. Results are cached in
 * memory for a short while so switching pages does not hammer providers.
 */
import { playerApi, type Source } from '@/lib/xtream';
import type { PlaylistSource } from '@/lib/m3u.server';

export type SourceHealth = {
  /** Source slug, matching what the public APIs expose as `id`. */
  id: string;
  status: 'up' | 'down';
  /** Short, non-sensitive explanation shown on hover. */
  detail: string;
  /** Round-trip time of the probe, in milliseconds. */
  ms: number;
  checkedAt: string;
};

const TIMEOUT_MS = 6000;
const CACHE_MS = 60_000;

const cache = new Map<string, { value: SourceHealth; at: number }>();

const withTimeout = async <T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

async function cached(key: string, probe: () => Promise<SourceHealth>): Promise<SourceHealth> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await probe();
  cache.set(key, { value, at: Date.now() });
  return value;
}

function reason(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Connection failed';
  return /abort/i.test(message) ? 'Timed out' : message;
}

/** Probes one Xtream provider. Never throws. */
async function checkXtream(source: Source): Promise<SourceHealth> {
  const started = Date.now();
  const base = { id: source.slug, checkedAt: new Date().toISOString() };
  try {
    const info = await withTimeout(() =>
      playerApi<{ user_info?: { auth?: number; status?: string } }>(source, {}),
    );
    const ms = Date.now() - started;
    if (info.user_info && Number(info.user_info.auth) === 0) {
      return { ...base, status: 'down', detail: 'Credentials rejected by provider', ms };
    }
    const status = info.user_info?.status;
    if (status && !/^active$/i.test(status)) {
      return { ...base, status: 'down', detail: `Account status: ${status}`, ms };
    }
    return { ...base, status: 'up', detail: status ? `Active · ${ms} ms` : `Reachable · ${ms} ms`, ms };
  } catch (err) {
    return { ...base, status: 'down', detail: reason(err), ms: Date.now() - started };
  }
}

export async function xtreamHealth(sources: Source[]): Promise<SourceHealth[]> {
  return Promise.all(sources.map((s) => cached(`x:${s.id}`, () => checkXtream(s))));
}

/** Probes one M3U playlist URL with a ranged GET. Never throws. */
async function checkPlaylist(source: PlaylistSource): Promise<SourceHealth> {
  const started = Date.now();
  const base = { id: source.slug, checkedAt: new Date().toISOString() };
  try {
    const res = await withTimeout((signal) =>
      fetch(source.playlist_url, {
        signal,
        headers: {
          'User-Agent': 'AndamTV/1.0',
          Accept: 'audio/x-mpegurl,text/plain,*/*',
          Range: 'bytes=0-2047',
        },
      }),
    );
    const ms = Date.now() - started;
    if (!res.ok && res.status !== 206) {
      return { ...base, status: 'down', detail: `Playlist responded ${res.status}`, ms };
    }
    const head = await res.text();
    if (!/#EXTM3U|#EXTINF/i.test(head)) {
      return { ...base, status: 'down', detail: 'Playlist is not a valid M3U', ms };
    }
    return { ...base, status: 'up', detail: `Playlist reachable · ${ms} ms`, ms };
  } catch (err) {
    return { ...base, status: 'down', detail: reason(err), ms: Date.now() - started };
  }
}

export async function playlistHealth(sources: PlaylistSource[]): Promise<SourceHealth[]> {
  return Promise.all(sources.map((s) => cached(`m:${s.id}`, () => checkPlaylist(s))));
}
