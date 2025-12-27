import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceHeaders } from '@/lib/workspaceHeaders';
import { useEffect, useMemo, useState } from 'react';

export interface CardHistoryEvent {
  id: string;
  type:
    | 'agent_activity'
    | 'queue_transfer'
    | 'column_transfer'
    | 'pipeline_transfer'
    | 'user_assigned'
    | 'activity_lembrete'
    | 'activity_mensagem'
    | 'activity_ligacao'
    | 'activity_reuniao'
    | 'activity_agendamento'
    | 'tag'
    | 'notes';
  action: string;
  description: string;
  timestamp: string;
  user_name?: string;
  metadata?: any;
}

export const cardHistoryQueryKey = (cardId: string, contactId?: string | null) =>
  ['card-history', cardId, contactId || 'no-contact'] as const;

export const useCardHistory = (cardId: string, contactId?: string) => {
  const { getHeaders } = useWorkspaceHeaders();
  const queryClient = useQueryClient();
  const [resolvedContactId, setResolvedContactId] = useState<string | null>(contactId || null);

  // Buscar contactId se não for fornecido
  useEffect(() => {
    if (cardId && !contactId && !resolvedContactId) {
      const fetchContactId = async () => {
        const { data: card } = await supabase
          .from('pipeline_cards')
          .select('contact_id')
          .eq('id', cardId)
          .maybeSingle();
        
        if (card?.contact_id) {
          console.log('✅ ContactId resolvido internamente no hook:', card.contact_id);
          setResolvedContactId(card.contact_id);
        }
      };
      
      fetchContactId();
    } else if (contactId) {
      setResolvedContactId(contactId);
    }
  }, [cardId, contactId, resolvedContactId]);

  const effectiveContactId = contactId || resolvedContactId;
  const queryKey = useMemo(
    () => cardHistoryQueryKey(cardId, effectiveContactId),
    [cardId, effectiveContactId]
  );

  // Listener em tempo real para atualizações automáticas do histórico
  useEffect(() => {
    if (!cardId) return;

    console.log('📡 [useCardHistory] Iniciando canal realtime para card:', cardId);
    
    const channel = supabase
      .channel(`card-history-refresh-${cardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activities',
          filter: `pipeline_card_id=eq.${cardId}`
        },
        () => {
          console.log('🔄 [useCardHistory] Atividades mudaram, invalidando cache...');
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pipeline_card_history',
          filter: `card_id=eq.${cardId}`
        },
        () => {
          console.log('🔄 [useCardHistory] Histórico do card mudou, invalidando cache...');
          queryClient.invalidateQueries({ queryKey });
        }
      );

    // Se tivermos o contactId, também monitorar mudanças em observações e conversas
    if (effectiveContactId) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_observations',
          filter: `contact_id=eq.${effectiveContactId}`
        },
        () => {
          console.log('🔄 [useCardHistory] Observações do contato mudaram, invalidando cache...');
          queryClient.invalidateQueries({ queryKey });
        }
      );
    }

    channel.subscribe();

    return () => {
      console.log('🔌 [useCardHistory] Removendo canal realtime para card:', cardId);
      supabase.removeChannel(channel);
    };
  }, [cardId, effectiveContactId, queryClient, queryKey]);

  return useQuery({
    queryKey,
    queryFn: async (): Promise<CardHistoryEvent[]> => {
      if (!effectiveContactId) {
        // Aguarda contactId para evitar retornar vazio e encerrar consulta
        throw new Error('CONTACT_ID_NOT_READY');
      }

      const headers = getHeaders();
      const allEvents: CardHistoryEvent[] = [];

      // 1. Buscar histórico de mudanças de coluna do card
      const { data: cardHistory } = await supabase
        .from('pipeline_card_history')
        .select('*')
        .eq('card_id', cardId)
        .order('changed_at', { ascending: false });

      if (cardHistory) {
        for (const event of cardHistory) {
          const metadata = (event.metadata as any) || {};
          let description = '';
          let eventType: CardHistoryEvent['type'] = 'column_transfer';
          let eventTitle: string | undefined;
          const timestamp = event.changed_at || (event as any)?.created_at || new Date().toISOString();

          if (event.action === 'column_changed') {
            const fromColumn = metadata.old_column_name || 'Etapa desconhecida';
            const toColumn = metadata.new_column_name || 'Etapa desconhecida';
            const changedBy = metadata.changed_by_name || 'Sistema';
            description = `${fromColumn} → ${toColumn} - ${changedBy}`;
            eventTitle = 'Transferência de Etapa';
          } else if (event.action === 'pipeline_changed') {
            const fromPipeline = metadata.old_pipeline_name || 'Pipeline desconhecido';
            const toPipeline = metadata.new_pipeline_name || 'Pipeline desconhecido';
            const changedBy = metadata.changed_by_name || 'Sistema';
            description = `${fromPipeline} → ${toPipeline} - ${changedBy}`;
            eventType = 'pipeline_transfer';
            eventTitle = 'Transferência de Pipeline';
          } else if (event.action === 'created') {
            const changedBy = metadata.changed_by_name || 'Sistema';
            description = `Negócio criado - ${changedBy}`;
            eventTitle = 'Criação do Negócio';
          } else if (event.action === 'status_changed') {
            const newStatus = metadata.new_status || 'Status desconhecido';
            const changedBy = metadata.changed_by_name || 'Sistema';
            description = `Status alterado para: ${newStatus} - ${changedBy}`;
            eventTitle = 'Status Atualizado';
          } else if (event.action === 'tag_removed') {
            const tagName = metadata.tag_name || 'sem nome';
            const changedBy = metadata.changed_by_name || 'Sistema';
            description = `${tagName} - ${changedBy}`;
            eventType = 'tag';
            eventTitle = 'Etiqueta Removida';
          } else if (event.action === 'tag_added') {
            const tagName = metadata.tag_name || 'sem nome';
            const changedBy = metadata.changed_by_name || 'Sistema';
            description = `${tagName} - ${changedBy}`;
            eventType = 'tag';
            eventTitle = 'Etiqueta Atribuída';
          } else if (event.action === 'note_created') {
            description = metadata.description || metadata.content || 'Anotação adicionada';
            eventType = 'notes';
            eventTitle = 'Anotação';
          } else if (metadata.description) {
            description = metadata.description;
          }

          allEvents.push({
            id: event.id,
            type: eventType,
            action: event.action,
            description,
            timestamp,
            user_name: metadata?.changed_by_name,
            metadata: {
              ...metadata,
              event_title: eventTitle || 'Registro de Alteração',
              description: description // Garantir que a descrição esteja no metadata também
            },
          });
        }
      }

      // 2. Buscar conversas do contato para pegar histórico de agente e filas
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', effectiveContactId);

      if (conversations && conversations.length > 0) {
        const conversationIds = conversations.map(c => c.id);

        // 2a. Histórico de ativação/desativação de agente IA
        const { data: agentHistory } = await supabase
          .from('conversation_agent_history')
          .select(`
            id,
            action,
            agent_name,
            created_at,
            metadata,
            changed_by,
            system_users:changed_by(name)
          `)
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false });

        if (agentHistory) {
          for (const event of agentHistory) {
            let description = '';
            const changedBy = (event.system_users as any)?.name || 'Sistema';
            
            if (event.action === 'activated') {
              description = `Agente **${event.agent_name}** foi ativado para esse Negócio - ${changedBy}`;
            } else if (event.action === 'deactivated') {
              description = `Agente **${event.agent_name}** foi desativado para esse Negócio - ${changedBy}`;
            } else if (event.action === 'changed') {
              description = `Agente **${event.agent_name}** foi ativado para esse Negócio - ${changedBy}`;
            }

            allEvents.push({
              id: event.id,
              type: 'agent_activity',
              action: event.action,
              description,
              timestamp: event.created_at || new Date().toISOString(),
              user_name: (event.system_users as any)?.name,
              metadata: {
                ...(event.metadata || {}),
                event_title: 'Atividade de IA',
                description: description
              }
            });
          }
        }

        // 2b. Histórico de transferências de fila e atribuições de usuário
        const { data: assignmentHistory } = await supabase
          .from('conversation_assignments')
          .select(`
            id,
            action,
            changed_at,
            from_assigned_user_id,
            to_assigned_user_id,
            from_queue_id,
            to_queue_id,
            changed_by
          `)
          .in('conversation_id', conversationIds)
          .order('changed_at', { ascending: false });

        if (assignmentHistory && assignmentHistory.length > 0) {
          const userIdsToLoad = new Set<string>();
          const queueIdsToLoad = new Set<string>();

          assignmentHistory.forEach((event) => {
            if (event.from_assigned_user_id) userIdsToLoad.add(event.from_assigned_user_id);
            if (event.to_assigned_user_id) userIdsToLoad.add(event.to_assigned_user_id);
            if (event.changed_by) userIdsToLoad.add(event.changed_by);
            if (event.from_queue_id) queueIdsToLoad.add(event.from_queue_id);
            if (event.to_queue_id) queueIdsToLoad.add(event.to_queue_id);
          });

          const usersMap = new Map<string, string>();
          if (userIdsToLoad.size > 0) {
            const { data: users } = await supabase
              .from('system_users')
              .select('id, name')
              .in('id', Array.from(userIdsToLoad));

            users?.forEach((user) => {
              usersMap.set(user.id, user.name);
            });
          }

          const queuesMap = new Map<string, string>();
          if (queueIdsToLoad.size > 0) {
            const { data: queues } = await supabase
              .from('queues')
              .select('id, name')
              .in('id', Array.from(queueIdsToLoad));

            queues?.forEach((queue) => {
              queuesMap.set(queue.id, queue.name);
            });
          }

          const formatUserName = (userId?: string | null) =>
            userId ? usersMap.get(userId) || 'Sem responsável' : 'Sem responsável';

          assignmentHistory.forEach((event) => {
            let description = '';
            let eventType: 'queue_transfer' | 'user_assigned' = 'user_assigned';
            let eventTitle = 'Conversa Atualizada';
            const assignmentTimestamp = event.changed_at || (event as any)?.created_at || new Date().toISOString();

            const fromUserName = formatUserName(event.from_assigned_user_id);
            const toUserName = formatUserName(event.to_assigned_user_id);
            const changedByName = event.changed_by ? usersMap.get(event.changed_by) : undefined;

            if (event.action === 'transfer' || (event.action === 'assign' && event.from_assigned_user_id && event.to_assigned_user_id && event.from_assigned_user_id !== event.to_assigned_user_id)) {
              description = `Conversa transferida de ${fromUserName} para ${toUserName} - ${changedByName || 'Sistema'}`;
              eventTitle = 'Conversa Transferida';
            } else if (event.action === 'assign' && event.to_assigned_user_id) {
              description = `Conversa vinculada ao responsável ${toUserName} - ${changedByName || 'Sistema'}`;
              eventTitle = 'Conversa Vinculada';
            } else if (event.action === 'assign' && !event.to_assigned_user_id && event.from_assigned_user_id) {
              description = `Conversa desvinculada do responsável ${fromUserName} - ${changedByName || 'Sistema'}`;
              eventTitle = 'Conversa Desvinculada';
            } else if (event.action === 'queue_transfer') {
              const fromQueue = event.from_queue_id ? queuesMap.get(event.from_queue_id) || 'Sem fila' : 'Sem fila';
              const toQueue = event.to_queue_id ? queuesMap.get(event.to_queue_id) || 'Sem fila' : 'Sem fila';
              description = `${fromQueue} → ${toQueue} - ${changedByName || 'Sistema'}`;
              eventType = 'queue_transfer';
              eventTitle = 'Transferência de Fila';
            } else if (!event.to_assigned_user_id && !event.from_assigned_user_id) {
              description = `Conversa atualizada - ${changedByName || 'Sistema'}`;
            }

            allEvents.push({
              id: event.id,
              type: eventType,
              action: event.action,
              description,
              timestamp: assignmentTimestamp,
              user_name: changedByName,
              metadata: {
                event_title: eventTitle,
                description: description,
                from_user_name: fromUserName,
                to_user_name: toUserName,
                changed_by_name: changedByName,
                from_queue_name: eventType === 'queue_transfer' ? (event.from_queue_id ? queuesMap.get(event.from_queue_id) : undefined) : undefined,
                to_queue_name: eventType === 'queue_transfer' ? (event.to_queue_id ? queuesMap.get(event.to_queue_id) : undefined) : undefined,
              },
            });
          });
        }
      }

      // 3. Buscar atividades do card
      const { data: activities } = await supabase
        .from('activities')
        .select(`
          id,
          type,
          subject,
          description,
          scheduled_for,
          is_completed,
          created_at,
          completed_at,
          responsible_id
        `)
        .eq('pipeline_card_id', cardId)
        .order('created_at', { ascending: false });

      if (activities) {
        // Buscar nomes dos usuários responsáveis
        const responsibleIds = activities
          .map(a => a.responsible_id)
          .filter(Boolean) as string[];
        
        const usersMap = new Map<string, string>();
        if (responsibleIds.length > 0) {
          const { data: users } = await supabase
            .from('system_users')
            .select('id, name')
            .in('id', [...new Set(responsibleIds)]);
          
          users?.forEach(user => {
            usersMap.set(user.id, user.name);
          });
        }

        for (const activity of activities) {
          // Criar evento para criação da atividade
          const activityTypeMap: Record<string, CardHistoryEvent['type']> = {
            'Lembrete': 'activity_lembrete',
            'Mensagem': 'activity_mensagem',
            'Ligação': 'activity_ligacao',
            'Reunião': 'activity_reuniao',
            'Agendamento': 'activity_agendamento'
          };

          const eventType = activityTypeMap[activity.type] || 'activity_lembrete';
          const activityTypeName = activity.type || 'Atividade';
          const createdTimestamp = activity.created_at || new Date().toISOString();

          // Evento de criação
          allEvents.push({
            id: `${activity.id}_created`,
            type: eventType,
            action: 'created',
            description: `${activityTypeName} "${activity.subject}" foi criada`,
            timestamp: createdTimestamp,
            user_name: activity.responsible_id ? usersMap.get(activity.responsible_id) : undefined,
            metadata: {
              activity_type: activity.type,
              scheduled_for: activity.scheduled_for,
              subject: activity.subject,
              description: activity.description,
              status: 'created'
            }
          });

          // Evento de conclusão (se foi concluída)
          if (activity.is_completed && activity.completed_at) {
            const completedTimestamp = activity.completed_at || new Date().toISOString();
            allEvents.push({
              id: `${activity.id}_completed`,
              type: eventType,
              action: 'completed',
              description: `${activityTypeName} "${activity.subject}" foi concluída`,
              timestamp: completedTimestamp,
              user_name: activity.responsible_id ? usersMap.get(activity.responsible_id) : undefined,
              metadata: {
                activity_type: activity.type,
                scheduled_for: activity.scheduled_for,
                subject: activity.subject,
                description: activity.description,
                status: 'completed'
              }
            });
          }
        }
      }

      // IMPORTANTE: Não buscamos mais tags de contact_tags
      // TODOS os eventos de tags (adição e remoção) devem estar em pipeline_card_history
      // Os listeners realtime já salvam esses eventos de forma permanente

      // Ordenar todos os eventos por data (mais recentes primeiro)
      allEvents.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        return b.id.localeCompare(a.id);
      });

      return allEvents;
    },
    enabled: !!cardId && !!effectiveContactId, // só dispara quando já tem cardId e contactId resolvido
    staleTime: 0, // Sempre refetch para garantir dados atualizados
    refetchOnMount: true,
  });
};
