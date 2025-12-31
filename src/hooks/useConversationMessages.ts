import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceHeaders } from '@/lib/workspaceHeaders';

interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  content: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document';
  sender_type: 'contact' | 'agent' | 'system' | 'ia' | 'user';
  sender_id?: string;
  file_url?: string;
  file_name?: string;
  mime_type?: string;
  created_at: string;
  status?: string;
  delivered_at?: string;
  read_at?: string;
  external_id?: string;
  metadata?: any;
  workspace_id?: string;
  origem_resposta?: string;
  reply_to_message_id?: string;
  quoted_message?: {
    id: string;
    content: string;
    sender_type: 'contact' | 'agent' | 'system' | 'ia' | 'user';
    message_type?: 'text' | 'image' | 'video' | 'audio' | 'document';
    file_url?: string;
    file_name?: string;
    external_id?: string;
  };
  evolution_key_id?: string | null;
}

const isPlainObject = (value: unknown): value is Record<string, any> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const normalizeLinkId = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
};

const getProviderLinkedIds = (message: WhatsAppMessage): string[] => {
  const metadata = isPlainObject(message.metadata) ? message.metadata : {};
  const candidates = [
    normalizeLinkId(metadata.provider_msg_id),
    normalizeLinkId(metadata.provider_message_id),
    normalizeLinkId(message.evolution_key_id)
  ];

  return candidates.filter((id): id is string => !!id);
};

const mergeMessageRecords = (
  existing: WhatsAppMessage,
  incoming: WhatsAppMessage
): WhatsAppMessage => {
  const existingMetadata = isPlainObject(existing.metadata) ? existing.metadata : {};
  const incomingMetadata = isPlainObject(incoming.metadata) ? incoming.metadata : {};
  const mergedMetadata = { ...existingMetadata, ...incomingMetadata };

  return {
    ...existing,
    ...incoming,
    metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined
  };
};

const dedupeAndSortMessages = (messages: WhatsAppMessage[]): WhatsAppMessage[] => {
  const accumulator: WhatsAppMessage[] = [];

  for (const message of messages) {
    const normalizedExternal = normalizeLinkId(message.external_id);

    // 1. Verificar duplicação por ID
    const indexById = accumulator.findIndex(existing => existing.id === message.id);
    if (indexById !== -1) {
      accumulator[indexById] = mergeMessageRecords(accumulator[indexById], message);
      continue;
    }

    // 2. Verificar duplicação por external_id
    if (normalizedExternal) {
      const indexByExternal = accumulator.findIndex(
        existing => normalizeLinkId(existing.external_id) === normalizedExternal
      );
      if (indexByExternal !== -1) {
        accumulator[indexByExternal] = mergeMessageRecords(
          accumulator[indexByExternal],
          message
        );
        continue;
      }
    }

    // 3. Verificar duplicação por provider_msg_id / evolution_key_id
    const incomingProviderIds = getProviderLinkedIds(message);
    const providerMatchIndex = accumulator.findIndex(existing => {
      const existingProviderIds = getProviderLinkedIds(existing);
      const existingExternal = normalizeLinkId(existing.external_id);

      if (
        normalizedExternal &&
        existingProviderIds.some(providerId => providerId === normalizedExternal)
      ) {
        return true;
      }

      if (
        existingExternal &&
        incomingProviderIds.some(providerId => providerId === existingExternal)
      ) {
        return true;
      }

      return existingProviderIds.some(providerId =>
        incomingProviderIds.includes(providerId)
      );
    });

    if (providerMatchIndex !== -1) {
      accumulator[providerMatchIndex] = mergeMessageRecords(
        accumulator[providerMatchIndex],
        message
      );
      continue;
    }

    accumulator.push(message);
  }

  return [...accumulator].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
};

interface UseConversationMessagesReturn {
  messages: WhatsAppMessage[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadInitial: (conversationId: string, forceRefresh?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  addMessage: (message: WhatsAppMessage) => void;
  updateMessage: (messageId: string, updates: Partial<WhatsAppMessage>) => void;
  removeMessage: (messageId: string) => void;
  clearMessages: () => void;
}

export function useConversationMessages(options?: {
  enableBackgroundPreload?: boolean;
  cacheTtlMs?: number;
  debug?: boolean;
}): UseConversationMessagesReturn {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursorBefore, setCursorBefore] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  
  const { selectedWorkspace } = useWorkspace();
  const { getHeaders } = useWorkspaceHeaders();
  const { toast } = useToast();
  
  const debug = options?.debug ?? false;
  const enableBackgroundPreload = options?.enableBackgroundPreload ?? false;
  const cacheTtlMs = options?.cacheTtlMs ?? 15_000;

  // Cache em memória
  const cacheRef = useRef<Map<string, { messages: WhatsAppMessage[]; timestamp: number; cursorBefore: string | null; hasMore: boolean }>>(new Map());

  // ✅ ESTABILIZAR headers com useMemo
  const headers = useMemo(() => {
    try {
      return getHeaders();
    } catch (error) {
      console.error('❌ [useConversationMessages] Erro ao gerar headers:', error);
      return {};
    }
  }, [getHeaders]);

  const clearMessages = useCallback(() => {
    if (debug) {
      console.log('🧹 [useConversationMessages] clearMessages chamado:', {
        timestamp: new Date().toISOString()
      });
    }
    setMessages([]);
    setHasMore(true);
    setCursorBefore(null);
    setCurrentConversationId(null);
  }, []);

  const loadInitial = useCallback(async (conversationId: string, forceRefresh = false) => {
    const workspaceId = selectedWorkspace?.workspace_id;
    if (!workspaceId) return;

    if (debug) {
      console.log('🔄 [useConversationMessages] loadInitial chamado:', {
        conversationId,
        workspaceId,
        forceRefresh,
        timestamp: new Date().toISOString()
      });
    }

    const cacheKey = `${workspaceId}:${conversationId}`;
    const cached = cacheRef.current.get(cacheKey);
    const now = Date.now();
    const isCacheValid = cached && now - cached.timestamp <= cacheTtlMs;

    if (!forceRefresh && isCacheValid) {
      setCurrentConversationId(conversationId);
      setMessages(cached.messages);
      setCursorBefore(cached.cursorBefore);
      setHasMore(cached.hasMore);
      return;
    }
    if (forceRefresh) {
      cacheRef.current.delete(cacheKey);
    }

    setLoading(true);
    setMessages([]);
    setHasMore(true);
    setCursorBefore(null);
    setCurrentConversationId(conversationId);

    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-get-messages', {
        body: { 
          conversation_id: conversationId,
          limit: 30
        },
        headers
      });

      if (error) throw error;

      const newMessages = data?.items || [];
      const normalizedMessages = dedupeAndSortMessages(newMessages);
      
      setMessages(normalizedMessages);
      const nextBefore = data?.nextBefore;
      setHasMore(!!nextBefore);
      setCursorBefore(nextBefore || null);

      cacheRef.current.set(cacheKey, {
        messages: normalizedMessages,
        timestamp: Date.now(),
        cursorBefore: nextBefore || null,
        hasMore: !!nextBefore
      });

    } catch (error: any) {
      console.error('❌ [useConversationMessages] Erro:', error);
    } finally {
      setLoading(false);
    }
  }, [cacheTtlMs, debug, headers, selectedWorkspace?.workspace_id]);

  const loadMore = useCallback(async () => {
    const workspaceId = selectedWorkspace?.workspace_id;
    if (!workspaceId || !currentConversationId || !cursorBefore || !hasMore) {
      return Promise.resolve();
    }

    if (debug) {
      console.log('🔄 [useConversationMessages] loadMore chamado manualmente:', {
        conversationId: currentConversationId,
        cursorBefore,
        hasMore,
        timestamp: new Date().toISOString()
      });
    }

    setLoadingMore(true);

    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-get-messages', {
        body: { 
          conversation_id: currentConversationId,
          limit: 30,
          before: cursorBefore
        },
        headers
      });

      if (error) throw error;

      if (!data?.items || data.items.length === 0) {
        setHasMore(false);
        return;
      }

      const olderMessages = data.items;
      setMessages(prev => dedupeAndSortMessages([...olderMessages, ...prev]));
      
      const nextBefore = data.nextBefore;
      setCursorBefore(nextBefore || null);
      setHasMore(!!nextBefore);
      // Não fazer preload em background por padrão (evita travas). Pode ser reativado via options.
      if (enableBackgroundPreload) {
        // noop: reservado para implementação futura com requestIdleCallback/limites
      }

    } catch (error: any) {
      console.error('❌ [useConversationMessages] Erro no loadMore:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [currentConversationId, cursorBefore, enableBackgroundPreload, hasMore, headers, selectedWorkspace?.workspace_id, debug]);

  const addMessage = useCallback((message: WhatsAppMessage) => {
    if (debug) {
      console.log('➕ [useConversationMessages] addMessage chamado:', {
        messageId: message.id,
        external_id: message.external_id,
        conversationId: message.conversation_id,
        timestamp: new Date().toISOString()
      });
    }

    setMessages(prev => {
      const existsById = prev.some(m => m.id === message.id);
      const existsByExternalId =
        message.external_id && prev.some(m => m.external_id === message.external_id);
      const providerMatchIndex = prev.findIndex(existing => {
        const existingProviderIds = getProviderLinkedIds(existing);
        const incomingProviderIds = getProviderLinkedIds(message);
        const matchesIncomingExternal =
          message.external_id && existingProviderIds.includes(message.external_id);
        const matchesExistingExternal =
          existing.external_id && incomingProviderIds.includes(existing.external_id);
        const sharedProviderId = existingProviderIds.some(providerId =>
          incomingProviderIds.includes(providerId)
        );
        return matchesIncomingExternal || matchesExistingExternal || sharedProviderId;
      });

      if (existsById || existsByExternalId || providerMatchIndex !== -1) {
        if (debug) {
          console.log('⚠️ [useConversationMessages] Mensagem duplicada ignorada:', {
            id: message.id,
            external_id: message.external_id,
            existsById,
            existsByExternalId,
            providerMatchIndex
          });
        }
        return dedupeAndSortMessages([...prev, message]);
      }

      return dedupeAndSortMessages([...prev, message]);
    });
    
    const workspaceId = selectedWorkspace?.workspace_id;
    const convId = currentConversationId;
    if (workspaceId && convId) {
      const cacheKey = `${workspaceId}:${convId}`;
      cacheRef.current.delete(cacheKey);
    }
  }, []); // ✅ ESTÁVEL - lê variáveis dentro da função

  const updateMessage = useCallback((messageId: string, updates: Partial<WhatsAppMessage>) => {
    if (debug) {
      console.log('🔄 [updateMessage] Chamado com:', {
        messageId,
        updates,
        OLD_STATUS: messages.find(m => m.id === messageId || m.external_id === messageId)?.status,
        NEW_STATUS: updates.status,
        delivered_at: updates.delivered_at,
        read_at: updates.read_at,
        timestamp: new Date().toISOString()
      });
    }

    setMessages(prev => {
      const messageIndex = prev.findIndex(m => m.id === messageId || m.external_id === messageId);
      if (messageIndex === -1) {
        if (debug) {
          console.log('⚠️ [updateMessage] Mensagem não encontrada para update:', {
            messageId,
            totalMessages: prev.length,
            availableIds: prev.map(m => ({ id: m.id, external_id: m.external_id }))
          });
        }
        return prev;
      }

      const newMessages = [...prev];
      const oldMessage = newMessages[messageIndex];
      newMessages[messageIndex] = { ...oldMessage, ...updates };

      if (debug) {
        console.log('✅ [updateMessage] Mensagem atualizada no estado:', {
          messageId,
          messageIndex,
          oldStatus: oldMessage.status,
          newStatus: newMessages[messageIndex].status,
          oldDelivered: oldMessage.delivered_at,
          newDelivered: newMessages[messageIndex].delivered_at,
          oldRead: oldMessage.read_at,
          newRead: newMessages[messageIndex].read_at
        });
      }

      if (updates.id && updates.id !== messageId) {
        const workspaceId = selectedWorkspace?.workspace_id;
        const convId = currentConversationId;
        if (workspaceId && convId) {
          const cacheKey = `${workspaceId}:${convId}`;
          cacheRef.current.delete(cacheKey);
        }
      }

      return newMessages;
    });
  }, [messages, selectedWorkspace?.workspace_id, currentConversationId]);

  const removeMessage = useCallback((messageId: string) => {
    console.log('🗑️ [useConversationMessages] removeMessage chamado:', {
      messageId,
      timestamp: new Date().toISOString()
    });
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  // Limpar cache quando workspace muda
  useEffect(() => {
    if (selectedWorkspace?.workspace_id) {
      cacheRef.current.clear();
      console.log('🗑️ Cache limpo devido à mudança de workspace');
    }
  }, [selectedWorkspace?.workspace_id]);

  // Limpar cache antigo periodicamente
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of cacheRef.current.entries()) {
        if (now - value.timestamp > CACHE_TTL * 3) {
          cacheRef.current.delete(key);
        }
      }
    }, 30000);

    return () => clearInterval(cleanupInterval);
  }, []);

  // ✅ SUBSCRIPTION DE MENSAGENS (ÚNICO E CENTRALIZADO)
  useEffect(() => {
    if (debug) {
      console.log('🔄🔄🔄 [REALTIME] useEffect EXECUTADO:', {
        currentConversationId,
        workspaceId: selectedWorkspace?.workspace_id,
        timestamp: new Date().toISOString()
      });
    }

    if (!currentConversationId || !selectedWorkspace?.workspace_id) {
      if (debug) {
        console.log('⚠️ [useConversationMessages] Subscription NÃO iniciada - faltam dados:', {
          currentConversationId,
          workspaceId: selectedWorkspace?.workspace_id
        });
      }
      return;
    }

    // 🔥 Força remoção de canais antigos antes de criar novo
    const existingChannels = supabase.getChannels();
    const oldMessageChannels = existingChannels.filter(ch => 
      ch.topic.includes('messages-') && ch.topic.includes(currentConversationId)
    );
    
    if (oldMessageChannels.length > 0) {
      if (debug) {
        console.log('🧹 [REALTIME] Removendo canais antigos:', oldMessageChannels.map(ch => ch.topic));
      }
      oldMessageChannels.forEach(ch => supabase.removeChannel(ch));
    }

    const channelName = `messages-${currentConversationId}-workspace-${selectedWorkspace.workspace_id}`;
    if (debug) {
      console.log('🔌🔌🔌 [REALTIME] INICIANDO SUBSCRIPTION:', {
        channelName,
        conversationId: currentConversationId,
        workspaceId: selectedWorkspace.workspace_id,
        filter: `conversation_id=eq.${currentConversationId}`,
        timestamp: new Date().toISOString()
      });
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${currentConversationId}`
        },
        (payload) => {
          console.log('📨 [REALTIME] ✅ NOVA MENSAGEM RECEBIDA:', {
            messageId: payload.new.id,
            external_id: payload.new.external_id,
            content: payload.new.content?.substring(0, 50),
            conversationId: currentConversationId,
            sender_type: payload.new.sender_type,
            timestamp: new Date().toISOString(),
            payload: payload.new
          });
          
          const newMessage = payload.new as WhatsAppMessage;
          setMessages(prev => {
            const optimisticIndex =
              newMessage.external_id
                ? prev.findIndex(
                    m => m.external_id === newMessage.external_id && m.id !== newMessage.id
                  )
                : -1;

            if (optimisticIndex !== -1) {
              console.log('🔄 [REALTIME] Substituindo mensagem otimista pela real:', {
                optimisticId: prev[optimisticIndex].id,
                realId: newMessage.id,
                external_id: newMessage.external_id
              });
            }

            const existsById = prev.some(m => m.id === newMessage.id);
            const existsByExternalId =
              newMessage.external_id && prev.some(m => m.external_id === newMessage.external_id);

            const providerMatchIndex = prev.findIndex(existing => {
              const existingProviderIds = getProviderLinkedIds(existing);
              const incomingProviderIds = getProviderLinkedIds(newMessage);
              const matchesIncomingExternal =
                newMessage.external_id && existingProviderIds.includes(newMessage.external_id);
              const matchesExistingExternal =
                existing.external_id && incomingProviderIds.includes(existing.external_id);
              const sharedProviderId = existingProviderIds.some(providerId =>
                incomingProviderIds.includes(providerId)
              );
              return matchesIncomingExternal || matchesExistingExternal || sharedProviderId;
            });

            if (providerMatchIndex !== -1 && optimisticIndex === -1) {
              console.log('🔗 [REALTIME] Mesclando mensagem com provider_msg_id correspondente:', {
                providerMatchIndex,
                provider_external: newMessage.external_id,
                existing_provider_ids: getProviderLinkedIds(prev[providerMatchIndex])
              });
            }

            if (existsById || existsByExternalId) {
              console.log('⚠️ [REALTIME] Mensagem duplicada recebida:', {
                id: newMessage.id,
                external_id: newMessage.external_id,
                existsById,
                existsByExternalId,
                providerMatchIndex
              });
            }

            return dedupeAndSortMessages([...prev, newMessage]);
          });
          
          // Invalidar cache
          const workspaceId = selectedWorkspace?.workspace_id;
          const convId = currentConversationId;
          if (workspaceId && convId) {
            const cacheKey = `${workspaceId}:${convId}`;
            cacheRef.current.delete(cacheKey);
          }
          
          console.log('✅ [REALTIME] Mensagem processada:', newMessage.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${currentConversationId}`
        },
        (payload) => {
          console.log('🔥🔥🔥 [REALTIME UPDATE] ✅ EVENTO RECEBIDO!', {
            messageId: payload.new.id,
            external_id: payload.new.external_id,
            conversationId: currentConversationId,
            expectedConversation: currentConversationId,
            OLD_STATUS: payload.old?.status,
            NEW_STATUS: payload.new.status,
            OLD_delivered: payload.old?.delivered_at,
            NEW_delivered: payload.new.delivered_at,
            OLD_read: payload.old?.read_at,
            NEW_read: payload.new.read_at,
            timestamp: new Date().toISOString(),
            fullPayload: payload
          });
          
          const updatedMessage = payload.new as WhatsAppMessage;
          
          // Verificar se a mensagem está no estado local
          setMessages(prev => {
            const messageIndex = prev.findIndex(m => m.id === updatedMessage.id || m.external_id === updatedMessage.external_id);
            console.log('🔍 [REALTIME UPDATE] Buscando mensagem no estado:', {
              messageId: updatedMessage.id,
              external_id: updatedMessage.external_id,
              found: messageIndex !== -1,
              messageIndex,
              totalMessages: prev.length,
              currentStatus: messageIndex !== -1 ? prev[messageIndex].status : 'not_found'
            });
            
            if (messageIndex === -1) {
              console.warn('⚠️ [REALTIME UPDATE] Mensagem NÃO encontrada no estado!');
              return prev;
            }
            
            const newMessages = [...prev];
            const oldMessage = newMessages[messageIndex];
            newMessages[messageIndex] = { ...oldMessage, ...updatedMessage };
            
            console.log('✅ [REALTIME UPDATE] Mensagem ATUALIZADA no estado:', {
              messageId: updatedMessage.id,
              oldStatus: oldMessage.status,
              newStatus: newMessages[messageIndex].status,
              oldDelivered: oldMessage.delivered_at,
              newDelivered: newMessages[messageIndex].delivered_at,
              oldRead: oldMessage.read_at,
              newRead: newMessages[messageIndex].read_at
            });
            
            return newMessages;
          });
          
          console.log('✅ [REALTIME UPDATE] Atualização concluída!');
        }
      )
      .subscribe((status, err) => {
        console.log('📡📡📡 [REALTIME] STATUS DA SUBSCRIPTION:', {
          status,
          error: err,
          channelName,
          conversationId: currentConversationId,
          timestamp: new Date().toISOString()
        });
        
        if (status === 'SUBSCRIBED') {
          console.log('✅✅✅ [REALTIME] SUBSCRIPTION ATIVA! Aguardando eventos INSERT e UPDATE...');
          console.log('🔍 [REALTIME] Filtro ativo: conversation_id=eq.' + currentConversationId);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌❌❌ [REALTIME] ERRO NO CANAL!', err);
        } else if (status === 'TIMED_OUT') {
          console.error('⏱️⏱️⏱️ [REALTIME] TIMEOUT NA SUBSCRIPTION!');
        } else if (status === 'CLOSED') {
          console.warn('🔴 [REALTIME] CANAL FECHADO');
        }
      });

    console.log('🎯 [REALTIME] Subscription configurada e ativada para:', {
      channelName,
      conversationId: currentConversationId,
      timestamp: new Date().toISOString()
    });

    return () => {
      console.log('🔌 [useConversationMessages] 🔴 REMOVENDO subscription:', {
        channelName,
        conversationId: currentConversationId,
        timestamp: new Date().toISOString()
      });
      supabase.removeChannel(channel);
    };
  }, [currentConversationId, selectedWorkspace?.workspace_id]); // ✅ Removido addMessage e updateMessage para evitar re-criações

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    loadInitial,
    loadMore,
    addMessage,
    updateMessage,
    removeMessage,
    clearMessages
  };
}
