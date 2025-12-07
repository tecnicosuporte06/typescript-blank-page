import { useState, useEffect, useCallback } from 'react';
import { supabase, recreateSupabaseClient } from '@/integrations/supabase/client';
import {
  getAllDatabaseConfigs,
  switchDatabase,
  fetchActiveDatabaseConfig,
  updateDatabaseConfig
} from '@/lib/config';
import { useToast } from '@/hooks/use-toast';

export interface DatabaseConfig {
  id: string;
  name: string;
  url: string;
  projectId: string;
  anonKey?: string;
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
        recreateSupabaseClient();
        
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

      const { error: updateError } = await (supabase as any)
        .from('database_configs')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        console.error('❌ [updateConfig] Erro ao atualizar:', updateError);
        throw updateError;
      }

      console.log('✅ [updateConfig] Configuração atualizada com sucesso');

      // Sempre atualizar a lista após edição para refletir mudanças (incluindo nome)
      await refreshConfigs();

      // Se foi marcado como ativo, garantir que apenas este esteja ativo
      if (updates.isActive === true) {
        // Se o nome mudou, usar o novo nome para alternar
        const configToSwitch = configs.find(c => c.id === id);
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
      console.error('Erro ao atualizar configuração:', err);
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

      // Buscar anonKey do banco se não estiver disponível
      let anonKey = config.anonKey;
      if (!anonKey) {
        const { data: configData } = await (supabase as any)
          .from('database_configs')
          .select('anon_key')
          .eq('id', config.id)
          .single();
        anonKey = configData?.anon_key;
      }

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

  // Carregar configurações ao montar o hook
  useEffect(() => {
    refreshConfigs();
  }, [refreshConfigs]);

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

