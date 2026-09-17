import { supabaseAdmin } from '@/integrations/supabase/client.server';
const { data, error, status } = await supabaseAdmin.from('playlist_cache').select('channels, fetched_at').limit(1).maybeSingle();
console.log('status', status, 'error', error);
const ch = (data as any)?.channels;
console.log('type', typeof ch, Array.isArray(ch), Array.isArray(ch) ? ch.length : String(ch).slice(0,200));
