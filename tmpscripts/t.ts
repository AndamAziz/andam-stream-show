import { supabaseAdmin } from '@/integrations/supabase/client.server';
const { data, error } = await supabaseAdmin.from('sources').select('id,slug,type,playlist_url,is_active').eq('type','m3u');
console.log(data, error);
const { data: c } = await supabaseAdmin.from('playlist_cache').select('source_id,channel_count,fetched_at');
console.log(c);
const url = data?.[0]?.playlist_url;
if (url) { const r = await fetch(url, {headers:{'User-Agent':'AndamTV/1.0'}}); const t = await r.text(); console.log(r.status, t.length, JSON.stringify(t.slice(0,300))); }
