ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'xtream',
  ADD COLUMN IF NOT EXISTS playlist_url text;

ALTER TABLE public.sources
  ALTER COLUMN base_url DROP NOT NULL,
  ALTER COLUMN username DROP NOT NULL,
  ALTER COLUMN password DROP NOT NULL;

UPDATE public.sources SET type = 'xtream' WHERE type IS NULL OR type = '';

ALTER TABLE public.sources
  DROP CONSTRAINT IF EXISTS sources_type_check;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_type_check CHECK (type IN ('xtream', 'm3u'));

CREATE TABLE IF NOT EXISTS public.playlist_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL UNIQUE REFERENCES public.sources(id) ON DELETE CASCADE,
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  channel_count integer NOT NULL DEFAULT 0,
  category_count integer NOT NULL DEFAULT 0,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.playlist_cache TO authenticated;
GRANT ALL ON public.playlist_cache TO service_role;

ALTER TABLE public.playlist_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view the playlist cache"
  ON public.playlist_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_playlist_cache_updated_at
  BEFORE UPDATE ON public.playlist_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();