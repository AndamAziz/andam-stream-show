CREATE TABLE public.activation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  source_id uuid REFERENCES public.sources(id) ON DELETE CASCADE,
  sections text[] NOT NULL DEFAULT ARRAY['live','movies','series']::text[],
  note text,
  expires_at timestamptz,
  max_uses integer NOT NULL DEFAULT 1,
  uses integer NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.activation_codes TO authenticated;
GRANT ALL ON public.activation_codes TO service_role;
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read activation codes" ON public.activation_codes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.activation_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.activation_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.activation_code_redemptions TO authenticated;
GRANT ALL ON public.activation_code_redemptions TO service_role;
ALTER TABLE public.activation_code_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read redemptions" ON public.activation_code_redemptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read own redemptions" ON public.activation_code_redemptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.user_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  section text NOT NULL,
  source_id uuid REFERENCES public.sources(id) ON DELETE CASCADE,
  code_id uuid REFERENCES public.activation_codes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_entitlements_unique
  ON public.user_entitlements (user_id, section, COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT ON public.user_entitlements TO authenticated;
GRANT ALL ON public.user_entitlements TO service_role;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read entitlements" ON public.user_entitlements
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read own entitlements" ON public.user_entitlements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);