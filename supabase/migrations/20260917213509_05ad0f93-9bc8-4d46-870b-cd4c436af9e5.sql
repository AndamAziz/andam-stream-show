ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS relay_url text,
  ADD COLUMN IF NOT EXISTS relay_token text;

CREATE TABLE public.provider_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  token text NOT NULL UNIQUE,
  note text NOT NULL DEFAULT '',
  expires_at timestamp with time zone,
  revoked boolean NOT NULL DEFAULT false,
  last_used_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.provider_invites TO service_role;
GRANT SELECT ON public.provider_invites TO authenticated;
ALTER TABLE public.provider_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read provider invites" ON public.provider_invites
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_provider_invites_updated_at
  BEFORE UPDATE ON public.provider_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.provider_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invite_id uuid REFERENCES public.provider_invites(id) ON DELETE SET NULL,
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  contact text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  playlist text NOT NULL,
  channel_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT provider_submissions_status_check
    CHECK (status IN ('pending', 'imported', 'rejected'))
);

GRANT ALL ON public.provider_submissions TO service_role;
GRANT SELECT ON public.provider_submissions TO authenticated;
ALTER TABLE public.provider_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read provider submissions" ON public.provider_submissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_provider_submissions_updated_at
  BEFORE UPDATE ON public.provider_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_provider_submissions_status ON public.provider_submissions(status, created_at DESC);
CREATE INDEX idx_provider_invites_source ON public.provider_invites(source_id);
CREATE INDEX idx_iptv_channels_source ON public.iptv_channels(source_id, num);