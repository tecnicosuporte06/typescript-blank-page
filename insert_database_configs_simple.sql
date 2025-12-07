-- Script SQL SIMPLES para inserir configurações
-- Execute este script no SQL Editor do Supabase, UMA LINHA DE CADA VEZ

-- Primeiro, verifique se a tabela existe e está vazia
SELECT COUNT(*) FROM public.database_configs;

-- Se a tabela estiver vazia, execute os INSERTs abaixo
-- Se já tiver dados, use os UPDATEs

-- ============================================
-- OPÇÃO 1: Se a tabela está VAZIA, use INSERT simples
-- ============================================

INSERT INTO public.database_configs (name, url, anon_key, project_id, is_active)
VALUES (
  'Base 1',
  'https://zdrgvdlfhrbynpkvtyhx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkcmd2ZGxmaHJieW5wa3Z0eWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDU2OTEsImV4cCI6MjA4MDI4MTY5MX0.MzCe3coYsKtl5knDRE2zrmTSomu58nMVVUokj5QMToM',
  'zdrgvdlfhrbynpkvtyhx',
  true
);

INSERT INTO public.database_configs (name, url, anon_key, project_id, is_active)
VALUES (
  'Base 2',
  'https://zldeaozqxjwvzgrblyrh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGVhb3pxeGp3dnpncmJseXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNDQyNDYsImV4cCI6MjA2ODkyMDI0Nn0.4KmrswdBfTyHLqrUt9NdCBUjDPKCeO2NN7Vvqepr4xM',
  'zldeaozqxjwvzgrblyrh',
  false
);

-- ============================================
-- OPÇÃO 2: Se a tabela JÁ TEM DADOS, use UPDATE
-- ============================================

-- Atualizar Base 1
UPDATE public.database_configs
SET 
  url = 'https://zdrgvdlfhrbynpkvtyhx.supabase.co',
  anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkcmd2ZGxmaHJieW5wa3Z0eWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDU2OTEsImV4cCI6MjA4MDI4MTY5MX0.MzCe3coYsKtl5knDRE2zrmTSomu58nMVVUokj5QMToM',
  project_id = 'zdrgvdlfhrbynpkvtyhx',
  is_active = true,
  updated_at = now()
WHERE name = 'Base 1';

-- Atualizar Base 2
UPDATE public.database_configs
SET 
  url = 'https://zldeaozqxjwvzgrblyrh.supabase.co',
  anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGVhb3pxeGp3dnpncmJseXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNDQyNDYsImV4cCI6MjA2ODkyMDI0Nn0.4KmrswdBfTyHLqrUt9NdCBUjDPKCeO2NN7Vvqepr4xM',
  project_id = 'zldeaozqxjwvzgrblyrh',
  is_active = false,
  updated_at = now()
WHERE name = 'Base 2';

-- Se Base 2 não existir, insira
INSERT INTO public.database_configs (name, url, anon_key, project_id, is_active)
SELECT 
  'Base 2',
  'https://zldeaozqxjwvzgrblyrh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGVhb3pxeGp3dnpncmJseXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNDQyNDYsImV4cCI6MjA2ODkyMDI0Nn0.4KmrswdBfTyHLqrUt9NdCBUjDPKCeO2NN7Vvqepr4xM',
  'zldeaozqxjwvzgrblyrh',
  false
WHERE NOT EXISTS (SELECT 1 FROM public.database_configs WHERE name = 'Base 2');

-- Verificar resultado
SELECT id, name, url, project_id, is_active, created_at, updated_at 
FROM public.database_configs 
ORDER BY name;

