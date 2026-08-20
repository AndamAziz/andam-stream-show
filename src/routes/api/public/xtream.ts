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
import { applyOverrides, loadOverrides } from '@/lib/overrides.server';

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
  genre?: string;
  category_id?: string;
};

type SeriesItem = {
  series_id: number;
  name: string;
  cover?: string;
  rating?: string | number;
  plot?: string;
  releaseDate?: string;
  last_modified?: string;
  genre?: string;
  category_id?: string;
  season?: number | string;
  seasons?: unknown[];
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
    .select('id, slug, name, base_url, username, password, is_public')
    .eq('type', 'xtream')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    base_url: s.base_url ?? '',
    username: s.username ?? '',
    password: s.password ?? '',
    is_public: s.is_public,
  })) as Source[];
}

/**
 * Live TV providers the caller may use. `'all'` (admins, or a code issued for
 * all providers) keeps the public/private rule; a list means the caller was
 * activated for those providers only and sees nothing else.
 */
function visible(sources: Source[], allowed: string[] | 'all'): Source[] {
  if (allowed === 'all') return sources;
  return sources.filter((s) => allowed.includes(s.id));
}

async function loadSource(slugOrId: string, allowed: string[] | 'all'): Promise<Source | null> {
  const sources = visible(await loadSources(), allowed);
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
          // Live TV is gated: locked viewers get no providers, categories or
          // channel data at all — not just a hidden UI.
          const { canOpen, lockedResponse, resolveAccess } = await import('@/lib/access.server');
          const access = await resolveAccess(request);
          if (!canOpen(access, 'live')) return lockedResponse('live');
          const granted = access.liveSources;

          if (action === 'providers') {
            const sources = visible(await loadSources(), granted);
            // Only non-sensitive fields leave the server.
            return json({ providers: sources.map((s) => ({ id: s.slug, name: s.name })) });
          }

          if (action === 'featured') {
            const { listFeatured } = await import('@/lib/featured.server');
            const rows = await listFeatured();
            return json({ featured: rows.map((r) => ({ pattern: r.pattern, order: r.sort_order })) });
          }

          const source = await loadSource(url.searchParams.get('source') ?? '', granted);
          if (!source) return json({ error: 'No provider configured' }, 404);

          if (action === 'categories') {
            const kind = (url.searchParams.get('type') ?? 'live') as XtreamKind;
            const map: Record<XtreamKind, string> = {
              live: 'get_live_categories',
              vod: 'get_vod_categories',
              series: 'get_series_categories',
            };
            const cats = await playerApi<Category[]>(source, { action: map[kind] });
            const categories = (Array.isArray(cats) ? cats : []).map((c) => ({
              id: String(c.category_id),
              name: c.category_name,
            }));
            return json({
              categories: applyOverrides(categories, await loadOverrides(source.id, 'category')),
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
              categoryId: s.category_id ? String(s.category_id) : '',
            }));
            const visibleItems = applyOverrides(
              items,
              await loadOverrides(source.id, 'live'),
              'logo',
            );
            return json({
              items: visibleItems,
              hasArchive: visibleItems.some((i) => i.archive),
            });
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
              genre: s.genre ? String(s.genre) : '',
              added: s.added ? String(s.added) : '',
              categoryId: s.category_id ? String(s.category_id) : '',
              ext: s.container_extension || 'mp4',
            }));
            return json({
              items: applyOverrides(items, await loadOverrides(source.id, 'vod'), 'poster'),
            });
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
              genre: s.genre ? String(s.genre) : '',
              categoryId: s.category_id ? String(s.category_id) : '',
              // Only surfaced when the provider actually reports it.
              seasonCount: Array.isArray(s.seasons)
                ? s.seasons.length
                : s.season
                  ? num(s.season)
                  : 0,
              lastModified: s.last_modified ? String(s.last_modified) : '',
            }));
            return json({
              items: applyOverrides(items, await loadOverrides(source.id, 'series'), 'poster'),
            });
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
          const message = err instanceof Error ? err.message : 'Provider request failed';
          // A refusing panel (403/451/5xx/unreachable) is an upstream condition,
          // not a bug in this app: answer 200 with an `error` field so the page
          // shows the provider message instead of tripping the error boundary
          // with a 502 (which blanked the Live TV screen).
          if (/^provider /.test(message)) {
            return json({ error: `This provider is not responding (${message}).`, providerError: true });
          }
          return json({ error: 'Provider request failed' }, 502);
        }

      },
    },
  },
});
