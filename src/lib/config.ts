/**
 * Configuração centralizada da aplicação
 * Todas as URLs e chaves são carregadas de variáveis de ambiente
 */

/**
 * Obtém a URL do Supabase das variáveis de ambiente
 * Fallback para desenvolvimento local se necessário
 */
export function getSupabaseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL;
  
  if (!url) {
    throw new Error(
      'VITE_SUPABASE_URL não está configurada. ' +
      'Configure a variável de ambiente VITE_SUPABASE_URL no arquivo .env'
    );
  }
  
  return url;
}

/**
 * Obtém a chave pública (anon key) do Supabase das variáveis de ambiente
 */
export function getSupabaseAnonKey(): string {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (!key) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY não está configurada. ' +
      'Configure a variável de ambiente VITE_SUPABASE_ANON_KEY no arquivo .env'
    );
  }
  
  return key;
}

/**
 * Extrai o Project ID da URL do Supabase
 * Exemplo: https://zldeaozqxjwvzgrblyrh.supabase.co -> zldeaozqxjwvzgrblyrh
 */
export function getSupabaseProjectId(): string {
  const url = getSupabaseUrl();
  const match = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
  
  if (!match || !match[1]) {
    throw new Error(
      'Não foi possível extrair o Project ID da URL do Supabase. ' +
      'A URL deve estar no formato: https://PROJECT_ID.supabase.co'
    );
  }
  
  return match[1];
}

/**
 * Constrói a URL completa de uma função Supabase Edge Function
 * @param functionName Nome da função (ex: 'evolution-webhook-v2')
 */
export function getSupabaseFunctionUrl(functionName: string): string {
  const baseUrl = getSupabaseUrl();
  return `${baseUrl}/functions/v1/${functionName}`;
}

/**
 * Configuração centralizada exportada
 */
export const config = {
  supabase: {
    url: getSupabaseUrl(),
    anonKey: getSupabaseAnonKey(),
    projectId: getSupabaseProjectId(),
    getFunctionUrl: getSupabaseFunctionUrl,
  },
};

