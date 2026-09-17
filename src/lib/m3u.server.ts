/**
 * Server-only M3U playlist support for the IPTV section.
 *
 * Playlist sources (`sources.type = 'm3u'`) hold a `playlist_url` instead of
 * Xtream credentials. The playlist is fetched and parsed here, then cached in
 * `playlist_cache` so page loads read the database instead of re-downloading
 * and re-parsing a multi-megabyte file. Stream URLs never reach the browser:
 * they are sealed into opaque tokens and replayed through the relay proxy by
 * /api/public/xtream-play.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export type M3uChannel = {
  id: string;
  num: number;
  name: string;
  logo: string;
  group: string;
  url: string;
};

export type PlaylistSource = {
  id: string;
  slug: string;
  name: string;
  playlist_url: string;
  is_public: boolean;
};

/** How long a cached playlist stays fresh before an automatic refresh. */
export const PLAYLIST_TTL_HOURS = 6;

const attr = (line: string, key: string): string => {
  const m = new RegExp(`${key}="([^"]*)"`, 'i').exec(line);
  return m?.[1]?.trim() ?? '';
};

/** Parses #EXTINF entries into channels (name, tvg-logo, group-title, URL). */
export function parseM3u(text: string): M3uChannel[] {
  const lines = text.split(/\r?\n/);
  const channels: M3uChannel[] = [];
  let pending: { name: string; logo: string; group: string } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^#EXTINF/i.test(line)) {
      const comma = line.indexOf(',');
      const title = comma > -1 ? line.slice(comma + 1).trim() : '';
      pending = {
        name: title || attr(line, 'tvg-name') || 'Unnamed channel',
        logo: attr(line, 'tvg-logo'),
        group: attr(line, 'group-title') || 'Uncategorised',
      };
      continue;
    }

    if (line.startsWith('#')) continue; // #EXTM3U, #EXTGRP, #KODIPROP, comments

    if (pending) {
      channels.push({
        id: String(channels.length + 1),
        num: channels.length + 1,
        name: pending.name,
        logo: pending.logo,
        group: pending.group,
        url: line,
      });
      pending = null;
    }
  }
  return channels;
}

export async function loadPlaylistSources(): Promise<PlaylistSource[]> {
  const { data, error } = await supabaseAdmin
    .from('sources')
    .select('id, slug, name, playlist_url, is_public')
    .eq('type', 'm3u')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((s): s is PlaylistSource => Boolean(s.playlist_url))
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      playlist_url: s.playlist_url,
      is_public: s.is_public,
    }));
}

export async function loadPlaylistSource(id: string): Promise<PlaylistSource | null> {
  const { data, error } = await supabaseAdmin
    .from('sources')
    .select('id, slug, name, playlist_url, is_public')
    .eq('id', id)
    .eq('type', 'm3u')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.playlist_url) return null;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    playlist_url: data.playlist_url,
    is_public: data.is_public,
  };
}

/** Downloads and parses the playlist, then stores it in the cache table. */
export async function refreshPlaylist(source: PlaylistSource): Promise<{
  channels: M3uChannel[];
  channelCount: number;
  categoryCount: number;
  fetchedAt: string;
}> {
  const res = await fetch(source.playlist_url, {
    headers: { 'User-Agent': 'AndamTV/1.0', Accept: 'audio/x-mpegurl,text/plain,*/*' },
  });
  if (!res.ok) throw new Error(`Playlist responded ${res.status}`);
  const text = await res.text();
  if (!/#EXTINF/i.test(text)) throw new Error('That URL does not look like an M3U playlist');

  const channels = parseM3u(text);
  const categoryCount = new Set(channels.map((c) => c.group)).size;
  const fetchedAt = new Date().toISOString();

  const { error } = await supabaseAdmin.from('playlist_cache').upsert(
    {
      source_id: source.id,
      channels,
      channel_count: channels.length,
      category_count: categoryCount,
      fetched_at: fetchedAt,
    },
    { onConflict: 'source_id' },
  );
  if (error) throw new Error(error.message);

  return { channels, channelCount: channels.length, categoryCount, fetchedAt };
}

/** Cached channel list; refreshes automatically once the cache goes stale. */
export async function getPlaylistChannels(
  source: PlaylistSource,
  force = false,
): Promise<{ channels: M3uChannel[]; fetchedAt: string; stale: boolean }> {
  if (!force) {
    const { data } = await supabaseAdmin
      .from('playlist_cache')
      .select('channels, fetched_at')
      .eq('source_id', source.id)
      .maybeSingle();
    const fetchedAt = data?.fetched_at;
    if (data && fetchedAt) {
      const ageHours = (Date.now() - new Date(fetchedAt).getTime()) / 3_600_000;
      if (ageHours < PLAYLIST_TTL_HOURS) {
        return {
          channels: (data.channels ?? []) as unknown as M3uChannel[],
          fetchedAt,
          stale: false,
        };
      }
    }
  }

  try {
    const fresh = await refreshPlaylist(source);
    return { channels: fresh.channels, fetchedAt: fresh.fetchedAt, stale: false };
  } catch (err) {
    // A failed refresh must not blank the IPTV page — serve the stale copy.
    const { data } = await supabaseAdmin
      .from('playlist_cache')
      .select('channels, fetched_at')
      .eq('source_id', source.id)
      .maybeSingle();
    if (data?.fetched_at) {
      return {
        channels: (data.channels ?? []) as unknown as M3uChannel[],
        fetchedAt: data.fetched_at,
        stale: true,
      };
    }
    throw err;
  }
}

export async function playlistCacheStats(): Promise<
  Record<string, { channelCount: number; categoryCount: number; fetchedAt: string }>
> {
  const { data } = await supabaseAdmin
    .from('playlist_cache')
    .select('source_id, channel_count, category_count, fetched_at');
  const map: Record<string, { channelCount: number; categoryCount: number; fetchedAt: string }> = {};
  for (const row of data ?? []) {
    map[row.source_id] = {
      channelCount: row.channel_count,
      categoryCount: row.category_count,
      fetchedAt: row.fetched_at,
    };
  }
  return map;
}
