DROP INDEX IF EXISTS public.user_entitlements_unique;
ALTER TABLE public.user_entitlements
  ADD CONSTRAINT user_entitlements_unique
  UNIQUE NULLS NOT DISTINCT (user_id, section, source_id);