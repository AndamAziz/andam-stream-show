import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { loadPlaylistSources, refreshPlaylist } from '@/lib/m3u.server';
const s = (await loadPlaylistSources())[0]!;
try { const r = await refreshPlaylist(s); console.log('refreshed', r.channelCount); } catch(e){ console.log('ERR', e instanceof Error ? e.message : e); }
const { data } = await supabaseAdmin.from('playlist_cache').select('channel_count').eq('source_id', s.id).maybeSingle();
console.log(data);
