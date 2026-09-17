import { createFileRoute } from '@tanstack/react-router';
import { openUrl, sealUrl } from '@/lib/xtream-crypto';
import { relayHeaders, relayUrl } from '@/lib/xtream';

/**
 * Playback proxy.
 *
 * Takes an opaque token (from /api/public/xtream), decrypts it into the real
 * provider URL, and streams the bytes through the Andam relay. HLS manifests
 * are rewritten so every segment/variant also arrives as an opaque token, so
 * the browser never sees provider credentials or the relay token.
 *
 * HTTP Range requests are forwarded untouched so VOD seeking keeps working.
 */

const SAFE_HEADERS = [
  'content-type',
  'content-range',
  'content-disposition',
  'last-modified',
  'etag',
];


function isManifest(url: string, contentType: string | null): boolean {
  if (/\.m3u8(\?|$)/i.test(url)) return true;
  const ct = (contentType ?? '').toLowerCase();
  return ct.includes('mpegurl') || ct.includes('vnd.apple.mpegurl');
}
/**
 * Reads a manifest without waiting for the connection to close.
 *
 * Some upstreams (and the relay in front of them) treat a `.m3u8` request as a
 * long-lived stream: they keep the socket open and re-send the playlist over and
 * over. `res.text()` then never resolves and the player spins forever, so read
 * incrementally, stop at the first complete playlist, and cap size/time.
 */
async function readManifest(res: Response): Promise<string> {
  const MAX_BYTES = 2_000_000;
  const MAX_MS = 8000;
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  const started = Date.now();
  let text = '';
  try {
    for (;;) {
      if (Date.now() - started > MAX_MS) break;
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((r) =>
          setTimeout(() => r({ done: true, value: undefined }), Math.max(0, MAX_MS - (Date.now() - started))),
        ),
      ]);
      if (done) break;
      text += decoder.decode(value, { stream: true });
      // A repeated `#EXTM3U` header means the upstream restarted the playlist.
      const repeat = text.indexOf('#EXTM3U', text.indexOf('#EXTM3U') + 1);
      if (repeat > 0) {
        text = text.slice(0, repeat);
        break;
      }
      if (text.includes('#EXT-X-ENDLIST') || text.length > MAX_BYTES) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* upstream already gone */
    }
  }
  return text;
}


/**
 * Fetch provider bytes through the configured relay only.
 *
 * A dead upstream (expired provider account, blackholed host) makes the relay
 * hold the connection open with no response at all, which used to leave the
 * player spinning until the browser gave up. Bail out after 15s instead — the
 * caller turns that into a clean error the UI can show.
 */
async function fetchRelay(url: string, request: Request): Promise<Response> {
  const headers = new Headers(relayHeaders());
  headers.set('User-Agent', 'AndamTV/1.0');
  const range = request.headers.get('range');
  if (range) headers.set('Range', range);
  return fetch(relayUrl(url), {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
}


async function fetchUpstream(upstream: string, request: Request): Promise<Response> {
  let res = await fetchRelay(upstream, request);
  // 403/411/5xx from the relay are usually transient — retry once.
  if (!res.ok && (res.status === 403 || res.status === 411 || res.status >= 500)) {
    try {
      await res.body?.cancel();
    } catch {
      /* nothing to drain */
    }
    await new Promise((r) => setTimeout(r, 350));
    res = await fetchRelay(upstream, request);
  }
  return res;
}



/**
 * Rewrites manifest URIs to *relative* playback URLs. Absolute URLs built from
 * the incoming request origin are wrong behind the preview/published proxy
 * (the server sees http://localhost:8080), which made the browser request a
 * dead origin and left the player spinning forever.
 */
async function rewriteManifest(text: string, upstream: string): Promise<string> {
  const base = new URL(upstream);
  const absolute = (ref: string) => new URL(ref, base).toString();
  const token = async (ref: string) =>
    `/api/public/xtream-play?t=${encodeURIComponent(await sealUrl(absolute(ref)))}`;

  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    if (trimmed.startsWith('#')) {
      // Rewrite URI="..." attributes (keys, media, i-frame playlists).
      const uriMatch = trimmed.match(/URI="([^"]+)"/);
      if (uriMatch && uriMatch[1]) {
        out.push(trimmed.replace(/URI="([^"]+)"/, `URI="${await token(uriMatch[1])}"`));
      } else {
        out.push(line);
      }
      continue;
    }
    out.push(await token(trimmed));
  }
  return out.join('\n');
}

export const Route = createFileRoute('/api/public/xtream-play')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get('t');
        if (!token) return new Response('Missing token', { status: 400 });

        const upstream = await openUrl(token);
        if (!upstream) return new Response('Link expired', { status: 410 });

        let res: Response;
        try {
          res = await fetchUpstream(upstream, request);
        } catch (err) {
          const timedOut = err instanceof Error && /timeout|abort/i.test(err.name + err.message);
          console.error('[xtream-play] relay error', err);
          return new Response(
            timedOut ? 'Stream timed out (provider not responding)' : 'Stream unavailable',
            { status: timedOut ? 504 : 502, headers: { 'Access-Control-Allow-Origin': '*' } },
          );
        }

        if (!res.ok) {
          console.error('[xtream-play] relay responded', res.status, res.statusText);
          return new Response(
            res.status === 404 ? 'Stream not found' : `Stream unavailable (relay ${res.status})`,
            { status: res.status === 404 ? 404 : 502, headers: { 'Access-Control-Allow-Origin': '*' } },
          );
        }

        // Allowlist only: upstream headers such as x-final-url echo the provider
        // URL (with credentials) and must never reach the browser.
        const headers = new Headers();
        for (const key of SAFE_HEADERS) {
          const value = res.headers.get(key);
          if (value) headers.set(key, value);
        }
        // Some providers answer a suffix range (`bytes=-N`, which browsers use to
        // find the moov atom of non-faststart MP4s) with a malformed
        // `Content-Range: bytes -N/total`. Chrome/Safari reject that and the
        // movie/episode never starts, so normalise it into a real byte range.
        const cr = headers.get('content-range');
        if (cr && !/^bytes \d+-\d+\/\d+$/.test(cr.trim())) {
          const total = Number((cr.match(/\/(\d+)\s*$/) ?? [])[1] ?? NaN);
          const req = (request.headers.get('range') ?? '').match(/bytes=(\d*)-(\d*)/);
          if (Number.isFinite(total) && req) {
            const suffix = !req[1] && req[2] ? Number(req[2]) : NaN;
            const start = Number.isFinite(suffix)
              ? Math.max(0, total - suffix)
              : Number(req[1] || 0);
            const end = Number.isFinite(suffix) ? total - 1 : Number(req[2] || total - 1);
            headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
          } else {
            headers.delete('Content-Range');
          }
        }
        headers.set('Cache-Control', 'no-store');
        headers.set('Access-Control-Allow-Origin', '*');


        if (isManifest(upstream, res.headers.get('content-type'))) {
          const text = await readManifest(res);
          // The relay may follow redirects; resolve relative URIs against the
          // URL the manifest actually came from when the relay reports it.
          const finalUrl = res.headers.get('x-final-url') || upstream;
          const body = await rewriteManifest(text, finalUrl);
          headers.set('Content-Type', 'application/vnd.apple.mpegurl');
          return new Response(body, { status: 200, headers });
        }

        headers.set('Accept-Ranges', 'bytes');
        return new Response(res.body, { status: res.status, headers });

      },
    },
  },
});
