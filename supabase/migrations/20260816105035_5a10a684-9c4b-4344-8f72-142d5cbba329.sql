ALTER TABLE public.login_activity ADD COLUMN IF NOT EXISTS session_id text;
CREATE UNIQUE INDEX IF NOT EXISTS login_activity_user_session_key
  ON public.login_activity (user_id, session_id)
  WHERE session_id IS NOT NULL;
GRANT SELECT ON public.login_activity TO authenticated;
GRANT ALL ON public.login_activity TO service_role;