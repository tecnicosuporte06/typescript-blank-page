BEGIN;

-- Tabela global para credenciais do aplicativo Google Calendar
CREATE TABLE IF NOT EXISTS public.system_google_calendar_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  client_secret text NOT NULL,
  redirect_uri text NOT NULL,
  project_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- RLS
ALTER TABLE public.system_google_calendar_settings ENABLE ROW LEVEL SECURITY;

-- Políticas:
--  - Leitura/escrita apenas via service role ou usuários master (controlado pelas funções is_current_user_master/is_master_user, se existirem)

DROP POLICY IF EXISTS "Service role full access to google settings" ON public.system_google_calendar_settings;
CREATE POLICY "Service role full access to google settings"
  ON public.system_google_calendar_settings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Se o sistema tiver função is_current_user_master(), podemos permitir leitura/escrita também para masters
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'is_current_user_master'
  ) THEN
    DROP POLICY IF EXISTS "Master can manage google settings" ON public.system_google_calendar_settings;
    CREATE POLICY "Master can manage google settings"
      ON public.system_google_calendar_settings
      FOR ALL
      USING (is_current_user_master())
      WITH CHECK (is_current_user_master());
  END IF;
END $$;

-- Trigger de updated_at
DROP TRIGGER IF EXISTS update_system_google_calendar_settings_updated_at ON public.system_google_calendar_settings;
CREATE TRIGGER update_system_google_calendar_settings_updated_at
  BEFORE UPDATE ON public.system_google_calendar_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;


