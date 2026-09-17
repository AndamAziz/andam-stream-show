import { createFileRoute } from '@tanstack/react-router';
import { proxyStream, resolveBasePath } from '@/lib/stream-proxy.server';

/**
 * Path-based playback proxy: `/api/public/stream/<sealed base>/<path...>`.
 *
 * DASH players (and template-based HLS) generate segment names at runtime from
 * `$Number$` / `$Time$` patterns, so those URLs cannot be sealed one by one.
 * Sealing the base directory instead keeps the provider URL and relay token
 * hidden while letting the player append whatever segment it needs.
 */
export const Route = createFileRoute('/api/public/stream/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const splat = String((params as Record<string, string>)['_splat'] ?? '');
        const slash = splat.indexOf('/');
        const token = decodeURIComponent(slash === -1 ? splat : splat.slice(0, slash));
        const rest = slash === -1 ? '' : splat.slice(slash + 1);
        if (!token) return new Response('Missing token', { status: 400 });

        const search = new URL(request.url).search;
        const upstream = await resolveBasePath(token, rest + search);
        if (!upstream) return new Response('Link expired', { status: 410 });

        return proxyStream(upstream, request);
      },
    },
  },
});
