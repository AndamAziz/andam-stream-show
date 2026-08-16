DELETE FROM public.playlist_cache WHERE source_id IN (SELECT id FROM public.sources WHERE slug = 'github' AND type = 'm3u');
DELETE FROM public.content_overrides WHERE source_id IN (SELECT id FROM public.sources WHERE slug = 'github' AND type = 'm3u');
DELETE FROM public.user_source_access WHERE source_id IN (SELECT id FROM public.sources WHERE slug = 'github' AND type = 'm3u');
DELETE FROM public.user_entitlements WHERE source_id IN (SELECT id FROM public.sources WHERE slug = 'github' AND type = 'm3u');
UPDATE public.activation_codes SET source_id = NULL WHERE source_id IN (SELECT id FROM public.sources WHERE slug = 'github' AND type = 'm3u');
DELETE FROM public.sources WHERE slug = 'github' AND type = 'm3u';