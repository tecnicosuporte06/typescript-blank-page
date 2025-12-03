import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export const useSessionMonitor = () => {
  const { user, logout } = useAuth();
  const channelRef = useRef<any>(null);
  const hasNotifiedRef = useRef(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user?.id) {
      // Limpar canal se não houver usuário
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      hasNotifiedRef.current = false;
      return;
    }

    const sessionToken = localStorage.getItem('sessionToken');
    if (!sessionToken) {
      // Se não há sessionToken, não monitorar (usuário ainda não completou login)
      return;
    }

    // Função para lidar com sessão invalidada
    const handleSessionInvalidated = async () => {
      if (hasNotifiedRef.current) {
        return; // Evitar múltiplas notificações
      }

      hasNotifiedRef.current = true;
      
      console.log('🔐 [SessionMonitor] Deslogando usuário devido a novo login');
      
      // Limpar localStorage IMEDIATAMENTE para garantir logout
      localStorage.removeItem('currentUser');
      localStorage.removeItem('selectedWorkspace');
      localStorage.removeItem('sessionToken');
      
      // Limpar interval e channel
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      
      // Fazer logout do Supabase Auth silenciosamente
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.log('🔐 [SessionMonitor] Erro ao fazer signOut (ignorado):', e);
      }
      
      // Mostrar notificação
      toast.error('Sessão encerrada', {
        description: 'Outro acesso foi realizado com suas credenciais. Por segurança, sua sessão foi encerrada.',
        duration: 5000,
      });

      // Redirecionar para login após pequeno delay para mostrar o toast
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    };

    // Verificar se a sessão existe e está ativa antes de começar a monitorar
    const verifyAndStartMonitoring = async () => {
      try {
        const { data, error } = await (supabase
          .from('user_sessions' as any)
          .select('is_active')
          .eq('session_token', sessionToken)
          .eq('user_id', user.id)
          .single() as any) as { data: { is_active: boolean } | null; error: any };

        // Se a sessão não existe ou não está ativa, não iniciar monitoramento
        // (pode ser que o login ainda não foi completado)
        if (error) {
          console.log('🔐 [SessionMonitor] Erro ao verificar sessão inicial:', error);
          // Se erro 406 (not found), tentar novamente depois
          if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
            console.log('🔐 [SessionMonitor] Sessão ainda não criada, tentando novamente em 3 segundos...');
            setTimeout(() => verifyAndStartMonitoring(), 3000);
          }
          return;
        }
        
        if (!data || !data.is_active) {
          console.log('🔐 [SessionMonitor] Sessão não encontrada ou inativa, aguardando...');
          return;
        }

        console.log('🔐 [SessionMonitor] Sessão válida encontrada, iniciando monitoramento para usuário:', user.id);

        // Verificar periodicamente se a sessão ainda está ativa
        const checkSessionStatus = async () => {
          try {
            const { data, error } = await (supabase
              .from('user_sessions' as any)
              .select('is_active, session_token')
              .eq('session_token', sessionToken)
              .eq('user_id', user.id)
              .single() as any) as { data: { is_active: boolean; session_token: string } | null; error: any };

            console.log('🔐 [SessionMonitor] Verificação periódica:', {
              hasData: !!data,
              isActive: data?.is_active,
              error: error?.message
            });

            if (error) {
              console.log('🔐 [SessionMonitor] Erro ao buscar sessão:', error);
              // Se erro 406 (not found), a sessão foi deletada
              if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
                console.log('🔐 [SessionMonitor] Sessão não encontrada - invalidada');
                handleSessionInvalidated();
              }
            } else if (!data || !data.is_active) {
              console.log('🔐 [SessionMonitor] Sessão invalidada detectada na verificação periódica');
              handleSessionInvalidated();
            }
          } catch (error) {
            console.error('🔐 [SessionMonitor] Erro ao verificar sessão:', error);
          }
        };

        // Verificar a cada 3 segundos (mais frequente para detectar mais rápido)
        // Isso garante detecção mesmo se o Realtime falhar
        checkIntervalRef.current = setInterval(checkSessionStatus, 3000);

        // Listener Realtime para mudanças na sessão
        // Usar um nome de canal único mas estável
        const channelName = `user-session-monitor-${user.id}`;
        console.log('🔐 [SessionMonitor] Criando canal Realtime:', channelName);
        
        const channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'user_sessions',
              filter: `user_id=eq.${user.id}`,
            },
            (payload: any) => {
              const currentSessionToken = localStorage.getItem('sessionToken');
              
              console.log('🔐 [SessionMonitor] ⚡ Realtime UPDATE recebido:', {
                session_token: payload.new.session_token,
                current_token: currentSessionToken,
                is_active: payload.new.is_active,
                was_active: payload.old?.is_active,
                tokens_match: payload.new.session_token === currentSessionToken
              });
              
              // Verificar se a sessão atual foi invalidada
              // IMPORTANTE: Verificar se o token corresponde E se foi desativado
              if (
                payload.new.session_token === currentSessionToken &&
                payload.new.is_active === false &&
                (payload.old?.is_active === true || payload.old?.is_active === undefined)
              ) {
                console.log('🔐 [SessionMonitor] ✅ Sessão invalidada via Realtime - DESLOGANDO');
                handleSessionInvalidated();
              } else {
                console.log('🔐 [SessionMonitor] ⏭️ Update não corresponde à sessão atual, ignorando');
              }
            }
          )
          .subscribe((status) => {
            console.log('🔐 [SessionMonitor] Status da subscription Realtime:', status);
            if (status === 'SUBSCRIBED') {
              console.log('🔐 [SessionMonitor] ✅ Subscription Realtime ATIVA para usuário:', user.id);
            } else if (status === 'CHANNEL_ERROR') {
              console.error('🔐 [SessionMonitor] ❌ Erro na subscription Realtime');
            } else if (status === 'TIMED_OUT') {
              console.warn('🔐 [SessionMonitor] ⚠️ Timeout na subscription Realtime');
            }
          });

        channelRef.current = channel;

        // Verificação inicial
        checkSessionStatus();

      } catch (error) {
        console.error('🔐 [SessionMonitor] Erro ao verificar sessão inicial:', error);
      }
    };

    // Aguardar um pouco antes de começar a monitorar para garantir que o login foi completado
    const initTimeout = setTimeout(() => {
      verifyAndStartMonitoring();
    }, 2000); // Aguardar 2 segundos após login para evitar conflitos

    return () => {
      clearTimeout(initTimeout);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      hasNotifiedRef.current = false;
    };
  }, [user?.id, logout]);
};

