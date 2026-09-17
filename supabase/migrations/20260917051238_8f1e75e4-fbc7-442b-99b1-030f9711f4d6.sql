CREATE TABLE public.iptv_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  channel_key text NOT NULL,
  num integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  logo text,
  group_title text NOT NULL DEFAULT 'Uncategorised',
  url text NOT NULL,
  media_kind text NOT NULL DEFAULT 'auto',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (source_id, channel_key)
);

CREATE INDEX iptv_channels_source_num_idx ON public.iptv_channels (source_id, num);
CREATE INDEX iptv_channels_group_idx ON public.iptv_channels (source_id, group_title);

GRANT SELECT ON public.iptv_channels TO authenticated;
GRANT ALL ON public.iptv_channels TO service_role;

ALTER TABLE public.iptv_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read iptv channels"
ON public.iptv_channels FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_iptv_channels_updated_at
BEFORE UPDATE ON public.iptv_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();