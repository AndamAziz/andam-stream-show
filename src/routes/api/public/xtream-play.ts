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
 * Relay first. The app server's egress IP is not whitelisted by the provider —
 * a direct fetch comes back 459/403 every time, and because Xtream accounts
 * allow only a couple of simultaneous connections, that wasted attempt was
 * burning the account's slot and making the *relay* request fail too (which
 * surfaced as a 502 with an endless spinner). Direct is kept as a last resort
 * for the rare case the relay itself is unreachable.
 */
async function fetchOnce(url: string, request: Request, viaRelay: boolean): Promise<Response> {
  const headers = new Headers(viaRelay ? relayHeaders() : {});
  headers.set('User-Agent', 'AndamTV/1.0');
  const range = request.headers.get('range');
  if (range) headers.set('Range', range);
  return fetch(viaRelay ? relayUrl(url) : url, { headers, redirect: 'follow' });
}

async function fetchUpstream(upstream: string, request: Request): Promise<Response> {
  let relayError: unknown;
  try {
    const res = await fetchOnce(upstream, request, true);
    if (res.ok || res.status === 206) return res;
    // Only relay-side hiccups are worth a retry; a provider 403 means the
    // account is at its connection limit and hammering it makes it worse.
    if (res.status === 411 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 350));
      const retry = await fetchOnce(upstream, request, true);
      if (retry.ok || retry.status === 206) return retry;
      return retry;
    }
    return res;
  } catch (err) {
    relayError = err;
    console.warn('[xtream-play] relay unreachable, trying direct', err);
  }

  try {
    return await fetchOnce(upstream, request, false);
  } catch {
    throw relayError;
  }
}


/** Idle window after which a length-less upstream body is considered complete. */
const IDLE_CLOSE_MS = 1500;

/**
 * Streams `body` through, but ends the response when no chunk has arrived for
 * IDLE_CLOSE_MS. Segments arrive in one burst, so this closes them promptly
 * while a genuinely continuous stream keeps flowing.
 */
function closeOnIdle(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<'idle'>((resolve) => {
        timer = setTimeout(() => resolve('idle'), IDLE_CLOSE_MS);
      });
      try {
        const result = await Promise.race([reader.read(), idle]);
        if (result === 'idle') {
          await reader.cancel().catch(() => {});
          controller.close();
          return;
        }
        if (result.done) {
          controller.close();
          return;
        }
        controller.enqueue(result.value);
      } catch (err) {
        controller.error(err);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
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
        // The relay never sends Content-Length and keeps the connection open
        // after the last byte of a segment, so hls.js waited forever on a
        // fragment that had in fact fully arrived (endless spinner, then 502s
        // once the provider's connection slots ran out). Close the response
        // ourselves once the upstream goes quiet for a moment.
        if (res.body && !res.headers.get('content-length')) {
          return new Response(closeOnIdle(res.body), { status: res.status, headers });
        }
        return new Response(res.body, { status: res.status, headers });


      },
    },
  },
});
