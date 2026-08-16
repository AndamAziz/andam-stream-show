import { createFileRoute } from '@tanstack/react-router';
import { sealUrl } from '@/lib/xtream-crypto';
import {
  liveStreamUrl,
  playerApi,
  seriesStreamUrl,
  timeshiftUrl,
  vodStreamUrl,
  type Source,
  type XtreamKind,
} from '@/lib/xtream';

/**
 * Metadata proxy for the Live TV section.
 *
 * All player_api.php traffic happens here, server-side, so provider
 * credentials never appear in browser devtools. Playable URLs are returned as
 * opaque encrypted tokens that only /api/public/xtream-play can resolve.
 */

type Category = { category_id: string; category_name: string };

type LiveStream = {
  stream_id: number;
  name: string;
  stream_icon?: string;
  epg_channel_id?: string | null;
  num?: number;
  tv_archive?: number | string;
  tv_archive_duration?: number | string;
  category_id?: string;
};

type VodStream = {
  stream_id: number;
  name: string;
  stream_icon?: string;
  rating?: string | number;
  container_extension?: string;
  year?: string | number;
  added?: string;
};

type SeriesItem = {
  series_id: number;
  name: string;
  cover?: string;
  rating?: string | number;
  plot?: string;
  releaseDate?: string;
  last_modified?: string;
};

type SeriesEpisode = {
  id: string | number;
  episode_num: number | string;
  title: string;
  container_extension?: string;
  info?: { movie_image?: string; plot?: string; duration?: string; rating?: number | string };
};

type SeriesInfo = {
  info?: { name?: string; cover?: string; plot?: string; genre?: string; rating?: string | number };
  seasons?: Array<{ season_number: number | string; name?: string; cover?: string }>;
  episodes?: Record<string, SeriesEpisode[]>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function loadSources(): Promise<Source[]> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('sources')
    .select('id, slug, name, base_url, username, password')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Source[];
}

async function loadSource(slugOrId: string): Promise<Source | null> {
  const sources = await loadSources();
  return sources.find((s) => s.slug === slugOrId || s.id === slugOrId) ?? sources[0] ?? null;
}

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const Route = createFileRoute('/api/public/xtream')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get('action') ?? 'providers';

        try {
          if (action === 'providers') {
            const sources = await loadSources();
            // Only non-sensitive fields leave the server.
            return json({ providers: sources.map((s) => ({ id: s.slug, name: s.name })) });
          }

          const source = await loadSource(url.searchParams.get('source') ?? '');
          if (!source) return json({ error: 'No provider configured' }, 404);

          if (action === 'categories') {
            const kind = (url.searchParams.get('type') ?? 'live') as XtreamKind;
            const map: Record<XtreamKind, string> = {
              live: 'get_live_categories',
              vod: 'get_vod_categories',
              series: 'get_series_categories',
            };
            const cats = await playerApi<Category[]>(source, { action: map[kind] });
            return json({
              categories: (Array.isArray(cats) ? cats : []).map((c) => ({
                id: String(c.category_id),
                name: c.category_name,
              })),
            });
          }

          if (action === 'live') {
            const categoryId = url.searchParams.get('category_id') ?? '';
            const streams = await playerApi<LiveStream[]>(source, {
              action: 'get_live_streams',
              ...(categoryId ? { category_id: categoryId } : {}),
            });
            const list = Array.isArray(streams) ? streams : [];
            // Playback tokens are minted on demand (action=play) so a 5000-channel
            // list stays fast.
            const items = list.map((s, i) => ({
              id: String(s.stream_id),
              num: num(s.num, i + 1),
              name: s.name,
              logo: s.stream_icon || '',
              archive: num(s.tv_archive) === 1,
              archiveDays: num(s.tv_archive_duration),
            }));
            return json({ items, hasArchive: items.some((i) => i.archive) });
          }

          if (action === 'vod') {
            const categoryId = url.searchParams.get('category_id') ?? '';
            const streams = await playerApi<VodStream[]>(source, {
              action: 'get_vod_streams',
              ...(categoryId ? { category_id: categoryId } : {}),
            });
            const list = Array.isArray(streams) ? streams : [];
            const items = list.map((s) => ({
              id: String(s.stream_id),
              name: s.name,
              poster: s.stream_icon || '',
              rating: s.rating ? String(s.rating) : '',
              year: s.year ? String(s.year) : '',
              ext: s.container_extension || 'mp4',
            }));
            return json({ items });
          }

          if (action === 'series') {
            const categoryId = url.searchParams.get('category_id') ?? '';
            const list = await playerApi<SeriesItem[]>(source, {
              action: 'get_series',
              ...(categoryId ? { category_id: categoryId } : {}),
            });
            const items = (Array.isArray(list) ? list : []).map((s) => ({
              id: String(s.series_id),
              name: s.name,
              poster: s.cover || '',
              rating: s.rating ? String(s.rating) : '',
              year: (s.releaseDate || '').slice(0, 4),
            }));
            return json({ items });
          }

          if (action === 'play') {
            const kind = url.searchParams.get('type') ?? 'live';
            const id = url.searchParams.get('id') ?? '';
            const ext = (url.searchParams.get('ext') || '').replace(/[^a-z0-9]/gi, '');
            if (!/^\d+$/.test(id)) return json({ error: 'id is required' }, 400);
            if (kind === 'live') return json({ play: await sealUrl(liveStreamUrl(source, id)) });
            if (kind === 'vod')
              return json({ play: await sealUrl(vodStreamUrl(source, id, ext || 'mp4')) });
            if (kind === 'series')
              return json({ play: await sealUrl(seriesStreamUrl(source, id, ext || 'mp4')) });
            return json({ error: 'Unknown play type' }, 400);
          }


          if (action === 'series_info') {
            const seriesId = url.searchParams.get('series_id') ?? '';
            if (!seriesId) return json({ error: 'series_id is required' }, 400);
            const info = await playerApi<SeriesInfo>(source, {
              action: 'get_series_info',
              series_id: seriesId,
            });
            const seasonKeys = Object.keys(info.episodes ?? {}).sort(
              (a, b) => Number(a) - Number(b),
            );
            const seasons = await Promise.all(
              seasonKeys.map(async (key) => ({
                season: Number(key),
                episodes: await Promise.all(
                  (info.episodes?.[key] ?? []).map(async (ep) => ({
                    id: String(ep.id),
                    episode: num(ep.episode_num),
                    title: ep.title,
                    image: ep.info?.movie_image || '',
                    plot: ep.info?.plot || '',
                    duration: ep.info?.duration || '',
                    play: await sealUrl(
                      seriesStreamUrl(source, ep.id, ep.container_extension || 'mp4'),
                    ),
                  })),
                ),
              })),
            );
            return json({
              title: info.info?.name ?? '',
              cover: info.info?.cover ?? '',
              plot: info.info?.plot ?? '',
              genre: info.info?.genre ?? '',
              rating: info.info?.rating ? String(info.info.rating) : '',
              seasons,
            });
          }

          if (action === 'timeshift') {
            const streamId = url.searchParams.get('stream_id') ?? '';
            const start = url.searchParams.get('start') ?? '';
            const duration = num(url.searchParams.get('duration'), 60);
            if (!streamId || !/^\d{4}-\d{2}-\d{2}:\d{2}-\d{2}$/.test(start)) {
              return json({ error: 'stream_id and start (yyyy-MM-dd:HH-mm) are required' }, 400);
            }
            return json({
              play: await sealUrl(timeshiftUrl(source, streamId, duration, start)),
            });
          }

          return json({ error: `Unknown action "${action}"` }, 400);
        } catch (err) {
          console.error('[xtream]', action, err);
          return json({ error: 'Provider request failed' }, 502);
        }
      },
    },
  },
});
