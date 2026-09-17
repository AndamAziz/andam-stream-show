import { createFileRoute } from '@tanstack/react-router';
import { sealUrl } from '@/lib/xtream-crypto';
import {
  getPlaylistChannels,
  loadPlaylistSource,
  loadPlaylistSources,
  type M3uChannel,
  type PlaylistSource,
} from '@/lib/m3u.server';
import { applyOverrides, loadOverrides } from '@/lib/overrides.server';

/**
 * Public metadata API for the IPTV section (M3U playlist sources).
 *
 * Independent of /api/public/xtream: different source type, different parsing,
 * different cache. Raw playlist stream URLs are never returned — the client
 * gets an opaque token that /api/public/xtream-play resolves and relays.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * The IPTV section is free for everyone: no sign-in, no activation code and no
 * per-source grants. Every active playlist is listed and playable, so `visible`
 * exists only to keep the call sites unchanged.
 */
function visible(sources: PlaylistSource[]): PlaylistSource[] {
  return sources;
}

async function pickSource(slugOrId: string): Promise<PlaylistSource | null> {
  const sources = visible(await loadPlaylistSources());
  return sources.find((s) => s.slug === slugOrId || s.id === slugOrId) ?? sources[0] ?? null;
}

/** Admin overrides hide/re-sort playlist channels and fix broken logos. */
async function withOverrides(
  source: PlaylistSource,
  channels: M3uChannel[],
): Promise<M3uChannel[]> {
  const overrides = await loadOverrides(source.id, 'live');
  return applyOverrides(channels, overrides, 'logo');
}

/** A non-sensitive player hint avoids opening a second provider connection
 * just to identify obvious M3U8/MPD/file URLs. Redirecting `.ts` entries stay
 * `auto`, because many of them actually resolve to HLS manifests. */
function mediaKind(url: string): 'hls' | 'dash' | 'file' | 'auto' {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* Invalid provider URLs will fail naturally in the playback proxy. */
  }
  if (/\.m3u8$/i.test(path)) return 'hls';
  if (/\.mpd$/i.test(path)) return 'dash';
  if (/\.(mp4|m4v|webm|mkv)$/i.test(path)) return 'file';
  return 'auto';
}

export const Route = createFileRoute('/api/public/iptv')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get('action') ?? 'sources';

        try {
          if (action === 'sources') {
            const sources = visible(await loadPlaylistSources());
            return json({ sources: sources.map((s) => ({ id: s.slug, name: s.name })) });
          }

          const source = await pickSource(url.searchParams.get('source') ?? '');
          if (!source) return json({ error: 'No IPTV playlist configured' }, 404);

          if (action === 'channels') {
            const { channels, fetchedAt, stale } = await getPlaylistChannels(source);
            const list = (await withOverrides(source, channels)) as M3uChannel[];
            const group = url.searchParams.get('group') ?? '';
            const filtered = group ? list.filter((c) => c.group === group) : list;
            const groups = new Map<string, number>();
            for (const c of list) groups.set(c.group, (groups.get(c.group) ?? 0) + 1);

            return json({
              source: source.slug,
              fetchedAt,
              stale,
              groups: [...groups.entries()].map(([name, count]) => ({ name, count })),
              total: list.length,
              channels: filtered.map((c, i) => ({
                id: c.id,
                num: c.num || i + 1,
                name: c.name,
                logo: c.logo,
                group: c.group,
              })),
            });
          }

          if (action === 'play') {
            const id = url.searchParams.get('id') ?? '';
            const { channels } = await getPlaylistChannels(source);
            const visibleList = (await withOverrides(source, channels)) as M3uChannel[];
            const channel = visibleList.find((c) => c.id === id);
            if (!channel) return json({ error: 'Channel not found' }, 404);
            return json({
              name: channel.name,
              logo: channel.logo,
              token: await sealUrl(channel.url),
              mediaKind: mediaKind(channel.url),
            });
          }

          /* Batched sealed tokens for the admin bulk stream audit: 500 single
             `play` calls would rebuild the channel list 500 times. Returns the
             same opaque tokens, never a raw provider URL. */
          if (action === 'tokens') {
            const ids = (url.searchParams.get('ids') ?? '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 500);
            if (!ids.length) return json({ error: 'No ids given' }, 400);
            const { channels } = await getPlaylistChannels(source);
            const visibleList = (await withOverrides(source, channels)) as M3uChannel[];
            const byId = new Map(visibleList.map((c) => [c.id, c]));
            const out: { id: string; token: string; mediaKind: string }[] = [];
            for (const id of ids) {
              const channel = byId.get(id);
              if (!channel) continue;
              out.push({
                id,
                token: await sealUrl(channel.url),
                mediaKind: mediaKind(channel.url),
              });
            }
            return json({ tokens: out });
          }

          return json({ error: `Unknown action: ${action}` }, 400);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'IPTV request failed';
          return json({ error: message }, 502);
        }
      },
    },
  },
});
