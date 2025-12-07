import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/config';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

/**
 * Cria uma nova instância do cliente Supabase com a configuração atual
 */
function createSupabaseClient(): SupabaseClient<Database> {
  const SUPABASE_URL = getSupabaseUrl();
  const SUPABASE_PUBLISHABLE_KEY = getSupabaseAnonKey();

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    global: {
      headers: {
        'x-client-info': 'tezeus-crm',
      },
    },
  });
}

// Cliente Supabase principal (inicializado na importação)
let supabaseInstance: SupabaseClient<Database> = createSupabaseClient();

/**
 * Recria o cliente Supabase com a configuração atual
 * Útil quando a configuração de banco é alterada dinamicamente
 */
export function recreateSupabaseClient(): SupabaseClient<Database> {
  // Fechar conexões do cliente anterior se necessário
  try {
    const channels = supabaseInstance.getChannels();
    channels.forEach(channel => {
      supabaseInstance.removeChannel(channel);
    });
  } catch (error) {
    console.warn('Erro ao limpar canais do cliente anterior:', error);
  }

  // Criar novo cliente com configuração atualizada
  supabaseInstance = createSupabaseClient();
  return supabaseInstance;
}

/**
 * Cliente Supabase exportado
 * Este é o cliente principal usado em toda a aplicação
 */
export const supabase = supabaseInstance;

/**
 * Obtém o cliente Supabase atual (pode ser recriado dinamicamente)
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  return supabaseInstance;
}