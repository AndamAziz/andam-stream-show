CREATE TABLE public.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  base_url text NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.sources TO service_role;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_source_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_id)
);

GRANT SELECT ON public.user_source_access TO authenticated;
GRANT ALL ON public.user_source_access TO service_role;
ALTER TABLE public.user_source_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own provider access"
ON public.user_source_access FOR SELECT TO authenticated
USING (auth.uid() = user_id);

INSERT INTO public.sources (slug, name, base_url, username, password, sort_order)
VALUES ('myrestreamer', 'MyRestreamer', 'https://myrestreamer.com:2087', '162360837276', '6a69c61558b80', 1);