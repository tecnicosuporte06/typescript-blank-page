import { useState, useEffect, useCallback } from 'react';
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

  const fetchDisconnectedConnections = useCallback(async () => {
    console.log('[useDisconnectedConnections] fetchDisconnectedConnections chamado - workspaceId:', workspaceId);
    
    if (!workspaceId) {
      console.log('[useDisconnectedConnections] workspaceId vazio, retornando');
      setDisconnectedConnections([]);
      return;
    }

    setIsLoading(true);
    try {
      console.log('[useDisconnectedConnections] Buscando conexões desconectadas...');
      const { data, error } = await supabase
        .from('connections')
        .select('id, instance_name, phone_number, status')
        .eq('workspace_id', workspaceId)
        .eq('status', 'disconnected');

      if (error) {
        console.error('[useDisconnectedConnections] Erro ao buscar conexões:', error);
        return;
      }

      console.log('[useDisconnectedConnections] Conexões desconectadas encontradas:', data?.length || 0, data);
      setDisconnectedConnections(data || []);
    } catch (error) {
      console.error('[useDisconnectedConnections] Exception:', error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  // Busca inicial
  useEffect(() => {
    fetchDisconnectedConnections();
  }, [fetchDisconnectedConnections]);

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
