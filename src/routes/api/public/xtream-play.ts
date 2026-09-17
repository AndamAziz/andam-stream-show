import { createFileRoute } from '@tanstack/react-router';
import { openUrl } from '@/lib/xtream-crypto';
import { proxyStream } from '@/lib/stream-proxy.server';

/**
 * Playback proxy.
 *
 * Takes an opaque token, decrypts it into the real provider URL, and streams the
 * bytes through the Andam relay. HLS/DASH manifests are rewritten so segments
 * also arrive through the proxy, so the browser never sees provider credentials
 * or the relay token. Range requests are forwarded so VOD seeking keeps working.
 *
 * Shared implementation lives in src/lib/stream-proxy.server.ts (also used by
 * the path-based /api/public/stream/<base>/<path> form needed for DASH).
 */
export const Route = createFileRoute('/api/public/xtream-play')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get('t');
        if (!token) return new Response('Missing token', { status: 400 });

        const upstream = await openUrl(token);
        if (!upstream) return new Response('Link expired', { status: 410 });

        return proxyStream(upstream, request);
      },
    },
  },
});
