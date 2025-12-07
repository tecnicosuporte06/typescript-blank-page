import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, recreateSupabaseClient } from '@/integrations/supabase/client';
import {
  getAllDatabaseConfigs,
  switchDatabase,
  fetchActiveDatabaseConfig,
  updateDatabaseConfig
} from '@/lib/config';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface DatabaseConfig {
  id: string;
  name: string;
  url: string;
  projectId: string;
  anonKey: string; // Agora sempre presente (não opcional)
  isActive: boolean;
}

interface UseDatabaseConfigReturn {
  configs: DatabaseConfig[];
  activeConfig: DatabaseConfig | null;
  loading: boolean;
  error: string | null;
  refreshConfigs: () => Promise<void>;
  switchToDatabase: (databaseName: string) => Promise<boolean>;
  updateConfig: (id: string, updates: Partial<DatabaseConfig>) => Promise<boolean>;
  testConnection: (config: DatabaseConfig) => Promise<boolean>;
}

/**
 * Hook para gerenciar configurações de bancos de dados
 * Permite visualizar, alternar e editar configurações de banco
 */
export function useDatabaseConfig(): UseDatabaseConfigReturn {
  const [configs, setConfigs] = useState<DatabaseConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<DatabaseConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const hasLoadedRef = useRef(false);

  /**
   * Busca todas as configurações de banco
   */
  const refreshConfigs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔄 [useDatabaseConfig] Iniciando busca de configurações...');
      const data = await getAllDatabaseConfigs();
      
      console.log('📊 [useDatabaseConfig] Dados recebidos:', data);
      
      if (data && data.length > 0) {
        setConfigs(data);
        const active = data.find(c => c.isActive);
        setActiveConfig(active || null);
        console.log('✅ [useDatabaseConfig] Configurações carregadas:', data.length, 'ativa:', active?.name);
      } else {
        setConfigs([]);
        setActiveConfig(null);
        console.warn('⚠️ [useDatabaseConfig] Nenhuma configuração encontrada');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar configurações';
      setError(errorMessage);
      console.error('❌ [useDatabaseConfig] Erro ao buscar configurações:', err);
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  /**
   * Alterna para uma configuração de banco específica
   */
  const switchToDatabase = useCallback(async (databaseName: string): Promise<boolean> => {
    try {
      setError(null);

      const success = await switchDatabase(databaseName);
      
      if (success) {
        // Recriar cliente Supabase com nova configuração
        await recreateSupabaseClient();
        
        // Atualizar lista de configurações
        await refreshConfigs();
        
        // Buscar configuração ativa atualizada
        const activeConfigData = await fetchActiveDatabaseConfig();
        if (activeConfigData) {
          updateDatabaseConfig(activeConfigData);
        }
        
        toast({
          title: 'Sucesso',
          description: `Banco de dados alterado para ${databaseName}`,
        });
        
        // Recarregar página após um breve delay para aplicar mudanças
        setTimeout(() => {
          window.location.reload();
        }, 1000);
        
        return true;
      } else {
        throw new Error('Falha ao alternar banco de dados');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao alternar banco de dados';
      setError(errorMessage);
      console.error('Erro ao alternar banco:', err);
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    }
  }, [refreshConfigs, toast]);

  /**
   * Atualiza uma configuração de banco
   */
  const updateConfig = useCallback(async (
    id: string,
    updates: Partial<DatabaseConfig>
  ): Promise<boolean> => {
    try {
      setError(null);

      // Verificar se há sessão ativa antes de tentar atualizar
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('⚠️ [updateConfig] Sem sessão ativa, tentando continuar mesmo assim...');
      }

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.name !== undefined) {
        updateData.name = updates.name;
        console.log('📝 [updateConfig] Atualizando nome para:', updates.name);
      }
      if (updates.url !== undefined) updateData.url = updates.url;
      if (updates.projectId !== undefined) updateData.project_id = updates.projectId;
      if (updates.anonKey !== undefined) updateData.anon_key = updates.anonKey;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

      console.log('💾 [updateConfig] Dados para atualizar:', updateData);
      console.log('🔍 [updateConfig] Usando cliente Supabase com URL:', (supabase as any).supabaseUrl);

      const { error: updateError } = await (supabase as any)
        .from('database_configs')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        console.error('❌ [updateConfig] Erro ao atualizar:', updateError);
        
        // Se o erro for de permissão ou RLS, pode ser que o cliente não esteja sincronizado
        if (updateError.message?.includes('permission') || updateError.message?.includes('row-level security')) {
          console.warn('⚠️ [updateConfig] Erro de permissão detectado. Tentando recriar cliente e tentar novamente...');
          
          // Recriar cliente e tentar novamente
          await recreateSupabaseClient();
          
          // Aguardar um pouco para o cliente ser recriado
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Tentar novamente
          const { error: retryError } = await (supabase as any)
            .from('database_configs')
            .update(updateData)
            .eq('id', id);
          
          if (retryError) {
            throw retryError;
          }
        } else {
          throw updateError;
        }
      }

      console.log('✅ [updateConfig] Configuração atualizada com sucesso');

      // Sempre atualizar a lista após edição para refletir mudanças (incluindo nome)
      await refreshConfigs();

      // Se foi marcado como ativo, garantir que apenas este esteja ativo
      if (updates.isActive === true) {
        // Buscar configuração atualizada após refresh
        const updatedConfigs = await getAllDatabaseConfigs();
        const configToSwitch = updatedConfigs?.find(c => c.id === id);
        const newName = updates.name || configToSwitch?.name || '';
        if (newName) {
          await switchToDatabase(newName);
        }
      }

      toast({
        title: 'Sucesso',
        description: 'Configuração atualizada com sucesso',
      });

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar configuração';
      setError(errorMessage);
      console.error('❌ [updateConfig] Erro ao atualizar configuração:', err);
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    }
  }, [switchToDatabase, refreshConfigs, toast]);

  /**
   * Testa conexão com uma configuração de banco
   */
  const testConnection = useCallback(async (config: DatabaseConfig): Promise<boolean> => {
    try {
      setError(null);

      // A anonKey já vem na lista de configurações, não precisa buscar
      const anonKey = config.anonKey;

      if (!anonKey) {
        throw new Error('Chave anon não encontrada para esta configuração');
      }

      // Criar cliente temporário para testar
      const { createClient } = await import('@supabase/supabase-js');
      const testClient = createClient(config.url, anonKey, {
        auth: {
          persistSession: false,
        },
      });

      // Tentar uma query simples
      const { error: testError } = await testClient
        .from('database_configs')
        .select('id')
        .limit(1);

      if (testError) {
        throw testError;
      }

      toast({
        title: 'Sucesso',
        description: 'Conexão testada com sucesso',
      });

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao testar conexão';
      setError(errorMessage);
      console.error('Erro ao testar conexão:', err);
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  // Carregar configurações ao montar o hook e quando o usuário estiver disponível
  useEffect(() => {
    // Não carregar se já carregou ou se não há usuário ainda
    if (hasLoadedRef.current) return;
    
    // Aguardar usuário estar disponível (importante para RLS)
    if (!user) {
      console.log('⏳ [useDatabaseConfig] Aguardando usuário para carregar configurações...');
      return;
    }
    
    // Inicializar cliente Supabase e carregar configurações
    const initializeAndLoad = async () => {
      try {
        // Garantir que o cliente está inicializado com a configuração correta
        const { initializeSupabaseClient } = await import('@/integrations/supabase/client');
        await initializeSupabaseClient();
        
        // Aguardar um pouco para garantir que o cliente Supabase esteja pronto
        await new Promise(resolve => setTimeout(resolve, 300));
        
        console.log('🔄 [useDatabaseConfig] Iniciando carregamento inicial...');
        hasLoadedRef.current = true;
        await refreshConfigs();
      } catch (err) {
        console.error('❌ [useDatabaseConfig] Erro no carregamento inicial:', err);
      }
    };
    
    initializeAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Depender apenas do usuário, refreshConfigs é estável

  return {
    configs,
    activeConfig,
    loading,
    error,
    refreshConfigs,
    switchToDatabase,
    updateConfig,
    testConnection,
  };
}

