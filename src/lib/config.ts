/**
 * Configuração centralizada da aplicação
 * Valores do projeto Supabase conectado
 * 
 * Este arquivo suporta configuração dinâmica através da tabela database_configs,
 * com cache em localStorage e fallback para valores hardcoded.
 */

// Chave para armazenar configuração em cache (apenas para performance, sempre validar com banco)
const CACHE_KEY = 'tezeus_database_config';
const CACHE_TIMESTAMP_KEY = 'tezeus_database_config_timestamp';
const CACHE_TTL = 30 * 1000; // 30 segundos apenas (cache muito curto para garantir sincronização)

// Valores padrão (fallback apenas em caso de erro crítico) - Base 1 (2.1 tester)
const DEFAULT_CONFIG = {
  url: "https://zdrgvdlfhrbynpkvtyhx.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkcmd2ZGxmaHJieW5wa3Z0eWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDU2OTEsImV4cCI6MjA4MDI4MTY5MX0.MzCe3coYsKtl5knDRE2zrmTSomu58nMVVUokj5QMToM",
  projectId: "zdrgvdlfhrbynpkvtyhx"
};

// Tipo para configuração de banco
interface DatabaseConfig {
  url: string;
  anonKey: string;
  projectId: string;
}

// Estado global da configuração (inicializado com padrão, será atualizado do banco)
let currentConfig: DatabaseConfig = DEFAULT_CONFIG;
let configLoaded = false; // Flag para indicar se já carregou do banco

/**
 * Obtém configuração do cache (localStorage)
 * NOTA: Cache é apenas para performance. SEMPRE validar com banco de dados.
 * O cache não deve ser usado como fonte de verdade, apenas para evitar queries desnecessárias.
 */
function getCachedConfig(): DatabaseConfig | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp, 10);
      // Cache muito curto (30 segundos) para garantir sincronização GLOBAL
      if (age < CACHE_TTL) {
        console.log('📦 [getCachedConfig] Usando cache (idade:', Math.round(age/1000), 's)');
        return JSON.parse(cached);
      } else {
        console.log('⏰ [getCachedConfig] Cache expirado, será buscado do banco');
      }
    }
  } catch (error) {
    console.warn('⚠️ [getCachedConfig] Erro ao ler cache de configuração:', error);
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
 * SEMPRE busca do banco de dados (não usa cache) para garantir que seja GLOBAL
 * Esta função é assíncrona e deve ser chamada quando o cliente Supabase já estiver disponível
 */
export async function fetchActiveDatabaseConfig(forceRefresh: boolean = false): Promise<DatabaseConfig | null> {
  if (typeof window === 'undefined') return null;
  
  try {
    // Importação dinâmica para evitar dependência circular
    const { supabase } = await import('@/integrations/supabase/client');
    
    console.log('🔍 [fetchActiveDatabaseConfig] Buscando configuração ativa do banco de dados (GLOBAL)...');
    
    const result = await (supabase as any)
      .from('database_configs')
      .select('url, anon_key, project_id')
      .eq('is_active', true)
      .single();
    
    if (result.error || !result.data) {
      console.warn('⚠️ [fetchActiveDatabaseConfig] Erro ao buscar configuração do banco:', result.error);
      
      // Se não conseguir buscar do banco, tentar usar cache como último recurso
      const cached = getCachedConfig();
      if (cached) {
        console.warn('⚠️ [fetchActiveDatabaseConfig] Usando cache como fallback');
        currentConfig = cached;
        return cached;
      }
      
      // Se não tem cache, usar padrão
      console.warn('⚠️ [fetchActiveDatabaseConfig] Usando configuração padrão como último recurso');
      currentConfig = DEFAULT_CONFIG;
      return DEFAULT_CONFIG;
    }
    
    const config: DatabaseConfig = {
      url: result.data.url,
      anonKey: result.data.anon_key,
      projectId: result.data.project_id
    };
    
    console.log('✅ [fetchActiveDatabaseConfig] Configuração ativa encontrada:', config.url);
    
    // Atualizar cache e estado global (cache apenas para performance, mas sempre validar com banco)
    setCachedConfig(config);
    currentConfig = config;
    configLoaded = true;
    
    return config;
  } catch (error) {
    console.error('❌ [fetchActiveDatabaseConfig] Erro ao buscar configuração do banco:', error);
    
    // Em caso de erro, tentar cache
    const cached = getCachedConfig();
    if (cached) {
      console.warn('⚠️ [fetchActiveDatabaseConfig] Usando cache devido a erro');
      currentConfig = cached;
      return cached;
    }
    
    // Último recurso: usar padrão
    currentConfig = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
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
 * Se ainda não carregou do banco, retorna padrão (será atualizado quando buscar do banco)
 */
export function getSupabaseUrl(): string {
  return currentConfig.url;
}

/**
 * Obtém a chave pública (anon key) do Supabase
 * Se ainda não carregou do banco, retorna padrão (será atualizado quando buscar do banco)
 */
export function getSupabaseAnonKey(): string {
  return currentConfig.anonKey;
}

/**
 * Obtém o Project ID do Supabase
 * Se ainda não carregou do banco, retorna padrão (será atualizado quando buscar do banco)
 */
export function getSupabaseProjectId(): string {
  return currentConfig.projectId;
}

/**
 * Verifica se a configuração já foi carregada do banco
 */
export function isConfigLoaded(): boolean {
  return configLoaded;
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
export async function getAllDatabaseConfigs(): Promise<Array<{ id: string; name: string; url: string; projectId: string; anonKey: string; isActive: boolean }> | null> {
  if (typeof window === 'undefined') return null;
  
  // Função de retry
  const retryQuery = async (attempt: number = 0): Promise<any> => {
    const maxAttempts = 3;
    const baseDelay = 1000;
    
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Verificar se há sessão ativa
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('⚠️ [getAllDatabaseConfigs] Sem sessão ativa, tentando buscar mesmo assim...');
      }
      
      console.log(`🔍 [getAllDatabaseConfigs] Tentativa ${attempt + 1}/${maxAttempts} - Buscando configurações...`);
      
      // Criar um timeout para evitar queries que ficam penduradas
      const queryPromise = (supabase as any)
        .from('database_configs')
        .select('id, name, url, project_id, anon_key, is_active')
        .order('name');
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout após 10 segundos')), 10000)
      );
      
      const result = await Promise.race([queryPromise, timeoutPromise]) as any;
      
      console.log('📦 [getAllDatabaseConfigs] Resultado:', {
        hasError: !!result.error,
        error: result.error,
        dataLength: result.data?.length || 0,
        data: result.data
      });
      
      if (result.error) {
        // Erros específicos que não devem fazer retry
        const noRetryErrors = [
          'permission denied',
          'new row violates row-level security policy',
          'relation "database_configs" does not exist'
        ];
        
        const shouldRetry = !noRetryErrors.some(err => 
          result.error.message?.toLowerCase().includes(err)
        );
        
        if (!shouldRetry || attempt >= maxAttempts - 1) {
          console.error('❌ [getAllDatabaseConfigs] Erro ao buscar configurações:', result.error);
          throw new Error(result.error.message || 'Erro ao buscar configurações');
        }
        
        // Fazer retry com backoff exponencial
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`⚠️ [getAllDatabaseConfigs] Erro na tentativa ${attempt + 1}, tentando novamente em ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryQuery(attempt + 1);
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
        anonKey: config.anon_key || '', // Incluir anon_key para evitar query adicional
        isActive: config.is_active
      }));
      
      console.log('✅ [getAllDatabaseConfigs] Configurações mapeadas:', mapped);
      return mapped;
    } catch (error: any) {
      // Se for timeout ou erro de conexão, tentar novamente
      const isRetryableError = 
        error?.message?.includes('timeout') ||
        error?.message?.includes('Failed to fetch') ||
        error?.message?.includes('NetworkError') ||
        error?.code === 'ECONNREFUSED';
      
      if (isRetryableError && attempt < maxAttempts - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`⚠️ [getAllDatabaseConfigs] Erro de conexão na tentativa ${attempt + 1}, tentando novamente em ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryQuery(attempt + 1);
      }
      
      console.error('❌ [getAllDatabaseConfigs] Erro capturado:', error);
      throw error;
    }
  };
  
  return await retryQuery();
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
