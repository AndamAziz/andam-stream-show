import { getPlaylistChannels, loadPlaylistSources } from '@/lib/m3u.server';
import { applyOverrides, loadOverrides } from '@/lib/overrides.server';
const s = (await loadPlaylistSources())[0]!;
const { channels, fetchedAt, stale } = await getPlaylistChannels(s);
console.log('channels', channels.length, fetchedAt, stale);
const ov = await loadOverrides(s.id, 'live');
console.log('overrides', Array.isArray(ov) ? ov.length : ov);
const out = applyOverrides(channels, ov as never, 'logo');
console.log('after overrides', (out as unknown[]).length);
