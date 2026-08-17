-- Keep current viewers working: everyone who already has the live section
-- unlocked (or any existing account) keeps MyRestreamer explicitly assigned.
INSERT INTO public.user_source_access (user_id, source_id)
SELECT p.id, s.id
FROM public.profiles p
CROSS JOIN public.sources s
WHERE s.type = 'xtream'
  AND lower(s.name) LIKE '%restreamer%'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_source_access a
    WHERE a.user_id = p.id AND a.source_id = s.id
  );