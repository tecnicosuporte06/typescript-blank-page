-- =====================================================
-- CONFIGURAR URL DO WEBHOOK DO DISPARADOR
-- =====================================================
-- Execute este SQL no SQL Editor do Supabase
-- Substitua a URL abaixo pela URL real do seu webhook do n8n
-- =====================================================

-- 1) Primeiro, criar a tabela se ainda não existir
CREATE TABLE IF NOT EXISTS public.disparador_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Inserir/atualizar a URL do webhook
-- SUBSTITUA 'https://seu-n8n.com/webhook/xxx' PELA SUA URL REAL
INSERT INTO public.disparador_settings (key, value, description)
VALUES (
  'n8n_webhook_url',
  'https://seu-n8n.com/webhook/xxx',  -- <<< COLOQUE SUA URL AQUI
  'URL do webhook do n8n para disparo de campanhas'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- 3) Verificar se foi salvo corretamente
SELECT * FROM public.disparador_settings WHERE key = 'n8n_webhook_url';
