-- Script SQL para inserir configurações de banco manualmente
-- Execute este script no SQL Editor do Supabase

-- Método 1: Usar DO para inserir ou atualizar de forma segura
DO $$
BEGIN
  -- Inserir ou atualizar Base 1
  INSERT INTO public.database_configs (name, url, anon_key, project_id, is_active)
  VALUES (
    'Base 1',
    'https://zdrgvdlfhrbynpkvtyhx.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkcmd2ZGxmaHJieW5wa3Z0eWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDU2OTEsImV4cCI6MjA4MDI4MTY5MX0.MzCe3coYsKtl5knDRE2zrmTSomu58nMVVUokj5QMToM',
    'zdrgvdlfhrbynpkvtyhx',
    true
  )
  ON CONFLICT (name) DO UPDATE 
  SET url = EXCLUDED.url,
      anon_key = EXCLUDED.anon_key,
      project_id = EXCLUDED.project_id,
      is_active = EXCLUDED.is_active,
      updated_at = now();
  
  -- Inserir ou atualizar Base 2
  INSERT INTO public.database_configs (name, url, anon_key, project_id, is_active)
  VALUES (
    'Base 2',
    'https://zldeaozqxjwvzgrblyrh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGVhb3pxeGp3dnpncmJseXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNDQyNDYsImV4cCI6MjA2ODkyMDI0Nn0.4KmrswdBfTyHLqrUt9NdCBUjDPKCeO2NN7Vvqepr4xM',
    'zldeaozqxjwvzgrblyrh',
    false
  )
  ON CONFLICT (name) DO UPDATE 
  SET url = EXCLUDED.url,
      anon_key = EXCLUDED.anon_key,
      project_id = EXCLUDED.project_id,
      is_active = EXCLUDED.is_active,
      updated_at = now();
END $$;

-- Garantir que apenas Base 1 esteja ativa
UPDATE public.database_configs
SET is_active = false, updated_at = now()
WHERE name = 'Base 2' AND is_active = true
AND EXISTS (
  SELECT 1 FROM public.database_configs 
  WHERE name = 'Base 1' AND is_active = true
);

-- Verificar os dados inseridos
SELECT id, name, url, project_id, is_active, created_at, updated_at 
FROM public.database_configs 
ORDER BY name;

