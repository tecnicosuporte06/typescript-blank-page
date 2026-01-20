import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DisconnectedConnection {
  id: string;
  instance_name: string;
  phone_number: string | null;
  status: string;
}

export function useDisconnectedConnections(workspaceId: string) {
  const [disconnectedConnections, setDisconnectedConnections] = useState<DisconnectedConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastWorkspaceIdRef = useRef<string>('');

  const fetchDisconnectedConnections = useCallback(async (forceRefresh = false) => {
    console.log('[useDisconnectedConnections] fetchDisconnectedConnections chamado - workspaceId:', workspaceId, 'forceRefresh:', forceRefresh);
    
    if (!workspaceId) {
      console.log('[useDisconnectedConnections] workspaceId vazio, retornando');
      setDisconnectedConnections([]);
      return;
    }

    setIsLoading(true);
    try {
      // Adicionar timestamp para evitar cache
      const timestamp = Date.now();
      
      // Buscar TODAS as conexões do workspace
      const { data: allConnections, error: allError } = await supabase
        .from('connections')
        .select('id, instance_name, phone_number, status')
        .eq('workspace_id', workspaceId);
      
      if (allError) {
        console.error('[useDisconnectedConnections] Erro ao buscar conexões:', allError);
        return;
      }
      
      console.log('[useDisconnectedConnections] TODAS as conexões do workspace:', allConnections);
      console.log('[useDisconnectedConnections] Status de cada conexão:', allConnections?.map(c => ({ name: c.instance_name, status: c.status })));

      // Filtrar conexões desconectadas (aceita múltiplos formatos de status)
      const disconnectedStatuses = ['disconnected', 'desconectado', 'offline', 'error', 'erro'];
      const disconnected = allConnections?.filter(conn => {
        const status = conn.status?.toLowerCase()?.trim();
        return disconnectedStatuses.includes(status || '');
      }) || [];

      console.log('[useDisconnectedConnections] Conexões desconectadas filtradas:', disconnected.length, disconnected);
      setDisconnectedConnections(disconnected);
    } catch (error) {
      console.error('[useDisconnectedConnections] Exception:', error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  // Busca inicial e quando workspace mudar
  useEffect(() => {
    if (workspaceId && workspaceId !== lastWorkspaceIdRef.current) {
      console.log('[useDisconnectedConnections] Workspace mudou, buscando conexões...');
      lastWorkspaceIdRef.current = workspaceId;
      fetchDisconnectedConnections(true);
    } else if (workspaceId) {
      fetchDisconnectedConnections();
    }
  }, [workspaceId, fetchDisconnectedConnections]);

  // Subscribe para mudanças em tempo real
  useEffect(() => {
    if (!workspaceId) return;

    console.log('[useDisconnectedConnections] Configurando realtime para workspace:', workspaceId);

    const channel = supabase
      .channel(`disconnected-connections-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connections',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          console.log('[useDisconnectedConnections] Mudança detectada:', payload);
          console.log('[useDisconnectedConnections] Tipo de evento:', payload.eventType);
          console.log('[useDisconnectedConnections] Novo status:', payload.new?.status);
          // Refetch sempre que houver mudança
          fetchDisconnectedConnections();
        }
      )
      .subscribe();

    return () => {
      console.log('[useDisconnectedConnections] Removendo channel');
      supabase.removeChannel(channel);
    };
  }, [workspaceId, fetchDisconnectedConnections]);

  return {
    disconnectedConnections,
    hasDisconnected: disconnectedConnections.length > 0,
    disconnectedCount: disconnectedConnections.length,
    isLoading,
    refresh: fetchDisconnectedConnections
  };
}
