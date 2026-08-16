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
 * Fetches the provider bytes.
 *
 * Direct server-side fetch first: this route already hides the provider
 * credentials, and the relay buffers whole segments (measured ~35s for a 1.6MB
 * segment the provider serves in 0.15s), which starved the player. The relay is
 * kept as a fallback for upstreams we cannot reach directly (geo/IP blocks).
 */
async function fetchOnce(url: string, request: Request, viaRelay: boolean): Promise<Response> {
  const headers = new Headers(viaRelay ? relayHeaders() : {});
  headers.set('User-Agent', 'AndamTV/1.0');
  const range = request.headers.get('range');
  if (range) headers.set('Range', range);
  return fetch(viaRelay ? relayUrl(url) : url, { headers, redirect: 'follow' });
}

async function fetchUpstream(upstream: string, request: Request): Promise<Response> {
  try {
    const direct = await fetchOnce(upstream, request, false);
    if (direct.ok || direct.status === 206) return direct;
    console.warn('[xtream-play] direct fetch returned', direct.status, '— falling back to relay');
  } catch (err) {
    console.warn('[xtream-play] direct fetch failed, falling back to relay', err);
  }

  let res = await fetchOnce(upstream, request, true);
  // 403/411/5xx from the relay are usually transient — retry once.
  if (!res.ok && (res.status === 403 || res.status === 411 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 350));
    res = await fetchOnce(upstream, request, true);
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
          console.error('[xtream-play] relay error', err);
          return new Response('Stream unavailable', { status: 502 });
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
          const text = await res.text();
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
