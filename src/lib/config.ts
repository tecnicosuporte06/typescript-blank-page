/**
 * Configuração centralizada da aplicação
 * Valores do projeto Supabase conectado
 */

// Configuração do Supabase (valores do projeto conectado)
const SUPABASE_URL = "https://zdrgvdlfhrbynpkvtyhx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkcmd2ZGxmaHJieW5wa3Z0eWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDU2OTEsImV4cCI6MjA4MDI4MTY5MX0.MzCe3coYsKtl5knDRE2zrmTSomu58nMVVUokj5QMToM";
const SUPABASE_PROJECT_ID = "zdrgvdlfhrbynpkvtyhx";

/**
 * Obtém a URL do Supabase
 */
export function getSupabaseUrl(): string {
  return SUPABASE_URL;
}

/**
 * Obtém a chave pública (anon key) do Supabase
 */
export function getSupabaseAnonKey(): string {
  return SUPABASE_ANON_KEY;
}

/**
 * Obtém o Project ID do Supabase
 */
export function getSupabaseProjectId(): string {
  return SUPABASE_PROJECT_ID;
}

/**
 * Constrói a URL completa de uma função Supabase Edge Function
 * @param functionName Nome da função (ex: 'evolution-webhook-v2')
 */
export function getSupabaseFunctionUrl(functionName: string): string {
  return `${SUPABASE_URL}/functions/v1/${functionName}`;
}

/**
 * Configuração centralizada exportada
 */
export const config = {
  supabase: {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    projectId: SUPABASE_PROJECT_ID,
    getFunctionUrl: getSupabaseFunctionUrl,
  },
};
