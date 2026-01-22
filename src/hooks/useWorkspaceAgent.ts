import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export const useWorkspaceAgent = (conversationId?: string) => {
  const queryClient = useQueryClient();
  
  const { data: agent, isLoading, error } = useQuery({
    queryKey: ['conversation-agent', conversationId],
    queryFn: async () => {
      if (!conversationId) {
        return null;
      }
      
      // Primeiro busca a conversa para pegar o agent_active_id
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('agent_active_id, agente_ativo')
        .eq('id', conversationId)
        .maybeSingle();
      
      if (convError) {
        console.error('❌ Erro ao buscar conversa:', convError);
        throw convError;
      }
      
      if (!conversation?.agent_active_id || !conversation?.agente_ativo) {
        return null;
      }
      
      // Agora busca os dados do agente
      const { data: agentData, error: agentError } = await supabase
        .from('ai_agents')
        .select('id, name, is_active')
        .eq('id', conversation.agent_active_id)
        .maybeSingle();
      
      if (agentError) {
        console.error('❌ Erro ao buscar agente:', agentError);
        throw agentError;
      }
      
      return agentData;
    },
    enabled: !!conversationId,
  });

  // Listener realtime para invalidar query quando conversa mudar
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`agent-updates-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`
        },
        () => {
          // Invalidar query para recarregar dados do agente
          queryClient.invalidateQueries({ queryKey: ['conversation-agent', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);
  
  const hasAgent = !!agent;
  
  return { 
    agent, 
    hasAgent, 
    isLoading 
  };
};
