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
 * Inicializa o cliente Supabase com a configuração correta
 * Busca a configuração ativa do banco e recria o cliente se necessário
 * Deve ser chamada após o carregamento da página
 */
export async function initializeSupabaseClient(): Promise<void> {
  try {
    console.log('🔄 [initializeSupabaseClient] Inicializando cliente Supabase...');
    
    // Importar dinamicamente para evitar dependência circular
    const { fetchActiveDatabaseConfig } = await import('@/lib/config');
    
    // Buscar configuração ativa do banco
    const activeConfig = await fetchActiveDatabaseConfig();
    
    if (activeConfig) {
      console.log('✅ [initializeSupabaseClient] Configuração ativa encontrada:', activeConfig.url);
      
      // Verificar se a configuração atual do cliente é diferente
      const currentUrl = getSupabaseUrl();
      const currentKey = getSupabaseAnonKey();
      
      if (currentUrl !== activeConfig.url || currentKey !== activeConfig.anonKey) {
        console.log('🔄 [initializeSupabaseClient] Configuração diferente detectada, recriando cliente...');
        await recreateSupabaseClient();
      } else {
        console.log('✅ [initializeSupabaseClient] Cliente já está com a configuração correta');
      }
    } else {
      console.warn('⚠️ [initializeSupabaseClient] Nenhuma configuração ativa encontrada, usando padrão');
    }
  } catch (error) {
    console.error('❌ [initializeSupabaseClient] Erro ao inicializar cliente:', error);
    // Continuar com o cliente padrão em caso de erro
  }
}

/**
 * Recria o cliente Supabase com a configuração atual
 * Útil quando a configuração de banco é alterada dinamicamente
 */
export async function recreateSupabaseClient(): Promise<SupabaseClient<Database>> {
  console.log('🔄 [recreateSupabaseClient] Recriando cliente Supabase...');
  
  // Preservar sessão atual se existir
  let currentSession = null;
  try {
    const { data } = await supabaseInstance.auth.getSession();
    currentSession = data.session;
  } catch (error) {
    console.warn('⚠️ [recreateSupabaseClient] Erro ao obter sessão atual:', error);
  }

  // Fechar conexões do cliente anterior se necessário
  try {
    const channels = supabaseInstance.getChannels();
    channels.forEach(channel => {
      supabaseInstance.removeChannel(channel);
    });
  } catch (error) {
    console.warn('⚠️ [recreateSupabaseClient] Erro ao limpar canais do cliente anterior:', error);
  }

  // Criar novo cliente com configuração atualizada
  supabaseInstance = createSupabaseClient();
  
  // Se havia uma sessão, tentar restaurá-la (se o novo banco suportar)
  // Nota: A sessão pode não ser válida no novo banco, mas tentamos preservar
  if (currentSession) {
    try {
      // A sessão será validada automaticamente pelo cliente Supabase
      console.log('🔄 [recreateSupabaseClient] Sessão preservada, será validada pelo novo cliente');
    } catch (error) {
      console.warn('⚠️ [recreateSupabaseClient] Erro ao restaurar sessão:', error);
    }
  }
  
  console.log('✅ [recreateSupabaseClient] Cliente recriado com sucesso');
  return supabaseInstance;
}

/**
 * Cliente Supabase exportado
 * Este é o cliente principal usado em toda a aplicação
 * Usa um Proxy para sempre acessar a instância atual, mesmo após recriação
 */
export const supabase: SupabaseClient<Database> = new Proxy(supabaseInstance, {
  get(target, prop, receiver) {
    // Sempre retornar da instância atual (pode ter sido recriada)
    return Reflect.get(supabaseInstance, prop, receiver);
  },
  set(target, prop, value, receiver) {
    // Sempre definir na instância atual
    return Reflect.set(supabaseInstance, prop, value, receiver);
  }
}) as SupabaseClient<Database>;

/**
 * Obtém o cliente Supabase atual (pode ser recriado dinamicamente)
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  return supabaseInstance;
}