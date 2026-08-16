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

/**
 * Hosts that reject this server's IP.
 *
 * Verified 2026-08-16: the provider answers HTTP 456/459 with the body
 * `country-not-allow` for EVERY request from our egress IPs — both the GCP
 * Netherlands IPv4 address and the Cloudflare IPv6 range — for live m3u8, VOD
 * .mp4 and .ts alike, with any User-Agent (absent, `VLC/3.0.20 LibVLC/3.0.20`,
 * `AndamTV/1.0`, desktop Chrome). `player_api.php` from the same IP with the
 * same credentials returns 200 / `auth: 1` / `status: Active`, so it is not a
 * credential, rate-limit or User-Agent problem: it is a hosting/datacenter IP
 * block. The `country-not-allow` string is just the panel's generic label.
 *
 * Re-trying the direct fetch on every segment also burns the account's single
 * connection slot (`max_connections: 1`) for nothing, so hosts are remembered.
 */
const blockedHosts = new Set<string>();
const BLOCK_STATUS = new Set([403, 451, 456, 459]);

function isHostBlocked(host: string): boolean {
  return blockedHosts.has(host);
}

async function fetchUpstream(upstream: string, request: Request): Promise<Response> {
  const host = new URL(upstream).host;
  if (!isHostBlocked(host)) {
    try {
      const direct = await fetchOnce(upstream, request, false);
      if (direct.ok || direct.status === 206) return direct;
      if (BLOCK_STATUS.has(direct.status)) blockedHosts.add(host);
      console.warn('[xtream-play] direct fetch returned', direct.status, '— falling back to relay');
    } catch (err) {
      console.warn('[xtream-play] direct fetch failed, falling back to relay', err);
    }
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

        /**
         * Movies and episodes are multi-megabyte progressive files. The relay
         * tops out around 85 KB/s, which is fine for a low-bitrate live
         * channel but far below a VOD bitrate — the player buffered forever and
         * showed "Stream failed to load". Measured 2026-08-16: the relay
         * delivers ~37 KB/s for a provider .mp4 and ~94 KB/s for a 5 MB file
         * from speed.cloudflare.com that this server fetches directly at
         * 37 MB/s, i.e. the cap is the relay itself, not the provider. Since
         * the provider also blocks this server's IP outright, there is no fast
         * server-side path, so hand the file to the viewer's own connection
         * with a redirect. Once the relay can sustain VOD bitrates this
         * redirect can be removed and everything can flow through it. Live
         * manifests keep flowing through the proxy: hls.js needs same-origin
         * responses to fetch the rewritten segment URLs.
         */
        const host = new URL(upstream).host;
        const progressive = !/\.m3u8(\?|$)/i.test(upstream);
        // `via=relay` is the player's fallback when the viewer's own connection
        // cannot reach the provider either (their country is blocked too).
        if (progressive && url.searchParams.get('via') !== 'relay') {

          if (!isHostBlocked(host)) {
            try {
              const probe = await fetchOnce(upstream, new Request(request.url, {
                headers: { range: 'bytes=0-1' },
              }), false);
              if (BLOCK_STATUS.has(probe.status)) blockedHosts.add(host);
              try {
                await probe.body?.cancel();
              } catch {
                /* nothing to drain */
              }
            } catch {
              /* fall through to the normal path */
            }
          }
          if (isHostBlocked(host)) {
            return new Response(null, {
              status: 302,
              headers: { Location: upstream, 'Cache-Control': 'no-store' },
            });
          }
        }


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
