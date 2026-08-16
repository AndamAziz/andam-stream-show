CREATE TABLE public.featured_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX featured_channels_pattern_key ON public.featured_channels (lower(pattern));
GRANT SELECT ON public.featured_channels TO authenticated;
GRANT SELECT ON public.featured_channels TO anon;
GRANT ALL ON public.featured_channels TO service_role;
ALTER TABLE public.featured_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read featured channels" ON public.featured_channels FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage featured channels" ON public.featured_channels FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.featured_channels (pattern, sort_order) VALUES
  ('bein sports', 10),
  ('bein', 20),
  ('national geographic', 30),
  ('nat geo', 40),
  ('sky sports', 50),
  ('bbc', 60),
  ('cnn', 70),
  ('discovery', 80),
  ('espn', 90);