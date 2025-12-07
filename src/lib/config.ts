/**
 * Configuração centralizada da aplicação
 * Valores do projeto Supabase conectado
 * 
 * Este arquivo suporta configuração dinâmica através da tabela database_configs,
 * com cache em localStorage e fallback para valores hardcoded.
 */

// Chave para armazenar configuração em cache
const CACHE_KEY = 'tezeus_database_config';
const CACHE_TIMESTAMP_KEY = 'tezeus_database_config_timestamp';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Valores padrão (fallback) - Base 1 (2.1 tester)
const DEFAULT_CONFIG = {
  url: "https://zdrgvdlfhrbynpkvtyhx.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkcmd2ZGxmaHJieW5wa3Z0eWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDU2OTEsImV4cCI6MjA4MDI4MTY5MX0.MzCe3coYsKtl5knDRE2zrmTSomu58nMVVUokj5QMToM",
  projectId: "zdrgvdlfhrbynpkvtyhx"
};

// Configuração alternativa - Base 2 (2.0 com clientes)
const ALTERNATIVE_CONFIG = {
  url: "https://zldeaozqxjwvzgrblyrh.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGVhb3pxeGp3dnpncmJseXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzNDQyNDYsImV4cCI6MjA2ODkyMDI0Nn0.4KmrswdBfTyHLqrUt9NdCBUjDPKCeO2NN7Vvqepr4xM",
  projectId: "zldeaozqxjwvzgrblyrh"
};

// Tipo para configuração de banco
interface DatabaseConfig {
  url: string;
  anonKey: string;
  projectId: string;
}

// Estado global da configuração (inicializado com cache ou padrão)
let currentConfig: DatabaseConfig = getCachedConfig() || DEFAULT_CONFIG;

/**
 * Obtém configuração do cache (localStorage)
 */
function getCachedConfig(): DatabaseConfig | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp, 10);
      if (age < CACHE_TTL) {
        return JSON.parse(cached);
      }
    }
  } catch (error) {
    console.warn('Erro ao ler cache de configuração:', error);
  }
  
  return null;
}

/**
 * Salva configuração no cache (localStorage)
 */
function setCachedConfig(config: DatabaseConfig): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(config));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.warn('Erro ao salvar cache de configuração:', error);
  }
}

/**
 * Busca configuração ativa do banco de dados
 * Esta função é assíncrona e deve ser chamada quando o cliente Supabase já estiver disponível
 */
export async function fetchActiveDatabaseConfig(): Promise<DatabaseConfig | null> {
  if (typeof window === 'undefined') return null;
  
  try {
    // Importação dinâmica para evitar dependência circular
    const { supabase } = await import('@/integrations/supabase/client');
    
    const result = await (supabase as any)
      .from('database_configs')
      .select('url, anon_key, project_id')
      .eq('is_active', true)
      .single();
    
    if (result.error || !result.data) {
      console.warn('Erro ao buscar configuração do banco:', result.error);
      return null;
    }
    
    const config: DatabaseConfig = {
      url: result.data.url,
      anonKey: result.data.anon_key,
      projectId: result.data.project_id
    };
    
    // Atualizar cache e estado global
    setCachedConfig(config);
    currentConfig = config;
    
    return config;
  } catch (error) {
    console.warn('Erro ao buscar configuração do banco:', error);
    return null;
  }
}

/**
 * Atualiza a configuração ativa manualmente
 */
export function updateDatabaseConfig(config: DatabaseConfig): void {
  currentConfig = config;
  setCachedConfig(config);
}

/**
 * Obtém a URL do Supabase
 * Retorna a configuração atual (cache ou padrão)
 */
export function getSupabaseUrl(): string {
  return currentConfig.url;
}

/**
 * Obtém a chave pública (anon key) do Supabase
 * Retorna a configuração atual (cache ou padrão)
 */
export function getSupabaseAnonKey(): string {
  return currentConfig.anonKey;
}

/**
 * Obtém o Project ID do Supabase
 * Retorna a configuração atual (cache ou padrão)
 */
export function getSupabaseProjectId(): string {
  return currentConfig.projectId;
}

/**
 * Constrói a URL completa de uma função Supabase Edge Function
 * @param functionName Nome da função (ex: 'evolution-webhook-v2')
 */
export function getSupabaseFunctionUrl(functionName: string): string {
  return `${currentConfig.url}/functions/v1/${functionName}`;
}

/**
 * Alterna para uma configuração de banco específica
 * @param databaseName Nome da configuração ('Base 1' ou 'Base 2')
 */
export async function switchDatabase(databaseName: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Buscar configuração pelo nome
    const fetchResult = await (supabase as any)
      .from('database_configs')
      .select('url, anon_key, project_id')
      .eq('name', databaseName)
      .single();
    
    if (fetchResult.error || !fetchResult.data) {
      console.error('Erro ao buscar configuração:', fetchResult.error);
      return false;
    }
    
    // Atualizar is_active na tabela
    const updateResult = await (supabase as any)
      .from('database_configs')
      .update({ is_active: false })
      .neq('name', databaseName);
    
    if (updateResult.error) {
      console.error('Erro ao desativar outras configurações:', updateResult.error);
    }
    
    const activateResult = await (supabase as any)
      .from('database_configs')
      .update({ is_active: true })
      .eq('name', databaseName);
    
    if (activateResult.error) {
      console.error('Erro ao ativar configuração:', activateResult.error);
      return false;
    }
    
    // Atualizar cache e estado
    const newConfig: DatabaseConfig = {
      url: fetchResult.data.url,
      anonKey: fetchResult.data.anon_key,
      projectId: fetchResult.data.project_id
    };
    
    updateDatabaseConfig(newConfig);
    
    return true;
  } catch (error) {
    console.error('Erro ao alternar banco:', error);
    return false;
  }
}

/**
 * Obtém todas as configurações de banco disponíveis
 */
export async function getAllDatabaseConfigs(): Promise<Array<{ id: string; name: string; url: string; projectId: string; isActive: boolean }> | null> {
  if (typeof window === 'undefined') return null;
  
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    console.log('🔍 [getAllDatabaseConfigs] Buscando configurações de banco...');
    
    const result = await (supabase as any)
      .from('database_configs')
      .select('id, name, url, project_id, is_active')
      .order('name');
    
    console.log('📦 [getAllDatabaseConfigs] Resultado:', {
      hasError: !!result.error,
      error: result.error,
      dataLength: result.data?.length || 0,
      data: result.data
    });
    
    if (result.error) {
      console.error('❌ [getAllDatabaseConfigs] Erro ao buscar configurações:', result.error);
      throw new Error(result.error.message || 'Erro ao buscar configurações');
    }
    
    if (!result.data || result.data.length === 0) {
      console.warn('⚠️ [getAllDatabaseConfigs] Nenhuma configuração encontrada');
      return [];
    }
    
    const mapped = result.data.map((config: any) => ({
      id: config.id,
      name: config.name,
      url: config.url,
      projectId: config.project_id,
      isActive: config.is_active
    }));
    
    console.log('✅ [getAllDatabaseConfigs] Configurações mapeadas:', mapped);
    return mapped;
  } catch (error) {
    console.error('❌ [getAllDatabaseConfigs] Erro capturado:', error);
    throw error;
  }
}

/**
 * Configuração centralizada exportada
 * Usa valores dinâmicos quando disponíveis
 */
export const config = {
  supabase: {
    get url() {
      return currentConfig.url;
    },
    get anonKey() {
      return currentConfig.anonKey;
    },
    get projectId() {
      return currentConfig.projectId;
    },
    getFunctionUrl: getSupabaseFunctionUrl,
  },
};

// Inicializar: tentar buscar do banco quando possível (não bloqueia a inicialização)
if (typeof window !== 'undefined') {
  // Aguardar um pouco para garantir que o cliente Supabase esteja disponível
  setTimeout(() => {
    fetchActiveDatabaseConfig().catch(() => {
      // Silenciosamente falha se não conseguir buscar
    });
  }, 1000);
}
