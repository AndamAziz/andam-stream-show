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
  const ct = (contentType ?? '').toLowerCase();
  // Some providers serve MPEG-TS fragments from URLs that retain a .m3u8
  // suffix. The returned media type is authoritative in that case; treating
  // the fragment as text leaves res.text() waiting forever for the live socket.
  if (ct.includes('mp2t') || ct.startsWith('video/')) return false;
  if (ct.includes('mpegurl') || ct.includes('vnd.apple.mpegurl')) return true;
  if (/\.m3u8(\?|$)/i.test(url)) return true;
  return false;
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
  // The relay/provider can leave MPEG-TS responses open forever. A bounded
  // default range gives every HLS fragment a concrete upstream boundary while
  // preserving explicit browser Range requests for VOD seeking.
  headers.set('Range', range ?? 'bytes=0-8388607');
  const controller = new AbortController();
  if (!range) setTimeout(() => controller.abort(), MAX_FRAGMENT_OPEN_MS);
  return fetch(viaRelay ? relayUrl(url) : url, {
    headers,
    redirect: 'follow',
    signal: controller.signal,
  });
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
/** Provider fragments advertise 10s in their manifests but may never EOF. */
const MAX_FRAGMENT_OPEN_MS = 11_000;

/**
 * Streams `body` through, but ends the response when no chunk has arrived for
 * IDLE_CLOSE_MS. Segments arrive in one burst, so this closes them promptly
 * while a genuinely continuous stream keeps flowing.
 */
async function readBoundedFragment(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = body.getReader();
  const openedAt = Date.now();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (Date.now() - openedAt < MAX_FRAGMENT_OPEN_MS) {
      const remaining = MAX_FRAGMENT_OPEN_MS - (Date.now() - openedAt);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<'idle'>((resolve) => {
        timer = setTimeout(() => resolve('idle'), Math.min(IDLE_CLOSE_MS, remaining));
      });
      try {
        const result = await Promise.race([reader.read(), idle]);
        if (result === 'idle' || result.done) break;
        chunks.push(result.value);
        length += result.value.byteLength;
        // A continuously-ready reader can otherwise create an endless
        // microtask chain that prevents the wall-clock timeout from firing.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  } catch (error) {
    // The upstream timeout deliberately aborts live fragment sockets. Bytes
    // already received are a valid MPEG-TS fragment; only fail if none arrived.
    if (length === 0) throw error;
  } finally {
    void reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
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

        const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

        let res: Response;
        try {
          res = await fetchUpstream(upstream, request);
        } catch (err) {
          console.error('[xtream-play] relay error', err);
          // 504, not 502: a timeout/unreachable upstream is an upstream problem.
          // Returning 5xx for provider-side conditions made the client report an
          // app crash (blank-screen runtime error) for what is a stream issue.
          return new Response('Stream timed out', { status: 504, headers: cors });
        }

        if (!res.ok) {
          console.error('[xtream-play] relay responded', res.status, res.statusText);
          // Provider/relay refusals (403 = account connection limit reached,
          // 404 = channel gone, 459 = IP not whitelisted) are surfaced verbatim
          // as 4xx so the player can show a precise message instead of the
          // generic 502 that the app treated as its own failure.
          if (res.status === 404) return new Response('Stream not found', { status: 404, headers: cors });
          if (res.status === 403 || res.status === 459)
            return new Response('Stream busy: the provider refused the connection (limit reached)', {
              status: 429,
              headers: cors,
            });
          if (res.status < 500) return new Response(`Stream error ${res.status}`, { status: res.status, headers: cors });
          return new Response(`Stream unavailable (upstream ${res.status})`, { status: 502, headers: cors });
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
        // ourselves once the upstream goes quiet or the advertised fragment
        // window elapses. Buffering also lets us send a definite Content-Length.
        const upstreamType = (res.headers.get('content-type') ?? '').toLowerCase();
        const isTransportStream = upstreamType.includes('mp2t') || /\.ts(\?|$)/i.test(upstream);
        if (res.body && (!res.headers.get('content-length') || isTransportStream)) {
          const fragment = await readBoundedFragment(res.body);
          headers.set('Content-Length', String(fragment.byteLength));
          return new Response(fragment.buffer as ArrayBuffer, { status: res.status, headers });
        }
        return new Response(res.body, { status: res.status, headers });


      },
    },
  },
});
