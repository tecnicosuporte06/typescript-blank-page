import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from './useAuth';
import { useNotificationSound } from './useNotificationSound';

export interface NotificationMessage {
  id: string;
  messageId: string | null;
  conversationId: string;
  contactId: string;
  contactName: string;
  content: string;
  messageType: string;
  senderType: 'contact' | 'agent' | 'ia' | 'system' | 'user' | string;
  timestamp: Date;
  isMedia: boolean;
  status: 'unread' | 'read';
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
  const { selectedWorkspace } = useWorkspace();
  const { user, hasRole } = useAuth();
  const { playNotificationSound } = useNotificationSound();
  const isMaster = hasRole(['master']);

  // Buscar notificações
  const fetchNotifications = async () => {
    if (!selectedWorkspace?.workspace_id || !user?.id) {
      console.log('⚠️ [useNotifications] Workspace ou user não disponível');
      return;
    }

    try {
      // Buscar notificações com join em conversations
      let query = supabase
        .from('notifications')
        .select(`
          *,
          conversations!inner(assigned_user_id, unread_count, status)
        `)
        .eq('workspace_id', selectedWorkspace.workspace_id)
        .eq('status', 'unread');

      if (!isMaster && user?.id) {
        // Usuários comuns enxergam apenas notificações destinadas a eles
        query = query.or([
          `user_id.eq.${user.id}`,
          `user_id.is.null`
        ].join(','));
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const filteredData = (data || []).filter((notif: any) => {
        if (isMaster) {
          return true;
        }

        const notificationUserId = notif.user_id ?? null;
        if (notificationUserId && notificationUserId !== user?.id) {
          return false;
        }

        // Notificações legadas sem user_id: permitir apenas se conversa está sem responsável ou atribuída ao usuário atual
        if (!notificationUserId) {
          const assignedUserId = notif.conversations?.assigned_user_id ?? null;
          if (assignedUserId && assignedUserId !== user?.id) {
            return false;
          }
        }

        return true;
      });

      const staleNotificationIds: string[] = [];
      const conversationUsage = new Map<string, { allowed: number; used: number }>();
      const messageUsage = new Set<string>();

      const sanitizedNotifications = filteredData.filter((notif: any) => {
        const conv = notif.conversations;
        if (!conv) {
          staleNotificationIds.push(notif.id);
          return false;
        }

        const conversationId = notif.conversation_id;
        const status = (conv.status || '').toLowerCase();
        const allowed = Math.max(conv.unread_count ?? 0, 0);
        const isConversationClosed = ['closed', 'archived'].includes(status);

        if (allowed <= 0 || isConversationClosed) {
          staleNotificationIds.push(notif.id);
          return false;
        }

        const usage = conversationUsage.get(conversationId) || { allowed, used: 0 };

        // Atualiza allowed caso unread_count tenha mudado desde o primeiro registro
        usage.allowed = Math.max(allowed, 0);

        if (usage.used >= usage.allowed) {
          staleNotificationIds.push(notif.id);
          return false;
        }

        // ✅ Evitar notificações duplicadas para a mesma mensagem
        const messageId = notif.message_id;
        if (messageId) {
          if (messageUsage.has(messageId)) {
            staleNotificationIds.push(notif.id);
            return false;
          }
          messageUsage.add(messageId);
        }

        usage.used += 1;
        conversationUsage.set(conversationId, usage);
        return true;
      });

      if (staleNotificationIds.length > 0) {
        try {
          await supabase
            .from('notifications')
            .update({
              status: 'read',
              read_at: new Date().toISOString()
            })
            .in('id', staleNotificationIds);
        } catch (cleanupError) {
          console.error('⚠️ [useNotifications] Falha ao limpar notificações obsoletas:', cleanupError);
        }
      }

      const formattedNotifications: NotificationMessage[] = sanitizedNotifications.map((notif: any) => ({
        id: notif.id,
        messageId: notif.message_id || null,
        conversationId: notif.conversation_id,
        contactId: notif.contact_id,
        contactName: notif.title,
        content: notif.content,
        messageType: notif.message_type,
        senderType: notif.sender_type || 'contact',
        timestamp: new Date(notif.created_at),
        isMedia: ['image', 'video', 'audio', 'document'].includes(notif.message_type),
        status: notif.status as 'unread' | 'read'
      }));

      const receivedNotifications = formattedNotifications.filter(
        (notif) => notif.senderType === 'contact'
      );

      console.log('✅ [useNotifications] Notificações carregadas (recebidas):', receivedNotifications.length);
      setNotifications(receivedNotifications);
    } catch (err) {
      console.error('❌ [useNotifications] Erro ao buscar notificações:', err);
    }
  };

  // Carregar notificações iniciais
  useEffect(() => {
    fetchNotifications();
  }, [selectedWorkspace?.workspace_id, user?.id]);

  // Real-time subscription com filtros nativos do Supabase
  useEffect(() => {
    if (!selectedWorkspace?.workspace_id || !user?.id) {
      console.log('⏭️ [useNotifications] Aguardando workspace ou user');
      return;
    }

    const workspaceId = selectedWorkspace.workspace_id;
    const userId = user.id;
    
    console.log('🔔 [useNotifications] Criando subscription:', {
      workspaceId,
      userId
    });
    
    const channel = supabase
      .channel(`notifications-${workspaceId}-${userId}`) // ✅ Canal único por user+workspace
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `workspace_id=eq.${workspaceId}` // ✅ Filtro nativo
        },
        (payload: any) => {
          // ✅ Segundo filtro no cliente para garantir
          if (payload.new.user_id === userId) {
            console.log('🔔✅ Nova notificação recebida via Realtime:', {
              id: payload.new.id,
              contactName: payload.new.title
            });
            playNotificationSound();
            fetchNotifications();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `workspace_id=eq.${workspaceId}` // ✅ Filtro nativo
        },
        (payload: any) => {
          // ✅ Segundo filtro no cliente para garantir
          if (payload.new.user_id === userId || payload.old?.user_id === userId) {
            console.log('🔔✅ Notificação atualizada via Realtime:', {
              id: payload.new.id,
              status: payload.new.status
            });
            fetchNotifications();
          }
        }
      )
      .subscribe((status) => {
        console.log('🔔 [useNotifications Realtime] Status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ [useNotifications] Canal de notificações ATIVO');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [useNotifications] ERRO no canal de notificações');
        }
      });

    return () => {
      console.log('🔕 [useNotifications] Removendo subscription:', {
        workspaceId,
        userId
      });
      supabase.removeChannel(channel);
    };
  }, [selectedWorkspace?.workspace_id, user?.id]);

  // Marcar conversa como lida
  const markContactAsRead = async (conversationId: string) => {
    if (!user?.id || isMaster) {
      if (isMaster) {
        console.log('🔒 [useNotifications] Usuário master não altera notificações');
      }
      return;
    }

    try {
      // Atualização otimista imediata para refletir no sino e nos cards
      setNotifications(prev => prev.filter(n => n.conversationId !== conversationId));
      // Disparar evento global opcional (para outros componentes ouvirem, se necessário)
      try { window.dispatchEvent(new CustomEvent('conversation-read', { detail: { conversationId } })); } catch {}

      const { error } = await supabase
        .from('notifications')
        .update({ 
          status: 'read',
          read_at: new Date().toISOString()
        })
        .eq('conversation_id', conversationId)
        .eq('status', 'unread')
        .eq('user_id', user.id);

      if (error) throw error;
      
      console.log('✅ [useNotifications] Notificações marcadas como lidas:', conversationId);
      // Refetch para sincronizar com o backend (em background)
      fetchNotifications();
    } catch (err) {
      console.error('❌ [useNotifications] Erro ao marcar como lida:', err);
    }
  };

  // Marcar todas como lidas
  const markAllAsRead = async () => {
    if (!user?.id || !selectedWorkspace?.workspace_id || isMaster) {
      if (isMaster) {
        console.log('🔒 [useNotifications] Usuário master não limpa notificações');
      }
      return;
    }

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          status: 'read',
          read_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('workspace_id', selectedWorkspace.workspace_id)
        .eq('status', 'unread');

      if (error) throw error;

      console.log('✅ [useNotifications] Todas as notificações marcadas como lidas');
      await fetchNotifications();
    } catch (err) {
      console.error('❌ [useNotifications] Erro ao marcar todas como lidas:', err);
    }
  };

  // Utilitários
  const getAvatarInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 
      'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500'
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  };

  return {
    notifications,
    totalUnread: notifications.length,
    markContactAsRead,
    markAllAsRead,
    getAvatarInitials,
    getAvatarColor,
    formatTimestamp
  };
}
