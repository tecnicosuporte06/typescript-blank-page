import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useRealtimeNotifications } from "@/components/RealtimeNotificationProvider";
import { useNotifications } from "@/hooks/useNotifications";
import { getConnectionColor } from '@/lib/utils';
import { getInitials, getAvatarColor } from '@/lib/avatarUtils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageStatusIndicator } from "@/components/ui/message-status-indicator";
import { useWhatsAppConversations, WhatsAppConversation } from "@/hooks/useWhatsAppConversations";
import { useConversationMessages } from "@/hooks/useConversationMessages";
import { useAuth } from "@/hooks/useAuth";
import { useTags } from "@/hooks/useTags";
import { useProfileImages } from "@/hooks/useProfileImages";
import { useInstanceAssignments } from "@/hooks/useInstanceAssignments";
import { useWorkspaceConnections } from "@/hooks/useWorkspaceConnections";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { usePipelinesContext } from "@/contexts/PipelinesContext";
import { useQueues } from "@/hooks/useQueues";
import { useWorkspaceAgent } from "@/hooks/useWorkspaceAgent";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parsePhoneNumber } from 'libphonenumber-js';
import { MediaViewer } from "@/components/chat/MediaViewer";
import { MediaUpload } from "@/components/chat/MediaUpload";
import { QuickItemsModal } from "@/components/modals/QuickItemsModal";
import { QuotedMessagePreview } from "@/components/chat/QuotedMessagePreview";
import { PeekConversationModal } from "@/components/modals/PeekConversationModal";
import { AcceptConversationButton } from "@/components/chat/AcceptConversationButton";
import { EndConversationButton } from "@/components/chat/EndConversationButton";
import { TransferConversationModal } from "@/components/modals/TransferConversationModal";
import { AddTagButton } from "@/components/chat/AddTagButton";
import { ContactSidePanel } from "@/components/ContactSidePanel";
import { ContactTags } from "@/components/chat/ContactTags";
import { MessageContextMenu } from "@/components/chat/MessageContextMenu";
import { MessageSelectionBar } from "@/components/chat/MessageSelectionBar";
import { ForwardMessageModal } from "@/components/modals/ForwardMessageModal";
import { ConnectionBadge } from "@/components/chat/ConnectionBadge";
import { ReplyPreview } from "@/components/chat/ReplyPreview";
import { SelectAgentModal } from "@/components/modals/SelectAgentModal";
import { ChangeAgentModal } from "@/components/modals/ChangeAgentModal";
import { QuickFunnelsModal } from "@/components/modals/QuickFunnelsModal";
import { AssignmentHistoryModal } from "@/components/modals/AssignmentHistoryModal";
import { DateSeparator } from "@/components/chat/DateSeparator";
import { FloatingDateIndicator } from "@/components/chat/FloatingDateIndicator";
import { useFloatingDate, groupMessagesByDate, formatMessageDate } from "@/hooks/useFloatingDate";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Send, Bot, Phone, MoreVertical, Circle, MessageCircle, ArrowRight, Settings, Users, Trash2, ChevronDown, Filter, Eye, RefreshCw, Mic, Square, X, Check, PanelLeft, UserCircle, UserX, UsersRound, Tag, Plus, Loader2, Workflow, Clock, Music } from "lucide-react";
import { WhatsAppChatSkeleton } from "@/components/chat/WhatsAppChatSkeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { generateRandomId } from "@/lib/generate-random-id";
import { useQuickMessages } from "@/hooks/useQuickMessages";

type ConversationMessage = ReturnType<typeof useConversationMessages>['messages'][number];
type DisplayMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
interface WhatsAppChatProps {
  isDarkMode?: boolean;
  selectedConversationId?: string | null;
  onlyMessages?: boolean;
}
type LameJsModule = {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  };
};

let lamejsLoaderPromise: Promise<LameJsModule> | null = null;
const loadLameJs = async (): Promise<LameJsModule> => {
  if (typeof window === "undefined") {
    throw new Error("lamejs não está disponível no ambiente atual.");
  }

  const globalAny = window as any;
  if (globalAny.lamejs?.Mp3Encoder) {
    return globalAny.lamejs as LameJsModule;
  }

  if (!lamejsLoaderPromise) {
    lamejsLoaderPromise = new Promise<LameJsModule>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js";
      script.async = true;
      script.onload = () => {
        if (globalAny.lamejs?.Mp3Encoder) {
          resolve(globalAny.lamejs as LameJsModule);
        } else {
          reject(new Error("Não foi possível inicializar lamejs após carregar o script."));
        }
      };
      script.onerror = () => reject(new Error("Falha ao baixar o script do lamejs."));
      document.head.appendChild(script);
    });
  }

  return lamejsLoaderPromise;
};
export function WhatsAppChat({
  isDarkMode = false,
  selectedConversationId,
  onlyMessages = false
}: WhatsAppChatProps) {
  // Usar notificações para saber quais conversas têm mensagens não lidas  
  const { notifications } = useRealtimeNotifications();
  const { markContactAsRead } = useNotifications();
  
  // Usar hook completo de conversas
  const {
    conversations,
    conversationCounts,
    loadMoreConversations,
    markAsRead,
    assumirAtendimento,
    reativarIA,
    clearAllConversations,
    acceptConversation,
    fetchConversations,
    loading,
    sendMessage
  } = useWhatsAppConversations();
  
  useEffect(() => {
    console.log('🔔 [WhatsAppChat] Notificações MUDARAM:', {
      total: notifications.length,
      timestamp: new Date().toISOString(),
      notifications: notifications.map(n => ({
        conversationId: n.conversationId,
        content: n.content
      }))
    });
  }, [notifications]);
  
  const notificationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    notifications.forEach((notif) => {
      counts.set(
        notif.conversationId,
        (counts.get(notif.conversationId) || 0) + 1
      );
    });
    return counts;
  }, [notifications]);

  const conversationNotifications = useMemo(() => {
    if (notificationCounts.size > 0) {
      console.log('🔔 [WhatsAppChat] Notificações por usuário:', Array.from(notificationCounts.entries()));
      return notificationCounts;
    }

    const fallbackMap = new Map<string, number>();
    conversations.forEach((conversation) => {
      const unread = Math.max(conversation.unread_count ?? 0, 0);
      if (unread > 0) {
        fallbackMap.set(conversation.id, unread);
      }
    });

    console.log('🔔 [WhatsAppChat] Fallback global de unread_count:', Array.from(fallbackMap.entries()));
    return fallbackMap;
  }, [notificationCounts, conversations]);
  
  // Debug: Detectar mudanças no array de conversas
  useEffect(() => {
    console.log('🔄 [WhatsAppChat] Array de conversas MUDOU:', {
      total: conversations.length,
      conversationIds: conversations.map(c => ({ id: c.id, name: c.contact.name, status: c.status })),
      timestamp: new Date().toISOString()
    });
  }, [conversations.length, conversations]);


  // ✅ Hook específico para mensagens (lazy loading)
  const {
    messages,
    loading: messagesLoading,
    loadingMore,
    hasMore,
    loadInitial: loadMessages,
    loadMore: loadMoreMessages,
    addMessage,
    updateMessage,
    removeMessage, // ✅ NOVO: função para remover mensagem
    clearMessages
  } = useConversationMessages();
  const {
    selectedWorkspace
  } = useWorkspace();
  const { members: workspaceMembers } = useWorkspaceMembers(selectedWorkspace?.workspace_id);
  const assignedUsersMap = useMemo(() => {
    const map = new Map<string, { name?: string | null; avatar?: string | null }>();
    workspaceMembers.forEach(member => {
      const userId = member.user?.id || member.user_id;
      if (userId) {
        map.set(userId, {
          name: member.user?.name,
          avatar: member.user?.avatar || null
        });
      }
    });
    return map;
  }, [workspaceMembers]);
  const {
    updateConversationAgentStatus
  } = usePipelinesContext();
  const {
    user,
    hasRole
  } = useAuth();
  const {
    tags
  } = useTags();
  const {
    fetchProfileImage,
    isLoading: isLoadingProfileImage
  } = useProfileImages();
  const {
    assignments
  } = useInstanceAssignments();
  const {
    connections: workspaceConnections,
    isLoading: connectionsLoading
  } = useWorkspaceConnections(selectedWorkspace?.workspace_id);
  const {
    queues,
    loading: queuesLoading
  } = useQueues();
  const {
    toast
  } = useToast();

  // ✅ Mensagens rápidas (texto) para o atalho “/”
  const { messages: quickTextMessages } = useQuickMessages();
  
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversation | null>(null);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const conversationListRootRef = useRef<HTMLDivElement | null>(null);
  const searchDebounceFirstRunRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [changeAgentModalOpen, setChangeAgentModalOpen] = useState(false);
  const [assignmentHistoryModalOpen, setAssignmentHistoryModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [quickAudioPreview, setQuickAudioPreview] = useState<{
    file: { name: string; url: string };
    title: string;
  } | null>(null);
  const [isQuickAudioPreviewSending, setIsQuickAudioPreviewSending] = useState(false);
  const [recordedAudioPreview, setRecordedAudioPreview] = useState<{
    blob: Blob;
    fileName: string;
    content: string;
    previewUrl: string;
  } | null>(null);
  const [isRecordedAudioSending, setIsRecordedAudioSending] = useState(false);
  const [isOpeningConversation, setIsOpeningConversation] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const slashReplaceRangeRef = useRef<{ start: number; end: number } | null>(null);
  
  // ✅ Estado para controlar quantas mensagens mostrar (Infinite Scroll com dados em memória)
  const [visibleMessagesCount, setVisibleMessagesCount] = useState(10);
  const [isVisualLoading, setIsVisualLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const messageText = selectedConversation ? (messageDrafts[selectedConversation.id] ?? "") : "";

  const slashSuggestions = useMemo(() => {
    if (!slashOpen) return [];
    const list = quickTextMessages || [];
    const q = (slashQuery || "").trim().toLowerCase();
    const filtered = q
      ? list.filter((m: any) => {
          const title = (m?.title || "").toLowerCase();
          const content = (m?.content || "").toLowerCase();
          return title.includes(q) || content.includes(q);
        })
      : list;
    return filtered.slice(0, 8);
  }, [quickTextMessages, slashOpen, slashQuery]);

  // 🔎 Busca por conversa deve vir do banco (debounce)
  useEffect(() => {
    // Evitar disparar no primeiro render (o hook já faz fetch quando workspace muda)
    if (searchDebounceFirstRunRef.current) {
      searchDebounceFirstRunRef.current = false;
      return;
    }

    const handle = window.setTimeout(() => {
      fetchConversations({ search: searchTerm });
    }, 350);

    return () => window.clearTimeout(handle);
  }, [searchTerm, fetchConversations]);

  // ♾️ Scroll infinito na lista de conversas (listener no viewport real do ScrollArea)
  useEffect(() => {
    const root = conversationListRootRef.current;
    if (!root) return;

    const viewport = root.querySelector?.('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    const scroller = viewport ?? root;

    const onScroll = () => {
      const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (remaining < 500) {
        loadMoreConversations();
      }
    };

    // dispara uma vez (após o layout): se a lista inicial não preenche a altura, já tenta carregar mais
    requestAnimationFrame(onScroll);

    scroller.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => {
      scroller.removeEventListener('scroll', onScroll as any);
    };
  }, [loadMoreConversations, conversations.length, loading]);

  // Detectar mudanças no tema
  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    
    // Verificar tema inicial
    checkTheme();
    
    // Observar mudanças na classe 'dark' do documentElement
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);

  const updateMessageDraft = useCallback((conversationId: string, value: string) => {
    setMessageDrafts(prev => {
      if (prev[conversationId] === value) return prev;
      return { ...prev, [conversationId]: value };
    });
  }, []);

  const insertMessageIntoComposer = useCallback((content: string) => {
    if (!selectedConversation) return;
    updateMessageDraft(selectedConversation.id, content);
    requestAnimationFrame(() => {
      const el = composerTextareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value?.length ?? 0;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // ignore
      }
    });
  }, [selectedConversation?.id, updateMessageDraft]);

  const clearMessageDraft = useCallback((conversationId: string) => {
    setMessageDrafts(prev => {
      if (!(conversationId in prev)) return prev;
      const { [conversationId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // Verificar se há agente ativo na conversa selecionada
  const { hasAgent, isLoading: agentLoading, agent } = useWorkspaceAgent(selectedConversation?.id);

  // Log do estado do agente após selectedConversation estar disponível
  useEffect(() => {
    if (selectedConversation) {
      console.log('🎯 WhatsAppChat - Estado do Agente:', { 
        hasAgent, 
        agentLoading, 
        agentName: agent?.name,
        conversationId: selectedConversation.id,
        conversationActive: selectedConversation.agente_ativo,
        contactName: selectedConversation.contact.name
      });
    }
  }, [hasAgent, agentLoading, agent, selectedConversation?.agente_ativo, selectedConversation?.id]);

  // ✅ CRÍTICO: Sincronizar selectedConversation quando conversations mudar
  useEffect(() => {
    if (!selectedConversation) return;
    
    console.log('🔍 Verificando sincronização:', {
      selectedConvId: selectedConversation.id,
      totalConversations: conversations.length,
      selectedAgenteAtivo: selectedConversation.agente_ativo
    });
    
    const updatedConversation = conversations.find(c => c.id === selectedConversation.id);
    
    if (!updatedConversation) {
      console.log('⚠️ Conversa não encontrada no array');
      return;
    }
    
    console.log('🔍 Conversa encontrada no array:', {
      found: true,
      updatedAgenteAtivo: updatedConversation.agente_ativo,
      currentAgenteAtivo: selectedConversation.agente_ativo,
      needsUpdate: updatedConversation.agente_ativo !== selectedConversation.agente_ativo
    });
    
    // ✅ SEMPRE atualizar para garantir que temos a versão mais recente
    if (updatedConversation.agente_ativo !== selectedConversation.agente_ativo || 
        updatedConversation.agent_active_id !== selectedConversation.agent_active_id ||
        updatedConversation._updated_at !== selectedConversation._updated_at) {
      console.log('🔄 Atualizando selectedConversation:', {
        oldAgenteAtivo: selectedConversation.agente_ativo,
        newAgenteAtivo: updatedConversation.agente_ativo,
        oldAgentId: selectedConversation.agent_active_id,
        newAgentId: updatedConversation.agent_active_id,
        timestamp: updatedConversation._updated_at
      });
      setSelectedConversation(updatedConversation);
    }
  }, [conversations, selectedConversation]);

  // 🔄 Listener realtime para atualizações de conversas
  useEffect(() => {
    if (!selectedConversation?.id) return;

    console.log('👂 Configurando listener realtime para conversa:', selectedConversation.id);

    const channel = supabase
      .channel(`conversation-${selectedConversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${selectedConversation.id}`
        },
        (payload) => {
          console.log('🔔 Atualização realtime recebida:', payload);
          
          // Atualizar imediatamente o estado local
          setSelectedConversation(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              agente_ativo: payload.new.agente_ativo,
              agent_active_id: payload.new.agent_active_id,
              _updated_at: Date.now()
            };
          });
        }
      )
      .subscribe();

    return () => {
      console.log('🔌 Desconectando listener realtime');
      supabase.removeChannel(channel);
    };
  }, [selectedConversation?.id]);
  const [quickPhoneNumber, setQuickPhoneNumber] = useState("");
  const [isCreatingQuickConversation, setIsCreatingQuickConversation] = useState(false);
  const [quickCountryCode, setQuickCountryCode] = useState("55"); // ✅ padrão Brasil
  const [isCountryCodeOpen, setIsCountryCodeOpen] = useState(false);
  const [countryCodeSearch, setCountryCodeSearch] = useState("");
  const [showAllQueues, setShowAllQueues] = useState(true);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [showSelectAgentModal, setShowSelectAgentModal] = useState(false);
  const [quickFunnelsModalOpen, setQuickFunnelsModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>("");
  const [isUpdatingProfileImages, setIsUpdatingProfileImages] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [customFiltersOpen, setCustomFiltersOpen] = useState(false);

  // Estados para as abas baseadas no papel
  const [activeTab, setActiveTab] = useState<string>('all');

  const isMasterUser = hasRole(['master']);

  // Definir abas baseado no papel do usuário  
  const getUserTabs = () => {
    const userProfile = user?.profile;
    if (userProfile === 'master' || userProfile === 'admin') {
      // Master e Admin: apenas "Todas" e "Não designadas"
      return [{
        id: 'all',
        label: 'Todas as conversas',
        count: conversations.filter(c => c.status !== 'closed').length
      }, {
        id: 'unassigned',
        label: 'Conversas não atribuídas',
        count: conversations.filter(c => !c.assigned_user_id && c.status !== 'closed').length
      }];
    } else {
      // User: apenas suas conversas e não designadas (excluindo encerradas)
      const myConversations = conversations.filter(c => c.assigned_user_id === user?.id && c.status !== 'closed');
      const unassignedConversations = conversations.filter(c => !c.assigned_user_id && c.status !== 'closed');
      return [{
        id: 'mine',
        label: 'Minhas',
        count: myConversations.length
      }, {
        id: 'unassigned',
        label: 'Conversas não atribuídas',
        count: unassignedConversations.length
      }];
    }
  };
  const tabs = getUserTabs();

  // Filtrar conversas baseado na aba ativa e filtros (useMemo para garantir re-render)
  const filteredConversations = useMemo(() => {
    let filtered = [];

    console.log('🔍 [Filter] Recalculando conversas filtradas:', {
      totalConversations: conversations.length,
      activeTab,
      selectedTags,
      userId: user?.id,
      timestamp: new Date().toISOString()
    });

    // Filtrar por aba
    switch (activeTab) {
      case 'all':
        // Incluir todas exceto fechadas
        filtered = conversations.filter(c => c.status !== 'closed');
        break;
      case 'mine':
        filtered = conversations.filter(c => c.assigned_user_id === user?.id && c.status !== 'closed');
        break;
      case 'unassigned':
        filtered = conversations.filter(c => !c.assigned_user_id && c.status !== 'closed');
        break;
      case 'unread':
        // Filtrar por conversas que TÊM notificações não lidas para este usuário
        filtered = conversations.filter(c => conversationNotifications.has(c.id) && c.status !== 'closed');
        break;
      default:
        filtered = conversations.filter(c => c.status !== 'closed');
    }

    console.log('🔍 [Filter] Após filtro de aba:', {
      filtered: filtered.length,
      activeTab
    });

    // Filtrar por tags se selecionadas
    if (selectedTags.length > 0) {
      filtered = filtered.filter(conv => {
        // Buscar tags do CONTATO (não da conversa)
        const contactId = conv.contact?.id;
        if (!contactId) return false;
        
        // Verificar se o contato tem pelo menos uma das tags selecionadas
        const contactHasAnyTag = selectedTags.some(selectedTagId => 
          tags.some(tag => 
            tag.id === selectedTagId && 
            tag.contact_tags?.some(ct => ct.contact_id === contactId)
          )
        );
        
        return contactHasAnyTag;
      });
    }

    // Filtrar por conexão se selecionada
    if (selectedConnection && selectedConnection !== "all") {
      filtered = filtered.filter(conv => conv.connection_id === selectedConnection);
    }

    // 🔎 Busca por texto é feita no banco (ver useEffect de debounce).

    console.log('✅ [Filter] Conversas filtradas finais:', filtered.length);
    return filtered;
  }, [conversations, activeTab, selectedTags, selectedConnection, user?.id, conversationNotifications, tags]);
  const [peekModalOpen, setPeekModalOpen] = useState(false);
  const [peekConversationId, setPeekConversationId] = useState<string | null>(null);
  const [contactPanelOpen, setContactPanelOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isConvertingAudio, setIsConvertingAudio] = useState(false);
  const [quickItemsModalOpen, setQuickItemsModalOpen] = useState(false);

  // Estados para modo de seleção e encaminhamento
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);

  // Hook para data flutuante
  const { floatingDate, shouldShowFloating } = useFloatingDate(messagesScrollRef, messages);

  // Agrupar mensagens por data (apenas as que devem estar visíveis)
  const messagesByDate = useMemo(() => {
    // Pegar as últimas N mensagens baseadas no visibleMessagesCount
    const visibleMessages = messages.slice(-visibleMessagesCount);
    return groupMessagesByDate(visibleMessages);
  }, [messages, visibleMessagesCount]);

  const handleTransferSuccess = useCallback(
    async ({
      conversationId,
      assignedUserId,
      assignedUserName,
      connectionId,
      queueId,
    }: {
      conversationId: string;
      assignedUserId: string | null;
      assignedUserName?: string | null;
      connectionId: string;
      queueId?: string | null;
    }) => {
      await fetchConversations();
      setSelectedConversation((prev) => {
        if (!prev || prev.id !== conversationId) {
          return prev;
        }

        const connectionInfo = workspaceConnections.find(
          (connection) => connection.id === connectionId
        );

        return {
          ...prev,
          assigned_user_id: assignedUserId,
          assigned_user_name:
            assignedUserId !== null
              ? assignedUserName ?? prev.assigned_user_name
              : null,
          connection_id: connectionId,
          connection: connectionInfo
            ? {
                id: connectionInfo.id,
                instance_name: connectionInfo.instance_name,
                phone_number: connectionInfo.phone_number,
                status: connectionInfo.status,
              }
            : prev.connection,
          queue_id: queueId ?? null,
        };
      });
    },
    [fetchConversations, workspaceConnections]
  );

  const handleDeleteConversation = useCallback(async () => {
    if (!selectedConversation) return;

    try {
      setIsDeletingConversation(true);
      const conversationId = selectedConversation.id;

      const { error: messagesError } = await supabase
        .from("messages")
        .delete()
        .eq("conversation_id", conversationId);

      if (messagesError) {
        throw messagesError;
      }

      const { error: conversationError } = await supabase
        .from("conversations")
        .delete()
        .eq("id", conversationId);

      if (conversationError) {
        throw conversationError;
      }

      toast({
        title: "Atendimento deletado",
        description: "O atendimento foi removido com sucesso.",
      });

      clearMessageDraft(conversationId);
      setDeleteDialogOpen(false);
      setSelectedConversation(null);
      clearMessages();
      await fetchConversations();
    } catch (error: any) {
      console.error("Erro ao deletar atendimento:", error);
      toast({
        title: "Erro ao deletar atendimento",
        description:
          error?.message || "Não foi possível concluir a exclusão.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingConversation(false);
    }
  }, [
    clearMessageDraft,
    clearMessages,
    fetchConversations,
    selectedConversation,
    toast,
  ]);

  // Estados para controle de carregamento manual
  const isInitialLoadRef = useRef(true);
  
  // ✅ Refs para algoritmo de preservação de posição visual (infinite scroll upwards)
  const isLoadingMoreRef = useRef(false);
  const scrollPositionBeforeLoadRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const lastMessageLengthRef = useRef(0);
  
  // ✅ MUTEX: Prevenir envio duplicado
  const sendingRef = useRef<Set<string>>(new Set());
  
  // ✅ Estado para desabilitar botão durante envio
  const [isSending, setIsSending] = useState(false);

  // Marcar como lida automaticamente ao abrir conversa
  useEffect(() => {
    if (isMasterUser) return;
    if (selectedConversation && conversationNotifications.has(selectedConversation.id)) {
      console.log('📖 Marcando conversa como lida:', selectedConversation.contact.name);
      markContactAsRead(selectedConversation.id);
    }
  }, [selectedConversation?.id, isMasterUser]);

  // Fechar menu de “/” ao trocar de conversa
  useEffect(() => {
    setSlashOpen(false);
    setSlashQuery("");
    slashReplaceRangeRef.current = null;
  }, [selectedConversation?.id]);


  // ✅ Enviar mensagem - OTIMIZADO
  const handleSendMessage = async () => {
    if (!selectedConversation || isSending) return;
    
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage) return;
    
    const messageKey = `${selectedConversation.id}-${trimmedMessage}`;
    if (sendingRef.current.has(messageKey)) return;
    
    setIsSending(true);
    sendingRef.current.add(messageKey);
    
    const textToSend = trimmedMessage;
    clearMessageDraft(selectedConversation.id);
    
    try {
      const clientMessageId = generateRandomId();
      
      // ✅ Mensagem otimista - começa com 'sending'
      const optimisticMessage = {
        id: clientMessageId,
        external_id: clientMessageId,
        conversation_id: selectedConversation.id,
        content: textToSend,
        message_type: 'text' as const,
        sender_type: 'agent' as const,
        sender_id: user?.id,
        created_at: new Date().toISOString(),
        status: 'sending' as const,
        workspace_id: selectedWorkspace?.workspace_id || '',
        ...(replyingTo && {
          reply_to_message_id: replyingTo.id,
          quoted_message: {
            id: replyingTo.external_id || replyingTo.evolution_key_id || replyingTo.id,
            content: replyingTo.content,
            sender_type: replyingTo.sender_type,
            external_id: replyingTo.external_id || replyingTo.evolution_key_id,
            message_type: replyingTo.message_type,
            file_url: replyingTo.file_url,
            file_name: replyingTo.file_name
          }
        })
      };
      
      addMessage(optimisticMessage);
      setReplyingTo(null);
      
      // ✅ Enviar para backend (assíncrono, não bloqueia UI)
      supabase.functions.invoke('test-send-msg', {
        body: {
          conversation_id: selectedConversation.id,
          content: textToSend,
          message_type: 'text',
          sender_id: user?.id,
          sender_type: 'agent',
          clientMessageId: clientMessageId,
          ...(replyingTo && {
            reply_to_message_id: replyingTo.id,
            quoted_message: {
              id: replyingTo.external_id || replyingTo.evolution_key_id || replyingTo.id,
              content: replyingTo.content,
              sender_type: replyingTo.sender_type,
              external_id: replyingTo.external_id || replyingTo.evolution_key_id,
              message_type: replyingTo.message_type,
              file_url: replyingTo.file_url,
              file_name: replyingTo.file_name
            }
          })
        },
        headers: {
          'x-system-user-id': user?.id || '',
          'x-system-user-email': user?.email || '',
          'x-workspace-id': selectedWorkspace?.workspace_id || ''
        }
      }).then(({ error, data: sendResult }) => {
        if (error || !sendResult?.success) {
          console.error('❌ Erro ao enviar:', error);
          updateMessage(clientMessageId, { status: 'failed' });
          toast({
            title: "Erro ao enviar",
            description: "Não foi possível enviar a mensagem.",
            variant: "destructive"
          });
        }
      });
      
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast({
        title: "Erro ao enviar",
        description: "Não foi possível enviar a mensagem.",
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
      setTimeout(() => sendingRef.current.delete(messageKey), 500);
    }
  };

  // ✅ Enviar mensagens rápidas - OTIMIZADO
  const handleSendQuickMessage = async (content: string, type: 'text') => {
    if (!selectedConversation) return;
    
    const messageKey = `quick-${selectedConversation.id}-${content.trim()}`;
    if (sendingRef.current.has(messageKey)) return;
    sendingRef.current.add(messageKey);
    
    try {
      const clientMessageId = generateRandomId();
      
      const optimisticMessage = {
        id: clientMessageId,
        external_id: clientMessageId,
        conversation_id: selectedConversation.id,
        content: content,
        message_type: type as any,
        sender_type: 'agent' as const,
        sender_id: user?.id,
        created_at: new Date().toISOString(),
        status: 'sending' as const,
        workspace_id: selectedWorkspace?.workspace_id || ''
      };
      
      addMessage(optimisticMessage);
      
      // ✅ Enviar para backend (assíncrono)
      supabase.functions.invoke('test-send-msg', {
        body: {
          conversation_id: selectedConversation.id,
          content: content,
          message_type: type,
          sender_id: user?.id,
          sender_type: 'agent',
          clientMessageId: clientMessageId
        },
        headers: {
          'x-system-user-id': user?.id || '',
          'x-system-user-email': user?.email || '',
          'x-workspace-id': selectedWorkspace?.workspace_id || ''
        }
      }).catch(error => {
        console.error('Erro ao enviar mensagem rápida:', error);
        updateMessage(clientMessageId, { status: 'failed' });
      });
      
    } finally {
      setTimeout(() => sendingRef.current.delete(messageKey), 500);
    }
  };

  const applySlashQuickMessage = useCallback((message: any) => {
    if (!selectedConversation) return;

    const current = messageDrafts[selectedConversation.id] ?? "";
    const range = slashReplaceRangeRef.current;
    const start = range?.start ?? current.lastIndexOf("/");
    const end = range?.end ?? (start >= 0 ? start + 1 : 0);
    const safeStart = start >= 0 ? start : 0;
    const safeEnd = end > safeStart ? end : safeStart;

    const content = (message?.content ?? "") as string;
    const shouldEdit = Boolean(message?.allow_edit_before_send);

    setSlashOpen(false);
    setSlashQuery("");
    slashReplaceRangeRef.current = null;

    if (shouldEdit) {
      const next = current.slice(0, safeStart) + content + current.slice(safeEnd);
      insertMessageIntoComposer(next);
      return;
    }

    // Enviar direto
    const remaining = current.slice(0, safeStart) + current.slice(safeEnd);
    if (remaining.trim()) {
      updateMessageDraft(selectedConversation.id, remaining);
    } else {
      clearMessageDraft(selectedConversation.id);
    }
    handleSendQuickMessage(content, "text");
  }, [
    selectedConversation?.id,
    messageDrafts,
    insertMessageIntoComposer,
    updateMessageDraft,
    clearMessageDraft,
    handleSendQuickMessage
  ]);
  const handleSendQuickAudio = async (file: {
    name: string;
    url: string;
  }, content: string) => {
    if (!selectedConversation) return;
    
    // ✅ MUTEX: Prevenir duplicação (SEM Date.now())
    const messageKey = `audio-${selectedConversation.id}-${file.url}`;
    if (sendingRef.current.has(messageKey)) {
      console.log('⏭️ Ignorando envio duplicado de áudio');
      return;
    }
    sendingRef.current.add(messageKey);
    
    try {
      // ✅ Gerar clientMessageId ANTES de criar mensagem otimista
      const clientMessageId = generateRandomId();
      
      const optimisticMessage = {
        id: clientMessageId, // ✅ Usar clientMessageId como ID temporário
        external_id: clientMessageId, // ✅ Incluir external_id para correspondência
        conversation_id: selectedConversation.id,
        content: content || '[ÁUDIO]',
        message_type: 'audio' as const,
        sender_type: 'agent' as const,
        sender_id: user?.id,
        file_url: file.url,
        file_name: file.name,
        created_at: new Date().toISOString(),
        status: 'sending' as const,
        workspace_id: selectedWorkspace?.workspace_id || ''
      };
      addMessage(optimisticMessage);
      const {
        data: sendResult,
        error
      } = await supabase.functions.invoke('test-send-msg', {
        body: {
          conversation_id: selectedConversation.id,
          content: content || '[ÁUDIO]',
          message_type: 'audio',
          sender_id: user?.id,
          sender_type: 'agent',
          file_url: file.url,
          file_name: file.name,
          clientMessageId: clientMessageId // ✅ Usar o mesmo clientMessageId
        },
        headers: {
          'x-system-user-id': user?.id || '',
          'x-system-user-email': user?.email || '',
          'x-workspace-id': selectedWorkspace?.workspace_id || ''
        }
      });
      if (error || !sendResult?.success) {
        throw new Error(sendResult?.error || 'Erro ao enviar áudio');
      }
      // ✅ Não remover mensagem otimista - a subscription realtime vai substituí-la
    } catch (error) {
      console.error('Erro ao enviar áudio rápido:', error);
    } finally {
      setTimeout(() => sendingRef.current.delete(messageKey), 1000);
    }
  };
  const requestQuickAudioPreview = (file: { name: string; url: string }, title: string) => {
    setQuickAudioPreview({ file, title });
  };
  const cancelQuickAudioPreview = () => {
    setQuickAudioPreview(null);
  };
  const confirmQuickAudioPreviewSend = async () => {
    if (!quickAudioPreview) return;
    setIsQuickAudioPreviewSending(true);
    try {
      await handleSendQuickAudio(quickAudioPreview.file, quickAudioPreview.title);
      setQuickAudioPreview(null);
    } catch (error) {
      console.error('Erro ao enviar áudio a partir do preview:', error);
    } finally {
      setIsQuickAudioPreviewSending(false);
    }
  };
  const cancelRecordedAudioPreview = () => {
    setRecordedAudioPreview((prev) => {
      if (prev?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return null;
    });
  };
  const confirmRecordedAudioPreviewSend = async () => {
    if (!recordedAudioPreview || !selectedConversation) return;
    setIsRecordedAudioSending(true);
    const { fileName, blob, content, previewUrl } = recordedAudioPreview;
    try {
      const filePath = `messages/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, blob, { contentType: 'audio/mpeg' });
      if (uploadError) {
        throw uploadError;
      }
      const { data: { publicUrl } } = await supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(filePath);
      const clientMessageId = generateRandomId();
      const optimisticMessage = {
        id: clientMessageId,
        external_id: clientMessageId,
        conversation_id: selectedConversation.id,
        content,
        message_type: 'audio' as const,
        sender_type: 'agent' as const,
        sender_id: user?.id,
        file_url: publicUrl,
        file_name: fileName,
        created_at: new Date().toISOString(),
        status: 'sending' as const,
        workspace_id: selectedWorkspace?.workspace_id || ''
      };
      addMessage(optimisticMessage);
      clearMessageDraft(selectedConversation.id);
      const { data: sendResult, error: sendError } = await supabase.functions.invoke('test-send-msg', {
        body: {
          conversation_id: selectedConversation.id,
          content,
          message_type: 'audio',
          sender_id: user?.id,
          sender_type: 'agent',
          file_url: publicUrl,
          file_name: fileName,
          clientMessageId
        },
        headers: {
          'x-system-user-id': user?.id || '',
          'x-workspace-id': selectedWorkspace?.workspace_id || '',
          'x-system-user-email': user?.email || ''
        }
      });
      if (sendError) {
        console.error('❌ Erro ao enviar áudio gravado:', sendError);
        updateMessage(clientMessageId, { status: 'failed' });
        toast({
          title: "Erro ao enviar áudio",
          description: sendError.message,
          variant: "destructive"
        });
      } else {
        updateMessage(clientMessageId, {
          status: 'sent',
          external_id: sendResult?.message?.external_id || sendResult?.message?.id || clientMessageId
        });
      }
    } catch (error: any) {
      console.error('Erro ao enviar áudio gravado:', error);
      toast({
        title: "Erro ao enviar áudio",
        description: error?.message || "Tente novamente",
        variant: "destructive"
      });
    } finally {
      setIsRecordedAudioSending(false);
      cancelRecordedAudioPreview();
    }
  };
  const activeAudioPreview = quickAudioPreview
    ? {
        label: quickAudioPreview.title || quickAudioPreview.file.name,
        src: quickAudioPreview.file.url,
        sending: isQuickAudioPreviewSending,
        onSend: confirmQuickAudioPreviewSend,
        onCancel: cancelQuickAudioPreview
      }
    : recordedAudioPreview
      ? {
          label: recordedAudioPreview.fileName,
          src: recordedAudioPreview.previewUrl,
          sending: isRecordedAudioSending,
          onSend: confirmRecordedAudioPreviewSend,
          onCancel: cancelRecordedAudioPreview
        }
      : null;
  const handleSendQuickMedia = async (file: {
    name: string;
    url: string;
  }, content: string, type: 'image' | 'video') => {
    if (!selectedConversation) return;
    
    // ✅ MUTEX: Prevenir duplicação (SEM Date.now())
    const messageKey = `media-${selectedConversation.id}-${file.url}`;
    if (sendingRef.current.has(messageKey)) {
      console.log('⏭️ Ignorando envio duplicado de mídia');
      return;
    }
    sendingRef.current.add(messageKey);
    
    try {
      // ✅ Gerar clientMessageId ANTES de criar mensagem otimista
      const clientMessageId = generateRandomId();
      
      const optimisticMessage = {
        id: clientMessageId, // ✅ Usar clientMessageId como ID temporário
        external_id: clientMessageId, // ✅ Incluir external_id para correspondência
        conversation_id: selectedConversation.id,
        content: content || `[${type.toUpperCase()}]`,
        message_type: type as any,
        sender_type: 'agent' as const,
        sender_id: user?.id,
        file_url: file.url,
        file_name: file.name,
        created_at: new Date().toISOString(),
        status: 'sending' as const,
        workspace_id: selectedWorkspace?.workspace_id || ''
      };
      addMessage(optimisticMessage);
      const {
        data: sendResult,
        error
      } = await supabase.functions.invoke('test-send-msg', {
        body: {
          conversation_id: selectedConversation.id,
          content: content || `[${type.toUpperCase()}]`,
          message_type: type,
          sender_id: user?.id,
          sender_type: 'agent',
          file_url: file.url,
          file_name: file.name,
          clientMessageId: clientMessageId // ✅ Usar o mesmo clientMessageId
        },
        headers: {
          'x-system-user-id': user?.id || '',
          'x-system-user-email': user?.email || '',
          'x-workspace-id': selectedWorkspace?.workspace_id || ''
        }
      });
      if (error || !sendResult?.success) {
        throw new Error(sendResult?.error || 'Erro ao enviar mídia');
      }
      // ✅ Não remover mensagem otimista - a subscription realtime vai substituí-la
    } catch (error) {
      console.error('Erro ao enviar mídia rápida:', error);
    } finally {
      setTimeout(() => sendingRef.current.delete(messageKey), 1000);
    }
  };
  const handleSendQuickDocument = async (file: {
    name: string;
    url: string;
  }, content: string) => {
    if (!selectedConversation) return;
    
    // ✅ MUTEX: Prevenir duplicação (SEM Date.now())
    const messageKey = `doc-${selectedConversation.id}-${file.url}`;
    if (sendingRef.current.has(messageKey)) {
      console.log('⏭️ Ignorando envio duplicado de documento');
      return;
    }
    sendingRef.current.add(messageKey);
    
    try {
      // ✅ Gerar clientMessageId ANTES de criar mensagem otimista
      const clientMessageId = generateRandomId();
      
      const optimisticMessage = {
        id: clientMessageId, // ✅ Usar clientMessageId como ID temporário
        external_id: clientMessageId, // ✅ Incluir external_id para correspondência
        conversation_id: selectedConversation.id,
        content: content || '[DOCUMENTO]',
        message_type: 'document' as any,
        sender_type: 'agent' as const,
        sender_id: user?.id,
        file_url: file.url,
        file_name: file.name,
        created_at: new Date().toISOString(),
        status: 'sending' as const,
        workspace_id: selectedWorkspace?.workspace_id || ''
      };
      addMessage(optimisticMessage);
      const {
        data: sendResult,
        error
      } = await supabase.functions.invoke('test-send-msg', {
        body: {
          conversation_id: selectedConversation.id,
          content: content || '[DOCUMENTO]',
          message_type: 'document',
          sender_id: user?.id,
          sender_type: 'agent',
          file_url: file.url,
          file_name: file.name,
          clientMessageId: clientMessageId // ✅ Usar o mesmo clientMessageId
        },
        headers: {
          'x-system-user-id': user?.id || '',
          'x-system-user-email': user?.email || '',
          'x-workspace-id': selectedWorkspace?.workspace_id || ''
        }
      });
      if (error || !sendResult?.success) {
        throw new Error(sendResult?.error || 'Erro ao enviar documento');
      }
      // ✅ Não remover mensagem otimista - a subscription realtime vai substituí-la
    } catch (error) {
      console.error('Erro ao enviar documento rápido:', error);
    } finally {
      setTimeout(() => sendingRef.current.delete(messageKey), 1000);
    }
  };

  // ✅ CORREÇÃO 3: Usar ref para rastrear conversas já carregadas
  const loadedConversationsRef = useRef<Set<string>>(new Set());

  // ✅ REMOVIDO: Subscription duplicada que causava conflito com useConversationMessages
  // A subscription de UPDATE agora está centralizada em useConversationMessages.ts

  // ✅ Selecionar conversa e carregar mensagens lazy
  const handleSelectConversation = async (conversation: WhatsAppConversation) => {
    console.log('🎯 [handleSelectConversation] Selecionando conversa:', {
      conversationId: conversation.id,
      contactName: conversation.contact.name
    });

    setSelectedConversation(conversation);

    // Limpar modo de seleção ao trocar de conversa
    setSelectionMode(false);
    setSelectedMessages(new Set());

    // Resetar estados de scroll
    isInitialLoadRef.current = true;
    setShouldAutoScroll(true);
    setIsAtBottom(true);

    // ✅ Carregar mensagens com refresh forçado para garantir status atualizado
    console.log('📥 [handleSelectConversation] Atualizando mensagens:', conversation.id);
    clearMessages(); // Limpar mensagens da conversa anterior (somente na troca)
    await loadMessages(conversation.id, true); // ✅ forceRefresh = true
    
    if (!isMasterUser) {
      console.log('🔔 [WhatsAppChat] Marcando conversa como lida:', conversation.id);
      markContactAsRead(conversation.id); // atualiza sino/notificações
      try { await markAsRead(conversation.id); } catch (e) { console.warn('⚠️ markAsRead falhou (continua):', e); }
    }
  };

  // ✅ Evitar loop: abrir automaticamente a conversa selecionada apenas quando mudar o ID
  const lastAutoOpenedIdRef = useRef<string | null>(null);
  const isAutoOpeningRef = useRef(false);

  const fetchAndOpenConversationById = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    if (!user?.id) return;
    if (!selectedWorkspace?.workspace_id) return;

    try {
      console.log('🔎 [WhatsAppChat] Buscando conversa direto no banco (fallback):', {
        conversationId,
        workspaceId: selectedWorkspace.workspace_id,
      });

      const { data, error } = await supabase.functions.invoke(
        `get-chat-data?conversation_id=${encodeURIComponent(conversationId)}`,
        {
          headers: {
            'x-system-user-id': user.id,
            'x-system-user-email': user.email || '',
            'x-workspace-id': selectedWorkspace.workspace_id,
          },
        }
      );

      if (error) throw error;

      const convData = data?.conversation;
      if (!convData?.id || !convData?.contact?.id) {
        throw new Error('Conversa não encontrada no banco (get-chat-data).');
      }

      const nowIso = new Date().toISOString();
      const fallbackConv: WhatsAppConversation = {
        id: convData.id,
        contact: {
          id: convData.contact.id,
          name: convData.contact.name || 'Contato',
          phone: convData.contact.phone,
          email: convData.contact.email,
          profile_image_url: convData.contact.profile_image_url,
        },
        agente_ativo: false,
        agent_active_id: null,
        status: 'open',
        unread_count: 0,
        last_activity_at: nowIso,
        created_at: nowIso,
        evolution_instance: null,
        assigned_user_id: null,
        assigned_user_name: null,
        assigned_at: null,
        connection_id: undefined,
        connection: undefined,
        queue_id: null,
        workspace_id: selectedWorkspace.workspace_id,
        conversation_tags: [],
        last_message: [],
        messages: [],
        _updated_at: Date.now(),
      };

      await handleSelectConversation(fallbackConv);
      lastAutoOpenedIdRef.current = conversationId;
    } catch (e) {
      console.error('❌ [WhatsAppChat] Falha ao buscar conversa por ID (fallback):', e);
      toast({
        title: 'Erro ao abrir conversa',
        description: 'Não foi possível carregar a conversa direto do banco.',
        variant: 'destructive',
      });
    }
  }, [handleSelectConversation, selectedWorkspace?.workspace_id, toast, user?.email, user?.id]);

  useEffect(() => {
    if (!selectedConversationId) return;
    // Se já abrimos esta conversa automaticamente, não repetir
    if (lastAutoOpenedIdRef.current === selectedConversationId) return;

    const conv = conversations.find(c => c.id === selectedConversationId);
    if (!conv) {
      // ✅ CRÍTICO: não depender da aba Conversas estar carregada
      // Se não está no estado atual, buscar direto no banco por ID
      (async () => {
        try {
          setIsOpeningConversation(true);
          isAutoOpeningRef.current = true;
          await fetchAndOpenConversationById(selectedConversationId);
        } finally {
          isAutoOpeningRef.current = false;
          setIsOpeningConversation(false);
        }
      })();
      return;
    }

    (async () => {
      try {
        setIsOpeningConversation(true);
        isAutoOpeningRef.current = true;
        await handleSelectConversation(conv);
        lastAutoOpenedIdRef.current = selectedConversationId;
      } finally {
        isAutoOpeningRef.current = false;
        setIsOpeningConversation(false);
      }
    })();
  }, [selectedConversationId, conversations, fetchAndOpenConversationById]);

  // Funções de seleção e encaminhamento
  const handleMessageForward = (messageId: string) => {
    setSelectionMode(true);
    setSelectedMessages(new Set([messageId]));
  };
  
  const scrollToMessage = (messageId: string) => {
    if (!messagesScrollRef.current) return;
    
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
      
      // Highlight temporário da mensagem
      messageElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      setTimeout(() => {
        messageElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
      }, 2000);
    } else {
      toast({
        title: "Mensagem não encontrada",
        description: "A mensagem citada pode ter sido deletada ou não está carregada",
        variant: "destructive"
      });
    }
  };
  
  const toggleMessageSelection = (messageId: string) => {
    const newSelected = new Set(selectedMessages);
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId);
    } else {
      newSelected.add(messageId);
    }
    setSelectedMessages(newSelected);

    // Sair do modo de seleção se não houver mensagens selecionadas
    if (newSelected.size === 0) {
      setSelectionMode(false);
    }
  };
  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedMessages(new Set());
  };
  const handleForwardMessages = async (contactIds: string[]) => {
    if (!selectedConversation || selectedMessages.size === 0) return;
    const messagesToForward = messages.filter(msg => selectedMessages.has(msg.id));
    for (const contactId of contactIds) {
      // Buscar a conversa do contato
      const targetConversation = conversations.find(conv => conv.contact.id === contactId);
      if (targetConversation) {
        // Encaminhar cada mensagem selecionada
        for (const msg of messagesToForward) {
          try {
            await supabase.functions.invoke('test-send-msg', {
              body: {
                conversation_id: targetConversation.id,
                content: msg.content,
                message_type: msg.message_type,
                sender_id: user?.id,
                sender_type: 'agent',
                file_url: msg.file_url,
                file_name: msg.file_name,
                clientMessageId: generateRandomId() // ✅ ETAPA 2
              },
              headers: {
                'x-system-user-id': user?.id || '',
                'x-system-user-email': user?.email || '',
                'x-workspace-id': selectedWorkspace?.workspace_id || ''
              }
            });
          } catch (error) {
            console.error('Erro ao encaminhar mensagem:', error);
          }
        }
      }
    }
    toast({
      title: "Mensagens encaminhadas",
      description: `${messagesToForward.length} mensagem(ns) encaminhada(s) com sucesso`
    });
    cancelSelection();
  };

  // Obter horário da última atividade
  const getActivityDisplay = (conv: WhatsAppConversation) => {
    const now = new Date();
    const messageTime = new Date(conv.last_activity_at);
    const diffInHours = (now.getTime() - messageTime.getTime()) / (1000 * 60 * 60);
    if (diffInHours < 24) {
      // Menos de 24h: mostrar horário
      return messageTime.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      // Mais de 24h: mostrar data
      return messageTime.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit'
      });
    }
  };

  // ✅ Última mensagem não existe mais no array (lazy loading)
  const getLastMessage = (conv: WhatsAppConversation) => {
    // Retorna null - sem preview de mensagem na lista
    return null;
  };

  // ✅ SIMPLIFICADO: Mapear status (Evolution e Z-API já normalizam no backend)
  const getDisplayMessageStatus = (message: ConversationMessage): DisplayMessageStatus | undefined => {
    if (!message || message.sender_type === 'contact') return undefined;

    const status = message.status?.toLowerCase();
    
    console.log('🔍 [getDisplayMessageStatus]:', {
      messageId: message.id,
      external_id: message.external_id,
      rawStatus: message.status,
      normalizedStatus: status,
      delivered_at: message.delivered_at,
      read_at: message.read_at,
      sender_type: message.sender_type
    });

    // ✅ Mapear status direto (já vem normalizado do backend)
    switch (status) {
      case 'sending':
      case 'pending':
        return 'sending';
      case 'sent':
        return 'sent';
      case 'delivered':
        return 'delivered';
      case 'read':
        return 'read';
      case 'failed':
        return 'failed';
      default:
        return 'sent'; // fallback
    }
  };

  const getSenderDisplayName = (
    senderType: ConversationMessage['sender_type'] | undefined,
    contactName: string
  ) => {
    switch (senderType) {
      case 'contact':
        return contactName || 'Contato';
      case 'system':
        return 'Sistema';
      case 'ia':
        return 'Assistente IA';
      default:
        return 'Você';
    }
  };

  // Importadas de avatarUtils para consistência

  // Gerenciar agente IA
  const handleToggleAgent = async () => {
    if (selectedConversation) {
      console.log('🎯 handleToggleAgent chamado:', {
        conversationId: selectedConversation.id,
        currentState: selectedConversation.agente_ativo,
        willCall: selectedConversation.agente_ativo ? 'assumirAtendimento' : 'reativarIA'
      });
      
      // Se está ativo, desativar (assumir atendimento)
      if (selectedConversation.agente_ativo) {
        const newAgenteAtivoState = false;
        
        // 🔥 UPDATE OTIMISTA: Atualizar estado local imediatamente
        setSelectedConversation(prev => prev ? {
          ...prev,
          agente_ativo: newAgenteAtivoState,
          _updated_at: Date.now()
        } : null);
        
        // 🔥 UPDATE OTIMISTA NO PIPELINES CONTEXT (para cards CRM)
        updateConversationAgentStatus(selectedConversation.id, false, null);
        
        await assumirAtendimento(selectedConversation.id);
      } else {
        // Se está inativo, abrir modal de seleção de agente
        setShowSelectAgentModal(true);
      }
    }
  };

  // Auto-scroll para última mensagem
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  };
  
  const convertBlobToMp3 = useCallback(async (blob: Blob) => {
    if (typeof window === 'undefined') {
      throw new Error('Conversão de áudio indisponível neste ambiente.');
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('AudioContext não suportado neste navegador.');
    }

    const lameModule = await loadLameJs();
    const audioContext = new AudioContextClass();
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        audioContext.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      });

      const channelCount = Math.min(2, audioBuffer.numberOfChannels || 1);
      const sampleRate = audioBuffer.sampleRate || 44100;
      const mp3encoder = new lameModule.Mp3Encoder(channelCount, sampleRate, 128);
      const samplesPerFrame = 1152;
      const mp3Data: Uint8Array[] = [];
      const channelData: Float32Array[] = [];

      for (let i = 0; i < channelCount; i++) {
        channelData.push(audioBuffer.getChannelData(i));
      }
      const totalSamples = channelData[0].length;

      const floatTo16BitPCM = (floatBuffer: Float32Array, start: number, end: number) => {
        const slice = floatBuffer.subarray(start, Math.min(end, floatBuffer.length));
        const output = new Int16Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          const s = Math.max(-1, Math.min(1, slice[i]));
          output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        return output;
      };

      for (let i = 0; i < totalSamples; i += samplesPerFrame) {
        const left = floatTo16BitPCM(channelData[0], i, i + samplesPerFrame);
        let mp3buf: Int8Array | Uint8Array = new Int8Array();

        if (channelCount > 1 && channelData[1]) {
          const right = floatTo16BitPCM(channelData[1], i, i + samplesPerFrame);
          mp3buf = mp3encoder.encodeBuffer(left, right);
        } else {
          mp3buf = mp3encoder.encodeBuffer(left);
        }

        if (mp3buf.length > 0) {
          mp3Data.push(new Uint8Array(mp3buf));
        }
      }

      const endBuf = mp3encoder.flush();
      if (endBuf.length > 0) {
        mp3Data.push(new Uint8Array(endBuf));
      }

      return new Blob(mp3Data as BlobPart[], { type: 'audio/mpeg' });
    } finally {
      audioContext.close();
    }
  }, []);

  // Gravação de áudio (microfone)
  const startRecording = async () => {
    const hasNavigator = typeof navigator !== 'undefined';
    const mediaDevices = hasNavigator ? navigator.mediaDevices : undefined;
    const getUserMedia = mediaDevices?.getUserMedia?.bind(mediaDevices);

    if (!getUserMedia) {
      toast({
        title: "Gravação indisponível",
        description: "Seu navegador não suporta captura de áudio neste ambiente.",
        variant: "destructive"
      });
      return;
    }

    try {
      const stream = await getUserMedia({
        audio: true
      });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e: any) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      mediaRecorder.start();
      setIsRecording(true);

      // Iniciar timer
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
      toast({
        title: "Erro ao gravar",
        description: "Não foi possível acessar o microfone",
        variant: "destructive"
      });
    }
  };
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      setIsRecording(false);
      setRecordingTime(0);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      toast({
        title: "Gravação cancelada",
        description: "O áudio não foi enviado"
      });
    }
  };
  const stopRecording = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    mediaRecorderRef.current.onstop = async () => {
      try {
        const recorder = mediaRecorderRef.current;
        const recordedBlob = new Blob(audioChunksRef.current, {
          type: recorder?.mimeType || 'audio/webm'
        });

        if (recorder) {
          recorder.stream.getTracks().forEach(track => track.stop());
          mediaRecorderRef.current = null;
        }

        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }

        setIsRecording(false);
        setRecordingTime(0);

        let uploadBlob: Blob;
        try {
          setIsConvertingAudio(true);
          uploadBlob = await convertBlobToMp3(recordedBlob);
        } catch (conversionError) {
          console.error('Erro ao converter áudio para MP3:', conversionError);
          toast({
            title: "Falha na conversão",
            description: "Não foi possível gerar o arquivo de áudio. Tente novamente.",
            variant: "destructive"
          });
          audioChunksRef.current = [];
          return;
        } finally {
          setIsConvertingAudio(false);
        }

        const fileName = `audio_${Date.now()}.mp3`;
        const draftText = messageText.trim();
        const content = draftText || '[ÁUDIO]';
        const previewUrl = URL.createObjectURL(uploadBlob);

        setRecordedAudioPreview({
          blob: uploadBlob,
          fileName,
          content,
          previewUrl
        });
      } catch (error) {
        console.error('Erro ao preparar áudio gravado:', error);
        toast({
          title: "Erro ao gravar áudio",
          description: "Não foi possível processar o áudio. Tente novamente.",
          variant: "destructive"
        });
      } finally {
        audioChunksRef.current = [];
      }
    };
    mediaRecorderRef.current.stop();
  };

  // Batch update profile images
  const handleBatchUpdateProfileImages = async () => {
    if (isUpdatingProfileImages) return;
    setIsUpdatingProfileImages(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('batch-update-profile-images');
      if (error) throw error;
      toast({
        title: "Atualização iniciada",
        description: `Atualizando fotos de perfil de ${data.totalProcessed} contatos`
      });

      // Refresh conversations to show updated images
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    } catch (error) {
      console.error('Error batch updating profile images:', error);
      toast({
        title: "Erro na atualização",
        description: "Não foi possível atualizar as fotos de perfil",
        variant: "destructive"
      });
    } finally {
      setIsUpdatingProfileImages(false);
    }
  };

  // Refresh individual profile image
  const handleRefreshProfileImage = async (phone: string) => {
    if (!phone) return;
    try {
      await fetchProfileImage(phone);
      toast({
        title: "Foto atualizada",
        description: "A foto do perfil foi atualizada com sucesso"
      });
      // Refresh conversations to show updated image
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Error refreshing profile image:', error);
    }
  };

  // Create quick conversation without saving contact
  const handleCreateQuickConversation = async () => {
    if (!quickPhoneNumber.trim() || isCreatingQuickConversation) return;

    const ddiDigits = (quickCountryCode || "").replace(/\D/g, "");
    const localDigits = (quickPhoneNumber || "").replace(/\D/g, "");

    if (!ddiDigits) {
      toast({
        title: "DDI inválido",
        description: "Selecione um DDI válido (ex: +55, +1, +351).",
        variant: "destructive"
      });
      return;
    }

    // E.164: country code 1-4 dígitos, total até 15 dígitos
    if (ddiDigits.length < 1 || ddiDigits.length > 4) {
      toast({
        title: "DDI inválido",
        description: "O DDI deve ter entre 1 e 4 dígitos.",
        variant: "destructive"
      });
      return;
    }

    if (localDigits.length < 4) {
      toast({
        title: "Número inválido",
        description: "Digite um número válido (mínimo 4 dígitos).",
        variant: "destructive"
      });
      return;
    }

    if ((ddiDigits + localDigits).length > 15) {
      toast({
        title: "Número inválido",
        description: "O número ultrapassa o limite do padrão internacional (E.164).",
        variant: "destructive"
      });
      return;
    }
    setIsCreatingQuickConversation(true);
    try {
      // Montar número internacional completo
      const fullPhoneNumber = `+${ddiDigits}${localDigits}`;

      // Parse and validate phone number
      const phoneNumber = parsePhoneNumber(fullPhoneNumber);
      if (!phoneNumber || !phoneNumber.isValid()) {
        toast({
          title: "Número inválido",
          description: "Por favor, digite um número de telefone válido.",
          variant: "destructive"
        });
        return;
      }

      // PROTEÇÃO: Verificar se não é número de alguma conexão/instância
      const formattedPhone = phoneNumber.format('E.164').replace('+', '');
      const phoneDigits = formattedPhone.replace(/\D/g, '');

      // Verificar contra todas as conexões do workspace atual
      const {
        data: connections
      } = await supabase.from('connections').select('phone_number, instance_name').eq('workspace_id', selectedWorkspace?.workspace_id);
      const isInstanceNumber = connections?.some(conn => {
        const connPhone = conn.phone_number?.replace(/\D/g, '');
        return connPhone && phoneDigits === connPhone;
      });
      if (isInstanceNumber) {
        toast({
          title: "Número inválido",
          description: "Este número pertence a uma instância WhatsApp e não pode ser usado como contato.",
          variant: "destructive"
        });
        return;
      }

      // Call Edge Function to create quick conversation
      console.log('📞 Criando conversa rápida:', {
        original: fullPhoneNumber,
        formatted: phoneNumber.format('E.164'),
        national: phoneNumber.format('NATIONAL')
      });
      if (!selectedWorkspace?.workspace_id) {
        toast({
          title: "Erro",
          description: "Nenhum workspace selecionado",
          variant: "destructive"
        });
        return;
      }
      const {
        data,
        error
      } = await supabase.functions.invoke('create-quick-conversation', {
        body: {
          phoneNumber: phoneNumber.format('E.164')
        },
        headers: {
          'x-workspace-id': selectedWorkspace.workspace_id
        }
      });
      if (error) {
        console.error('❌ Error calling create-quick-conversation:', {
          error,
          errorName: error.name,
          errorMessage: error.message,
          context: error.context
        });
        toast({
          title: "Erro",
          description: error.message || "Não foi possível criar conversa",
          variant: "destructive"
        });
        return;
      }
      if (!data.success) {
        toast({
          title: "Erro",
          description: data.error || "Não foi possível criar conversa",
          variant: "destructive"
        });
        return;
      }

      // Atualizar lista imediatamente
      await fetchConversations();
      
      // Find and select the conversation
      setTimeout(() => {
        const conversation = conversations.find(conv => conv.id === data.conversationId);
        if (conversation) {
          handleSelectConversation(conversation);
        } else {
          // Tentar novamente após refetch
          console.log('⏳ Aguardando lista atualizar...');
          setTimeout(async () => {
            await fetchConversations();
            const retryConv = conversations.find(conv => conv.id === data.conversationId);
            if (retryConv) handleSelectConversation(retryConv);
          }, 1000);
        }
      }, 500);
      setQuickPhoneNumber("");
      setQuickCountryCode("55");
      toast({
        title: "Conversa criada",
        description: `Conversa iniciada com ${phoneNumber.format('INTERNATIONAL')}`
      });
    } catch (error) {
      console.error('❌ Exception creating quick conversation:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      toast({
        title: "Erro",
        description: "Não foi possível criar conversa",
        variant: "destructive"
      });
    } finally {
      setIsCreatingQuickConversation(false);
    }
  };

  // Handle Enter key press for quick conversation
  const handleQuickConversationKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreateQuickConversation();
    }
  };

  // Handler para responder mensagem
  const handleReply = (message: any) => {
    setReplyingTo(message);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('input[placeholder="Digite sua mensagem..."]');
      input?.focus();
    }, 100);
  };

  // Ref para prevenir múltiplos carregamentos simultâneos no scroll infinito
  const isLoadingMoreScrollRef = useRef(false);

  // Detectar se o usuário está no final do chat e no topo para scroll infinito
  const handleScrollEvent = useCallback((element: HTMLElement) => {
    const threshold = 100; // pixels de tolerância para o bottom
    const topThreshold = 150; // pixels de tolerância para o topo (scroll infinito)
    
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
    const isNearTop = element.scrollTop < topThreshold;
    
    setIsAtBottom(isNearBottom);
    setShouldAutoScroll(isNearBottom);
    
    // ✅ Scroll infinito simplificado: carregar do array que já está na memória
    const hasMoreInMemory = messages.length > visibleMessagesCount;

    if (isNearTop && (hasMoreInMemory || hasMore) && !isLoadingMoreRef.current && !isVisualLoading) {
      // Apenas sinalizamos o início do carregamento visual
      setIsVisualLoading(true);
      isLoadingMoreRef.current = true;

      console.log('🔄 Scroll infinito - Iniciando preloading visual de 1s');

      // Simular delay visual de 1s conforme pedido
      setTimeout(() => {
        // ✅ CAPTURA CRÍTICA: Capturar a posição EXATAMENTE antes de mudar o estado
        if (messagesScrollRef.current) {
          scrollPositionBeforeLoadRef.current = {
            scrollTop: messagesScrollRef.current.scrollTop,
            scrollHeight: messagesScrollRef.current.scrollHeight
          };
        }

        // ✅ ATUALIZAÇÃO ATÔMICA: Injetar mensagens e remover spinner no mesmo ciclo
        flushSync(() => {
          setVisibleMessagesCount(prev => prev + 10);
          setIsVisualLoading(false);
        });
        
        // Se as mensagens na memória estão acabando, o hook em background já deve estar trazendo mais
        if (!hasMoreInMemory && hasMore) {
          loadMoreMessages();
        }
      }, 1000);
    }
    
    console.log('📜 Posição do scroll:', {
      isNearBottom,
      isNearTop,
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      hasMore,
      loadingMore,
      messagesCount: messages.length
    });
  }, [hasMore, loadingMore, messages, loadMoreMessages]);

  // Handler para React.UIEvent
  const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    handleScrollEvent(event.currentTarget);
  }, [handleScrollEvent]);

  // Handler para Event nativo
  const handleNativeScroll = useCallback((event: Event) => {
    const element = event.target as HTMLElement;
    if (element) {
      handleScrollEvent(element);
    }
  }, [handleScrollEvent]);

  // ✅ Anexar listener nativo ao viewport quando ele estiver disponível
  useEffect(() => {
    const viewport = messagesScrollRef.current;
    if (viewport) {
      console.log('✅ Anexando listener nativo ao viewport');
      viewport.addEventListener('scroll', handleNativeScroll, { passive: true });
      return () => {
        viewport.removeEventListener('scroll', handleNativeScroll);
      };
    }
  }, [handleNativeScroll, selectedConversation?.id]);

  // Evitar segundo disparo de seleção automática por outros caminhos
  useEffect(() => {
    if (!selectedConversationId || conversations.length === 0) return;
    if (lastAutoOpenedIdRef.current === selectedConversationId) return; // já tratamos acima
  }, [selectedConversationId, conversations]);

  // ✅ ALGORITMO DE PRESERVAÇÃO DE POSIÇÃO VISUAL (Infinite Scroll Upwards)
  useLayoutEffect(() => {
    if (!isLoadingMoreRef.current || !scrollPositionBeforeLoadRef.current || !messagesScrollRef.current) {
      lastMessageLengthRef.current = messages.length;
      return;
    }

    // O gatilho agora é a mudança no visibleMessagesCount ou messages.length
    const element = messagesScrollRef.current;
    const saved = scrollPositionBeforeLoadRef.current;
    
    const oldScrollHeight = saved.scrollHeight;
    const oldScrollTop = saved.scrollTop;
    const newScrollHeight = element.scrollHeight;
    const heightDifference = newScrollHeight - oldScrollHeight;
    
    if (heightDifference !== 0) {
      element.style.scrollBehavior = 'auto';
      element.scrollTop = oldScrollTop + heightDifference;
      
      // Segunda tentativa para garantir estabilidade absoluta
      requestAnimationFrame(() => {
        if (messagesScrollRef.current && scrollPositionBeforeLoadRef.current) {
          const currentDiff = messagesScrollRef.current.scrollHeight - oldScrollHeight;
          messagesScrollRef.current.scrollTop = oldScrollTop + currentDiff;
        }
        // Limpar apenas após o segundo ajuste
        isLoadingMoreRef.current = false;
        scrollPositionBeforeLoadRef.current = null;
      });
    } else {
      isLoadingMoreRef.current = false;
      scrollPositionBeforeLoadRef.current = null;
    }

    lastMessageLengthRef.current = messages.length;
  }, [messages.length, visibleMessagesCount]);

  useEffect(() => {
    if (selectedConversation?.id) {
      setVisibleMessagesCount(10);
    }
  }, [selectedConversation?.id]);

  // ✅ Scroll inteligente para última mensagem e auto-scroll
  useEffect(() => {
    if (!selectedConversation || messages.length === 0) return;
    
    // Sempre fazer scroll no carregamento inicial da conversa
    if (isInitialLoadRef.current) {
      const timer = setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
          isInitialLoadRef.current = false;
        }
      }, 150);
      return () => clearTimeout(timer);
    }
    
    // Auto-scroll para baixo APENAS se o usuário já estiver lá e NÃO estivermos carregando histórico
    const lengthChanged = messages.length !== lastMessageLengthRef.current;
    if (shouldAutoScroll && lengthChanged && !isLoadingMoreRef.current && !loadingMore) {
      const timer = setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedConversation?.id, messages.length, shouldAutoScroll, loadingMore]);

  // ✅ Trigger para aplicar preservação de scroll quando loadingMore terminar
  // Removido o bloco anterior que causava o travamento do scroll
  useEffect(() => {
    // Não fazemos mais nada aqui, o useLayoutEffect cuida da preservação
  }, [loadingMore]);

  // ✅ CORREÇÃO: Listener ESC para voltar da conversa
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedConversation) {
        handleBackToList();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedConversation]);

  // ✅ CORREÇÃO: Função para voltar à lista de conversas
  const handleBackToList = () => {
    setSelectedConversation(null);
    clearMessages();
    
    // Limpar URL params
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    window.history.pushState({}, '', url.toString());
  };

  return <div className={`flex h-full bg-white overflow-hidden w-full dark:bg-[#1f1f1f] transition-colors duration-300 ease-in-out ${onlyMessages ? 'flex-col' : ''}`}>
      {/* Sidebar de Filtros */}
      {(!onlyMessages) && (
      <div className={cn("border-r border-[#d4d4d4] flex flex-col transition-all duration-300 bg-[#f0f0f0] dark:bg-[#1a1a1a] dark:border-gray-700", sidebarCollapsed ? "w-14" : "w-40 lg:w-48")}>
        {/* Header da sidebar removido (headline já na página) */}
        <div className="p-1" />

        {/* Select de Canais */}
        {!sidebarCollapsed && <div className="p-3 border-b border-[#d4d4d4] bg-[#f0f0f0] dark:bg-[#1a1a1a] dark:border-gray-700">
            <Select value={selectedConnection || "all"} onValueChange={value => setSelectedConnection(value === "all" ? "" : value)}>
              <SelectTrigger className="w-full h-8 text-xs rounded-none border-gray-300 bg-white focus:ring-0 text-gray-800 dark:bg-[#2d2d2d] dark:border-gray-600 dark:text-gray-200">
                <SelectValue placeholder="Todas as conexões" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-[#d4d4d4] dark:bg-[#2d2d2d] dark:border-gray-600">
                <SelectItem value="all" className="text-xs rounded-none cursor-pointer dark:text-gray-200 dark:focus:bg-gray-700">Todas as conexões</SelectItem>
                {connectionsLoading ? <SelectItem value="__loading__" disabled className="text-xs dark:text-gray-400">Carregando...</SelectItem> : workspaceConnections.length === 0 ? <SelectItem value="__empty__" disabled className="text-xs dark:text-gray-400">Nenhuma conexão</SelectItem> : workspaceConnections.map(connection => <SelectItem key={connection.id} value={connection.id} className="text-xs rounded-none cursor-pointer dark:text-gray-200 dark:focus:bg-gray-700">
                      {connection.instance_name}
                    </SelectItem>)}
              </SelectContent>
            </Select>
          </div>}

        {/* Categorias de Navegação */}
        <nav className="flex-1 p-2 bg-[#f0f0f0] dark:bg-[#1a1a1a]">
          <div className="space-y-1">
            {/* Todos */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => setActiveTab('all')} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-none transition-all text-xs border", activeTab === 'all' ? "bg-gray-100 text-gray-900 font-semibold shadow-sm border-transparent dark:bg-[#2a2a2a] dark:text-white dark:border-transparent" : "border-transparent text-gray-700 hover:bg-[#e1e1e1] hover:border-gray-300 dark:text-gray-200 dark:hover:bg-[#333] dark:hover:border-gray-600")}>
                    <Circle className={cn("h-3.5 w-3.5", activeTab === 'all' ? "fill-yellow-600 text-yellow-600 dark:fill-yellow-400 dark:text-yellow-400" : "text-gray-500 dark:text-gray-400")} />
                    {!sidebarCollapsed && <>
                        <span className="flex-1 text-left">Todos</span>
                        <span className={cn("text-[10px] px-1 py-0 rounded-none border", activeTab === 'all' ? "bg-white border-yellow-200 dark:bg-black/20 dark:border-yellow-800/20" : "bg-gray-200 border-transparent dark:bg-[#333] dark:text-gray-200")}>
                          {conversationCounts?.all ?? conversations.filter(c => c.status !== 'closed').length}
                        </span>
                      </>}
                  </button>
                </TooltipTrigger>
                {sidebarCollapsed && <TooltipContent side="right" className="text-xs rounded-none border-[#d4d4d4]">Todos</TooltipContent>}
              </Tooltip>
            </TooltipProvider>

            {/* Minhas Conversas */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => setActiveTab('mine')} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-none transition-all text-xs border", activeTab === 'mine' ? "bg-gray-100 text-gray-900 font-semibold shadow-sm border-transparent dark:bg-[#2a2a2a] dark:text-white dark:border-transparent" : "border-transparent text-gray-700 hover:bg-[#e1e1e1] hover:border-gray-300 dark:text-gray-200 dark:hover:bg-[#333] dark:hover:border-gray-600")}>
                    <UserCircle className={cn("h-3.5 w-3.5", activeTab === 'mine' ? "text-yellow-600 dark:text-yellow-400" : "text-gray-500")} />
                    {!sidebarCollapsed && <>
                        <span className="flex-1 text-left">Minhas conversas</span>
                        <span className={cn("text-[10px] px-1 py-0 rounded-none border", activeTab === 'mine' ? "bg-white border-yellow-200 dark:bg-black/20 dark:border-yellow-800/20" : "bg-gray-200 border-transparent dark:bg-[#333] dark:text-gray-200")}>
                          {conversationCounts?.mine ?? conversations.filter(c => c.assigned_user_id === user?.id && c.status !== 'closed').length}
                        </span>
                      </>}
                  </button>
                </TooltipTrigger>
                {sidebarCollapsed && <TooltipContent side="right" className="text-xs rounded-none border-[#d4d4d4]">Minhas conversas</TooltipContent>}
              </Tooltip>
            </TooltipProvider>

            {/* Não atribuídas */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => setActiveTab('unassigned')} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-none transition-all text-xs border", activeTab === 'unassigned' ? "bg-gray-100 text-gray-900 font-semibold shadow-sm border-transparent dark:bg-[#2a2a2a] dark:text-white dark:border-transparent" : "border-transparent text-gray-700 hover:bg-[#e1e1e1] hover:border-gray-300 dark:text-gray-200 dark:hover:bg-[#333] dark:hover:border-gray-600")}>
                    <UserX className={cn("h-3.5 w-3.5", activeTab === 'unassigned' ? "text-yellow-600 dark:text-yellow-400" : "text-gray-500")} />
                    {!sidebarCollapsed && <>
                        <span className="flex-1 text-left">Não atribuídas</span>
                        <span className={cn("text-[10px] px-1 py-0 rounded-none border", activeTab === 'unassigned' ? "bg-white border-yellow-200 dark:bg-black/20 dark:border-yellow-800/20" : "bg-gray-200 border-transparent dark:bg-[#333] dark:text-gray-200")}>
                          {conversationCounts?.unassigned ?? conversations.filter(c => !c.assigned_user_id && c.status !== 'closed').length}
                        </span>
                      </>}
                  </button>
                </TooltipTrigger>
                {sidebarCollapsed && <TooltipContent side="right" className="text-xs rounded-none border-[#d4d4d4]">Não atribuídas</TooltipContent>}
              </Tooltip>
            </TooltipProvider>

            {/* Não Lidas */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => setActiveTab('unread')} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-none transition-all text-xs border", activeTab === 'unread' ? "bg-gray-100 text-gray-900 font-semibold shadow-sm border-transparent dark:bg-[#2a2a2a] dark:text-white dark:border-transparent" : "border-transparent text-gray-700 hover:bg-[#e1e1e1] hover:border-gray-300 dark:text-gray-200 dark:hover:bg-[#333] dark:hover:border-gray-600")}>
                    <MessageCircle className={cn("h-3.5 w-3.5", activeTab === 'unread' ? "text-yellow-600 dark:text-yellow-400" : "text-gray-500")} />
                    {!sidebarCollapsed && <>
                        <span className="flex-1 text-left">Não lidas</span>
                        <span className={cn("text-[10px] px-1 py-0 rounded-none border", activeTab === 'unread' ? "bg-white border-yellow-200 dark:bg-black/20 dark:border-yellow-800/20" : "bg-gray-200 border-transparent dark:bg-[#333] dark:text-gray-200")}>
                          {conversationCounts?.unread ?? conversations.filter(c => conversationNotifications.has(c.id) && c.status !== 'closed').length}
                        </span>
                      </>}
                  </button>
                </TooltipTrigger>
                {sidebarCollapsed && <TooltipContent side="right" className="text-xs rounded-none border-[#d4d4d4]">Não lidas</TooltipContent>}
              </Tooltip>
            </TooltipProvider>
          </div>
            </nav>

            {/* Seção Customizado */}
        {!sidebarCollapsed && <div className="border-t border-[#d4d4d4] p-2 bg-[#f0f0f0] dark:bg-[#1a1a1a] dark:border-gray-700">
            <Collapsible open={customFiltersOpen} onOpenChange={setCustomFiltersOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between h-8 px-2 text-xs font-bold text-gray-700 hover:bg-[#e1e1e1] rounded-none dark:text-gray-200 dark:hover:bg-[#2d2d2d]">
                  <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5" />
                    <span>Customizado</span>
                  </div>
                  <Plus className={cn("h-3.5 w-3.5 transition-transform", customFiltersOpen && "rotate-45")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 mt-1">
                {/* Filtro por Tag - Seleção Múltipla */}
                <div className="px-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-8 text-xs rounded-none border-gray-300 bg-white focus:ring-0 dark:bg-[#2d2d2d] dark:border-gray-600 dark:text-gray-200 justify-between"
                      >
                        <span>
                          {selectedTags.length === 0 
                            ? "Todas as tags" 
                            : selectedTags.length === 1
                            ? tags.find(t => t.id === selectedTags[0])?.name || "1 tag selecionada"
                            : `${selectedTags.length} tags selecionadas`}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 ml-2 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0 rounded-none border-[#d4d4d4] dark:bg-[#2d2d2d] dark:border-gray-600" align="start">
                      <div className="max-h-60 overflow-y-auto p-2">
                        {tags.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">
                            Nenhuma etiqueta encontrada
                          </div>
                        ) : (
                          tags.map((tag) => (
                            <div
                              key={tag.id}
                              className="flex items-center space-x-2 p-2 hover:bg-[#e6f2ff] dark:hover:bg-[#2a2a2a] rounded-none cursor-pointer"
                              onClick={() => {
                                setSelectedTags(prev => 
                                  prev.includes(tag.id) 
                                    ? prev.filter(id => id !== tag.id)
                                    : [...prev, tag.id]
                                );
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedTags.includes(tag.id)}
                                onChange={() => {
                                  setSelectedTags(prev => 
                                    prev.includes(tag.id) 
                                      ? prev.filter(id => id !== tag.id)
                                      : [...prev, tag.id]
                                  );
                                }}
                                className="rounded-none border-gray-300 dark:border-gray-600"
                              />
                              <div className="flex items-center space-x-2 flex-1">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: tag.color ? `${tag.color}99` : 'rgba(0,0,0,0.06)' }}
                                />
                                <span className="text-xs text-gray-900 dark:text-gray-100">{tag.name}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Botão Limpar */}
                {selectedTags.length > 0 && (
                  <div className="px-1 pt-1">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setSelectedTags([])} 
                      className="w-full h-7 text-xs rounded-none border-gray-300 bg-white hover:bg-gray-100 text-gray-700 dark:bg-[#2d2d2d] dark:border-gray-600 dark:text-gray-200 dark:hover:bg-[#3a3a3a]"
                    >
                      Limpar filtros
                    </Button>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>}
      </div>
      )}

      {/* Sidebar com lista de conversas */}
      {(!onlyMessages) && (
      <div className="w-full md:w-72 lg:w-72 md:min-w-72 lg:min-w-72 border-r border-border flex flex-col dark:border-gray-700">
        {/* Header */}
        <div className="p-3 border-b border-[#d4d4d4] space-y-3 bg-white dark:bg-[#1f1f1f] dark:border-gray-700">
          {/* Search bar */}
          <div className="flex items-center gap-2">
            <div className="flex items-center flex-1 relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input placeholder="Buscar" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 pr-3 h-8 text-xs rounded-none border border-[#d4d4d4] shadow-none bg-white focus-visible:ring-0 dark:bg-[#2d2d2d] dark:border-gray-600 dark:text-gray-200" />
            </div>
            
            {/* Botão de atualizar */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={async () => {
                      console.log('🔄 Recarregando conversas manualmente...');
                      await fetchConversations();
                    }}
                    disabled={loading}
                    className="h-8 w-8 shrink-0 rounded-none border border-[#d4d4d4] hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-400"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5 text-gray-600", loading && "animate-spin")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="rounded-none border-[#d4d4d4]">Atualizar conversas</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Lista de conversas */}
        <ScrollArea
          ref={conversationListRootRef}
          className="flex-1"
        >
          {loading ? (
            <WhatsAppChatSkeleton />
          ) : filteredConversations.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-center space-y-3">
                <MessageCircle className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
                <p className="text-xs text-muted-foreground">Configure conexões WhatsApp para ver conversas</p>
              </div>
            </div>
          ) : (
            <div className="space-y-0 group/list flex flex-col">
              {filteredConversations.map(conversation => {
                // ✅ Removido lastMessage (lazy loading)
                const lastActivity = getActivityDisplay(conversation);
                const initials = getInitials(conversation.contact?.name && conversation.contact.name !== '-' ? conversation.contact.name : (conversation.contact?.phone || 'U'));
                const avatarColor = getAvatarColor(conversation.contact?.name && conversation.contact.name !== '-' ? conversation.contact.name : (conversation.contact?.phone || 'U'));
                // ✅ CRÍTICO: Key dinâmica para forçar re-render do card quando conversa atualizar
                const cardKey = `${conversation.id}-${conversation._updated_at || 0}-${conversation.last_activity_at}`;
                return (
                  <li key={cardKey} className="list-none">
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div className={cn("relative flex items-center px-3 py-2 cursor-pointer rounded-none transition-all duration-300 ease-in-out border-b border-[#d4d4d4] bg-white dark:bg-[#1f1f1f] dark:border-gray-700", "group-hover/list:opacity-70 hover:!opacity-100 hover:bg-[#e6f2ff] dark:hover:bg-[#2d2d2d] hover:z-10", selectedConversation?.id === conversation.id && "bg-[#e6f2ff] dark:bg-[#2d2d2d] !opacity-100")} onClick={() => handleSelectConversation(conversation)} role="button" tabIndex={0}>
                  {/* Status indicator bar - cor da conexão */}
                  {/* Barra de status/identificação da conexão com tooltip detalhado */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="absolute left-0 top-0 bottom-0 w-1" style={{
                    backgroundColor: (() => {
                      // Se tem conexão, usa cor da conexão (salva ou gerada por hash)
                      if (conversation.connection) {
                        return getConnectionColor(
                          conversation.connection.id, 
                          conversation.connection.metadata
                        );
                      }
                      // Senão, usa lógica do agente
                      return conversation.agente_ativo ? 'rgb(83, 0, 235)' : 'rgb(76, 175, 80)';
                    })()
                  }} />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs rounded-none border-[#d4d4d4]">
                      {conversation.connection ? (
                        <div className="space-y-1">
                          <p className="text-xs font-bold">{conversation.connection.instance_name || 'Instância'}</p>
                          {conversation.connection.phone_number && (
                            <p className="text-xs text-muted-foreground">{conversation.connection.phone_number}</p>
                          )}
                          <p className="text-[10px] mt-1">
                            {(() => {
                              const status = (conversation.connection.status || '').toLowerCase();
                              switch (status) {
                                case 'open':
                                case 'connected':
                                  return 'Status: Conectado';
                                case 'creating':
                                  return 'Status: Criando';
                                case 'connecting':
                                  return 'Status: Conectando';
                                case 'closed':
                                case 'disconnected':
                                  return 'Status: Desconectado';
                                default:
                                  return `Status: ${conversation.connection.status || 'N/A'}`;
                              }
                            })()}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-xs font-bold">{conversation.agente_ativo ? 'AGENTE IA' : 'ATIVO'}</p>
                          <p className="text-[10px] text-muted-foreground">Sem conexão vinculada</p>
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                    
                    {/* Avatar container */}
                    <div className="flex-shrink-0 mr-3 ml-2">
                      <div className="relative">
                        <div className="relative w-9 h-9">
                          <Avatar className="h-9 w-9 rounded-none">
                            {conversation.contact?.profile_image_url && <AvatarImage src={conversation.contact.profile_image_url} alt={conversation.contact?.name || conversation.contact?.phone} className="object-cover rounded-none" />}
                            <AvatarFallback className="text-white font-bold text-xs rounded-none" style={{
                              backgroundColor: avatarColor
                            }}>
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          
                          {/* Badge de mensagens não lidas - baseado em notificações */}
                          {conversationNotifications.has(conversation.id) && (
                            <div className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shadow-sm">
                              <span className="text-white text-[10px] font-bold leading-none">
                                {conversationNotifications.get(conversation.id)! > 99 ? '99+' : conversationNotifications.get(conversation.id)}
                              </span>
                            </div>
                          )}
                          
                        </div>
                      </div>
                    </div>
                    
                     {/* Main content */}
                    <div className="flex-1 min-w-0">
                       {/* First line: Name with connection badge */}
                       <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                        <span className="text-xs font-bold text-gray-900 tracking-tight truncate whitespace-nowrap overflow-hidden text-ellipsis block dark:text-gray-100">
                          {conversation.contact?.name && conversation.contact.name !== '-' ? conversation.contact.name : (conversation.contact?.phone || 'Sem nome')}
                        </span>
                          <ConnectionBadge 
                            connectionId={conversation.connection_id}
                            connectionInfo={conversation.connection}
                          />
                      </div>
                      
                        {/* ✅ Última mensagem da conversa */}
                      <div className="flex items-center min-w-0">
                        <span className={cn(
                          "text-gray-600 truncate whitespace-nowrap overflow-hidden text-ellipsis block text-[11px] dark:text-gray-400",
                          conversationNotifications.has(conversation.id) && "font-bold text-gray-900 dark:text-white"
                        )}>
                          {conversation.last_message?.[0] ? <>
                              {conversation.last_message[0].sender_type === 'contact' ? '' : 'Você: '}
                              {conversation.last_message[0].message_type === 'text' ? conversation.last_message[0].content : `${conversation.last_message[0].message_type === 'image' ? '📷' : conversation.last_message[0].message_type === 'video' ? '🎥' : conversation.last_message[0].message_type === 'audio' ? '🎵' : '📄'} ${conversation.last_message[0].message_type.charAt(0).toUpperCase() + conversation.last_message[0].message_type.slice(1)}`}
                            </> : conversationNotifications.has(conversation.id) ? `${conversationNotifications.get(conversation.id)} mensagem${conversationNotifications.get(conversation.id)! > 1 ? 's' : ''} não lida${conversationNotifications.get(conversation.id)! > 1 ? 's' : ''}` : 'Clique para ver mensagens'}
                        </span>
                      </div>
                    </div>
                    
                {/* Secondary actions */}
                <div className="flex flex-col items-end gap-1 ml-2">
                  {/* Timestamp - ACIMA */}
                  <div className="text-right">
                    <span className="text-[10px] text-gray-500">
                      {lastActivity}
                    </span>
                  </div>
                  
                  {/* Tag/Label system + Avatar */}
                  <div className="flex items-center gap-1">
                    {/* Tags */}
                    {conversation.tags && conversation.tags.length > 0 && <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-0.5">
                              {conversation.tags.slice(0, 2).map((tag: any) => <Badge key={tag.id} variant="outline" className="text-[9px] px-1 py-0 h-3.5 rounded-none border" style={{
                                  borderColor: tag.color || '#8B5CF6',
                                  color: tag.color || '#8B5CF6',
                                  backgroundColor: 'transparent'
                                }}>
                                  {tag.name}
                                </Badge>)}
                              {conversation.tags.length > 2 && <span className="text-[9px] text-gray-400">
                                  +{conversation.tags.length - 2}
                                </span>}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="rounded-none border-[#d4d4d4] bg-white text-gray-900 shadow-md dark:bg-[#0f0f0f] dark:text-gray-100 dark:border-gray-700">
                            <div className="space-y-1">
                              {conversation.tags.map((tag: any) => <div key={tag.id} className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{
                                    backgroundColor: tag.color ? `${tag.color}99` : 'rgba(0,0,0,0.06)'
                                  }} />
                                  <span className="text-xs">{tag.name}</span>
                                </div>)}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>}
                    
                    {/* Avatar do usuário atribuído */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Avatar className="w-5 h-5 rounded-none">
                            {conversation.assigned_user_id && assignedUsersMap.get(conversation.assigned_user_id)?.avatar ? (
                              <AvatarImage
                                src={assignedUsersMap.get(conversation.assigned_user_id)!.avatar || ''}
                                alt={conversation.assigned_user_name || assignedUsersMap.get(conversation.assigned_user_id)?.name || 'Responsável'}
                                className="object-cover"
                              />
                            ) : null}
                            <AvatarFallback className="bg-gray-100 text-gray-500 text-[9px] font-bold rounded-none border border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700">
                              {(() => {
                                const displayName = conversation.assigned_user_name || assignedUsersMap.get(conversation.assigned_user_id || '')?.name;
                                return displayName ? displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '?';
                              })()}
                            </AvatarFallback>
                          </Avatar>
                        </TooltipTrigger>
                        <TooltipContent className="rounded-none border-[#d4d4d4] bg-white text-gray-900 shadow-md dark:bg-[#0f0f0f] dark:text-gray-100 dark:border-gray-700">
                          <p className="text-xs">{(conversation.assigned_user_name || assignedUsersMap.get(conversation.assigned_user_id || '')?.name)?.split(' ')[0] || 'Não atribuído'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                  </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="rounded-none border-[#d4d4d4] bg-white text-gray-800 shadow-lg dark:bg-[#0f0f0f] dark:text-gray-100 dark:border-gray-700">
                      <ContextMenuItem onClick={e => {
                    e.stopPropagation();
                    setPeekConversationId(conversation.id);
                    setPeekModalOpen(true);
                  }} className="text-xs rounded-none focus:bg-[#e6f2ff] dark:focus:bg-[#1f2937] dark:text-gray-100">
                        <Eye className="h-3.5 w-3.5 mr-2" />
                        Espiar
                      </ContextMenuItem>
                    </ContextMenuContent>
                    </ContextMenu>
                  </li>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Campo para nova conversa */}
        <div className="p-3 border-t border-[#d4d4d4] bg-gray-50 dark:bg-[#1a1a1a] dark:border-gray-700">
          <div className="flex gap-2">
            <div className="flex-1 flex gap-0 border border-[#d4d4d4] rounded-none bg-white overflow-hidden dark:bg-[#2d2d2d] dark:border-gray-600">
              {/* DDI (selecionável) */}
              <Popover open={isCountryCodeOpen} onOpenChange={setIsCountryCodeOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center bg-[#f0f0f0] px-3 border-r border-[#d4d4d4] dark:bg-[#1a1a1a] dark:border-gray-600"
                    disabled={isCreatingQuickConversation}
                  >
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                      +{quickCountryCode}
                    </span>
                    <ChevronDown className="ml-2 h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-64 p-2 rounded-none border-[#d4d4d4] bg-white dark:bg-[#1b1b1b] dark:border-gray-700"
                  align="start"
                  side="top"
                  sideOffset={8}
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <Command>
                    <CommandInput
                      placeholder="Buscar DDI (ex: 55, 1, 351)"
                      value={countryCodeSearch}
                      onValueChange={setCountryCodeSearch}
                    />
                    <CommandList className="max-h-56 overflow-y-auto">
                      <CommandEmpty>Nenhum DDI encontrado</CommandEmpty>
                      <CommandGroup heading="Sugestões">
                        {["55", "1", "351", "44", "33", "49", "34", "39", "81", "82", "86", "54", "52", "57", "56"].map((code) => (
                          <CommandItem
                            key={code}
                            value={code}
                            onSelect={() => {
                              setQuickCountryCode(code);
                              setCountryCodeSearch("");
                              setIsCountryCodeOpen(false);
                            }}
                          >
                            +{code}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <CommandGroup heading="Usar digitado">
                        {(() => {
                          const digits = (countryCodeSearch || "").replace(/\D/g, "");
                          if (!digits) return null;
                          return (
                            <CommandItem
                              value={digits}
                              onSelect={() => {
                                setQuickCountryCode(digits);
                                setCountryCodeSearch("");
                                setIsCountryCodeOpen(false);
                              }}
                            >
                              +{digits}
                            </CommandItem>
                          );
                        })()}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              
              {/* Input do número */}
              <div className="relative flex-1">
                <Input
                  placeholder="Número (sem +)"
                  value={quickPhoneNumber}
                  onChange={e => setQuickPhoneNumber(e.target.value.replace(/\D/g, ''))}
                  onKeyPress={handleQuickConversationKeyPress}
                  className="border-0 focus-visible:ring-0 pr-10 h-8 text-xs rounded-none bg-white shadow-none dark:bg-[#2d2d2d] dark:text-gray-200"
                  disabled={isCreatingQuickConversation}
                  maxLength={15}
                />
                <Button variant="ghost" size="icon" className="absolute right-0 top-1/2 transform -translate-y-1/2 h-8 w-8 rounded-none hover:bg-gray-200 dark:hover:bg-gray-700" disabled={!quickPhoneNumber.trim() || isCreatingQuickConversation} onClick={handleCreateQuickConversation}>
                  {isCreatingQuickConversation ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <ArrowRight className="w-3.5 h-3.5 dark:text-gray-400" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Área principal de chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedConversation ? <>
            {/* Cabeçalho do chat */}
            <div className="px-4 py-3 border-b border-[#d4d4d4] bg-white dark:bg-[#1f1f1f] dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {!onlyMessages && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleBackToList}
                          className="h-8 w-8 hover:bg-gray-100 rounded-none border border-[#d4d4d4] dark:border-gray-600 dark:hover:bg-gray-700"
                        >
                          <ArrowRight className="h-4 w-4 rotate-180 text-gray-600 dark:text-gray-400" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="rounded-none border-[#d4d4d4]">
                        <p>Voltar à lista (ESC)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  )}

                   <Avatar className="w-9 h-9 cursor-pointer rounded-none border border-[#d4d4d4] shadow-sm dark:border-gray-600" onClick={() => setContactPanelOpen(true)}>
                    {selectedConversation.contact?.profile_image_url && <AvatarImage src={selectedConversation.contact.profile_image_url} alt={selectedConversation.contact?.name && selectedConversation.contact.name !== '-' ? selectedConversation.contact.name : selectedConversation.contact?.phone} className="object-cover" />}
                    <AvatarFallback style={{
                  backgroundColor: getAvatarColor(selectedConversation.contact?.name && selectedConversation.contact.name !== '-' ? selectedConversation.contact.name : (selectedConversation.contact?.phone || ''))
                }} className="text-white font-bold text-xs rounded-none">
                      {getInitials(selectedConversation.contact?.name && selectedConversation.contact.name !== '-' ? selectedConversation.contact.name : (selectedConversation.contact?.phone || ''))}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-sm tracking-tight dark:text-gray-100">
                      {selectedConversation.contact?.name && selectedConversation.contact.name !== '-' ? selectedConversation.contact.name : (selectedConversation.contact?.phone || 'Sem nome')}
                    </h3>
                    <div className="flex items-center gap-2">
                    <ContactTags 
                      contactId={selectedConversation.contact.id} 
                      conversationId={selectedConversation.id}
                      isDarkMode={isDarkMode} 
                      onTagRemoved={() => {
                    // Refresh conversations after removing tag
                    fetchConversations();
                  }} />
                      <AddTagButton conversationId={selectedConversation.id} isDarkMode={isDarkMode} onTagAdded={() => {
                    // Refresh conversations after adding tag
                    fetchConversations();
                  }} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  {/* Botão do agente */}
                  <div className="flex items-center gap-2">
                    {selectedConversation.agente_ativo && agent ? (
                      <button
                        onClick={() => setChangeAgentModalOpen(true)}
                        className="flex items-center gap-2 px-3 py-1 rounded-none shadow-sm hover:shadow-md transition-all group h-8"
                        style={{
                          backgroundColor: isDark ? "#5e5b5b" : "rgb(217, 217, 217)",
                          borderColor: isDark ? "#5e5b5b" : "rgb(217, 217, 217)",
                          borderWidth: "1px",
                          borderStyle: "solid"
                        }}
                        title="Agente ativo - clique para trocar"
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-green-500 dark:bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-500/50 dark:shadow-green-400/50" />
                          <Bot className="w-3.5 h-3.5 text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform" />
                        </div>
                        <span 
                          className="text-xs font-bold leading-none"
                          style={{
                            color: isDark ? "#ffffff" : "#2d2d2d"
                          }}
                        >
                          {agent.name}
                        </span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setChangeAgentModalOpen(true)}
                        className="flex items-center gap-2 px-3 py-1 rounded-none shadow-sm hover:shadow-md transition-all group h-8"
                        style={{
                          backgroundColor: "#fab4b4",
                          borderColor: "#fab4b4",
                          borderWidth: "1px",
                          borderStyle: "solid"
                        }}
                        title="Clique para ativar um agente"
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full group-hover:bg-green-500 transition-colors" />
                          <Bot className="w-3.5 h-3.5 text-gray-600 group-hover:text-green-600 group-hover:scale-110 transition-all" />
                        </div>
                        <span className="text-xs font-bold text-gray-700 group-hover:text-green-700 leading-none transition-colors">
                          Ativar
                        </span>
                      </button>
                    )}
                    
                    <button
                      onClick={() => setAssignmentHistoryModalOpen(true)}
                      className="p-1.5 hover:bg-gray-100 rounded-none border border-[#d4d4d4] dark:border-gray-600 dark:hover:bg-gray-700 h-8 w-8 flex items-center justify-center transition-colors"
                      title="Ver histórico de agentes e transferências"
                    >
                      <Clock className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    </button>
                  </div>
                  
                  {selectedConversation.connection_id && (
                    <ConnectionBadge 
                      connectionId={selectedConversation.connection_id}
                      connectionInfo={selectedConversation.connection}
                    />
                  )}
                  
                  <AcceptConversationButton conversation={selectedConversation} onAccept={async (conversationId: string) => {
                // Get current user info for immediate UI update
                const userData = localStorage.getItem('currentUser');
                const currentUserData = userData ? JSON.parse(userData) : null;

                // Update selected conversation immediately for better UX
                if (selectedConversation && selectedConversation.id === conversationId) {
                  setSelectedConversation(prev => prev ? {
                    ...prev,
                    assigned_user_id: currentUserData?.id || null,
                    assigned_user_name: currentUserData?.name || null
                  } : prev);
                }

                // Refresh conversations to sync with server and update the list
                await fetchConversations();
              }} className="h-8 px-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-none" />
                  
                  <EndConversationButton conversation={selectedConversation} className="h-8 px-3 rounded-none text-xs font-bold border-[#d4d4d4]" />
                  
                  {selectedConversation && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 p-0 rounded-none border-[#d4d4d4] hover:bg-gray-100 dark:border-gray-600 dark:bg-[#2d2d2d] dark:hover:bg-gray-700"
                          title="Mais ações"
                        >
                          <MoreVertical className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 rounded-none border-[#d4d4d4] dark:bg-[#2d2d2d] dark:border-gray-600">
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            setTransferModalOpen(true);
                          }}
                          className="rounded-none text-xs font-medium focus:bg-[#e6f2ff] dark:text-gray-200 dark:focus:bg-gray-700"
                        >
                          Transferir
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive focus:text-destructive rounded-none text-xs font-medium focus:bg-red-50 dark:text-white dark:focus:text-white dark:focus:bg-red-900/30"
                        >
                          Deletar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </div>

            {/* Área de mensagens */}
        <div className="flex-1 h-0 relative overflow-hidden">
          {/* Indicador de data flutuante - FORA do ScrollArea */}
          {shouldShowFloating && floatingDate && (
            <FloatingDateIndicator date={floatingDate} visible={shouldShowFloating} />
          )}
          
          <ScrollArea 
            className="h-full w-full bg-white dark:bg-[#0f1115]" 
            ref={node => {
              if (node) {
                const scrollContainer = node.querySelector('[data-radix-scroll-area-viewport]');
                if (scrollContainer) {
                  messagesScrollRef.current = scrollContainer as HTMLElement;
                  console.log('✅ Viewport encontrado:', scrollContainer);
                }
              }
            }}
            onScroll={handleScroll}
          >
            <div className="p-4">
              {/* Loading visual ao carregar mais mensagens (mesmo que já estejam em memória) */}
              {(isVisualLoading || loadingMore) && (
                <div className="flex justify-center py-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                    <span className="text-xs font-medium">Carregando mensagens anteriores...</span>
                  </div>
                </div>
              )}
              
              {/* Loading inicial das mensagens */}
              {messagesLoading && messages.length === 0 && (
                <div className="flex justify-center p-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              )}
              
              <div className="space-y-6">
                {Array.from(messagesByDate.entries()).map(([dateKey, dateMessages]) => {
                  const firstMessage = dateMessages[0];
                  const dateLabel = formatMessageDate(firstMessage.created_at);
                  
                  return (
                    <div key={dateKey} className="space-y-4">
                      {/* Separador de data */}
                      <DateSeparator date={dateLabel} />
                      
                      {/* Mensagens do dia */}
                      <div className="space-y-2">
                      {dateMessages.map(message => {
                        const displayStatus = getDisplayMessageStatus(message);
                        const isContactMessage = message.sender_type === 'contact';
                        const senderDisplayName = getSenderDisplayName(
                          message.sender_type,
                          selectedConversation.contact?.name || ''
                        );

                        return (
                          <div 
                            key={message.id} 
                            data-message-id={message.id} 
                            className={cn(
                              "flex items-start gap-2 max-w-[85%] relative group/message",
                              isContactMessage ? "flex-row" : "flex-row-reverse ml-auto",
                              selectionMode && "cursor-pointer",
                              selectedMessages.has(message.id) && "bg-blue-50/50 ring-1 ring-blue-200"
                            )}
                            onClick={() => selectionMode && toggleMessageSelection(message.id)}
                          >
                    {isContactMessage && <Avatar className="w-6 h-6 flex-shrink-0 cursor-pointer hover:ring-1 hover:ring-primary rounded-none border border-[#d4d4d4]" onClick={() => setContactPanelOpen(true)}>
                        {selectedConversation.contact?.profile_image_url && <AvatarImage src={selectedConversation.contact.profile_image_url} alt={selectedConversation.contact?.name} className="object-cover" />}
                        <AvatarFallback className={cn("text-white text-[9px] font-bold rounded-none", getAvatarColor(selectedConversation.contact?.name || ''))}>
                          {getInitials(selectedConversation.contact?.name || '')}
                        </AvatarFallback>
                      </Avatar>}
                     
                     <div className={cn(
                       "max-w-full group relative shadow-sm",
                       message.message_type === 'audio' ? "shadow-none" : "rounded-none",
                       // Mensagens de contato
                       isContactMessage 
                         ? message.message_type === 'audio' 
                           ? "" 
                           : message.message_type === 'image' || message.message_type === 'video' 
                             ? "bg-transparent border-none shadow-none" 
                             : "bg-white dark:bg-[#2d2d2d]"
                       // Mensagens do agente IA (origem_resposta: automatica)
                       : message.origem_resposta === 'automatica'
                         ? message.message_type === 'audio'
                           ? ""
                           : message.message_type === 'image' || message.message_type === 'video'
                             ? "bg-transparent border-none shadow-none"
                             : "bg-[#f0fdf4] dark:bg-green-900/20"
                       // Mensagens normais do agente
                      : message.message_type !== 'text' && message.file_url 
                          ? message.message_type === 'audio' 
                            ? "" 
                            : message.message_type === 'image' || message.message_type === 'video' 
                              ? "bg-transparent border-none shadow-none" 
                              : "bg-[#e6f2ff] dark:bg-blue-900/20" 
                          : "bg-[#e6f2ff] dark:bg-blue-900/20",
                         // Padding base
                         message.message_type !== 'audio' && !(message.message_type === 'image' || message.message_type === 'video') && "px-3 py-2"
                     )}>
                      {/* Menu de contexto */}
                      {!selectionMode && <div className="opacity-0 group-hover/message:opacity-100 transition-opacity absolute top-0 right-0 z-10">
                        <MessageContextMenu onForward={() => handleMessageForward(message.id)} onReply={() => handleReply(message)} onDownload={message.file_url ? () => {
                  const link = document.createElement('a');
                  link.href = message.file_url!;
                  link.download = message.file_name || 'download';
                  link.target = '_blank';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                } : undefined} hasDownload={!!message.file_url} />
                      </div>}
                      
                      {/* Mostrar mensagem quotada se existir */}
                      {message.quoted_message && message.reply_to_message_id && (
                        <QuotedMessagePreview
                          quotedMessage={message.quoted_message}
                          senderName={getSenderDisplayName(
                            message.quoted_message.sender_type,
                            selectedConversation.contact?.name || ''
                          )}
                          onQuoteClick={() => scrollToMessage(message.reply_to_message_id!)}
                        />
                      )}

                      {/* Renderizar conteúdo baseado no tipo */}
                      {message.message_type !== 'text' && message.file_url ? (
                        <MediaViewer
                          fileUrl={message.file_url}
                          fileName={message.file_name}
                          messageType={message.message_type}
                          className="max-w-xs"
                          senderType={message.sender_type}
                          senderAvatar={isContactMessage ? selectedConversation.contact?.profile_image_url : undefined}
                          senderName={senderDisplayName}
                          messageStatus={displayStatus}
                          timestamp={message.created_at}
                          caption={message.content}
                        />
                      ) : (
                        <div className="flex flex-col min-w-[120px]">
                    <p className={cn(
                      "text-xs leading-relaxed text-gray-900 break-words whitespace-pre-wrap dark:text-gray-100",
                      message.origem_resposta === 'automatica' && "text-green-900 dark:text-green-100"
                    )}>{message.content}</p>
                    
                    <div className="flex items-center justify-end gap-1 mt-1 select-none">
                      <span className="text-[9px] text-gray-400 font-medium">
                        {new Date(message.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {displayStatus && !isContactMessage && (
                        <div className="scale-75 origin-right">
                          <MessageStatusIndicator 
                            status={displayStatus} 
                          />
                        </div>
                      )}
                    </div>
                  </div>
                      )}
                    </div>
                  </div>
                        );
                      })}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </ScrollArea>
          </div>

            {/* Reply Preview */}
            {replyingTo && (
              <ReplyPreview
                message={replyingTo}
                contactName={selectedConversation.contact?.name || ''}
                onCancel={() => setReplyingTo(null)}
              />
            )}

            {/* Campo de entrada de mensagem */}
            <div className="p-3 border-t border-[#d4d4d4] relative bg-gray-50 dark:bg-[#1a1a1a] dark:border-gray-700">
              {isRecording ? <div className="flex items-center gap-3 bg-white border border-[#d4d4d4] p-2 rounded-none shadow-sm dark:bg-[#2d2d2d] dark:border-gray-600">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${isConvertingAudio ? 'bg-blue-500' : 'bg-red-500'}`} />
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                        {isConvertingAudio ? 'Processando áudio...' : 'Gravando...'}
                      </span>
                    </div>
                    {isConvertingAudio && (
                      <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Convertendo para MP3</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 text-center">
                    <span className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                      {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:
                      {String(recordingTime % 60).padStart(2, '0')}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button onClick={cancelRecording} size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:bg-red-50 text-red-600 disabled:opacity-50" title="Cancelar gravação" disabled={isConvertingAudio}>
                      <X className="w-4 h-4" />
                    </Button>
                    
                    <Button onClick={stopRecording} size="icon" className="h-8 w-8 rounded-full bg-green-500 hover:bg-green-600 text-white disabled:opacity-50" title="Enviar áudio" disabled={isConvertingAudio}>
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </div> : <div className="flex items-end gap-2">
                  <MediaUpload onFileSelect={async (file, mediaType, fileUrl, caption) => {
              if (!selectedConversation) return;
              
              // MUTEX: Prevenir duplicação baseado na URL do arquivo
              const messageKey = `media-${selectedConversation.id}-${fileUrl}`;
              if (sendingRef.current.has(messageKey)) {
                console.log('⏭️ Ignorando envio duplicado de mídia');
                return;
              }
              sendingRef.current.add(messageKey);
              
              // Usar UUID único para prevenir duplicação
              const clientMessageId = generateRandomId();
              
              const optimisticMessage = {
                id: clientMessageId,
                external_id: clientMessageId,
                conversation_id: selectedConversation.id,
                content: caption || '', // Caption do modal ou vazio
                message_type: mediaType as any,
                sender_type: 'agent' as const,
                sender_id: user?.id,
                file_url: fileUrl,
                file_name: file.name,
                mime_type: file.type,
                created_at: new Date().toISOString(),
                status: 'sending' as const,
                workspace_id: selectedWorkspace?.workspace_id || ''
              };
              
              addMessage(optimisticMessage);
              
              try {
                const {
                  data: sendResult,
                  error
                } = await supabase.functions.invoke('test-send-msg', {
                  body: {
                    conversation_id: selectedConversation.id,
                    content: caption || '', // Caption do modal
                    message_type: mediaType,
                    sender_id: user?.id,
                    sender_type: 'agent',
                    file_url: fileUrl,
                    file_name: file.name,
                    mime_type: file.type,
                    clientMessageId: clientMessageId
                  },
                  headers: {
                    'x-system-user-id': user?.id || '',
                    'x-workspace-id': selectedWorkspace?.workspace_id || '',
                    'x-system-user-email': user?.email || ''
                  }
                });
                
                if (error) {
                  console.error('Erro ao enviar mídia:', error);
                  toast({
                    title: "Erro ao enviar mídia",
                    description: error.message || "Erro desconhecido",
                    variant: "destructive"
                  });
                  updateMessage(optimisticMessage.id, {
                    status: 'failed',
                    content: `❌ ${optimisticMessage.content}`
                  });
                } else {
                  console.log('✅ Mídia enviada com sucesso:', sendResult);
                  // Atualizar external_id para corresponder à mensagem real que virá do Realtime
                  if (sendResult.external_id) {
                    updateMessage(clientMessageId, {
                      external_id: sendResult.external_id
                    });
                  }
                }
              } catch (err) {
                console.error('Erro ao enviar mídia:', err);
                toast({
                  title: "Erro ao enviar mídia",
                  description: "Erro de conexão",
                  variant: "destructive"
                });
                updateMessage(optimisticMessage.id, {
                  status: 'failed',
                  content: `❌ ${optimisticMessage.content}`
                });
              } finally {
                // Remover do MUTEX após 1 segundo
                setTimeout(() => sendingRef.current.delete(messageKey), 1000);
              }
            }} />
                  
                  <Button variant="ghost" size="sm" title="Mensagens Rápidas" onClick={() => setQuickItemsModalOpen(true)} className="h-9 w-9 p-0 rounded-none border border-[#d4d4d4] hover:bg-gray-200 bg-white dark:bg-[#2d2d2d] dark:border-gray-600 dark:hover:bg-gray-700">
                    <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" focusable="false" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                      <circle cx="9" cy="9" r="4"></circle>
                      <path d="M9 15c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm7.76-9.64l-1.68 1.69c.84 1.18.84 2.71 0 3.89l1.68 1.69c2.02-2.02 2.02-5.07 0-7.27zM20.07 2l-1.63 1.63c2.77 3.02 2.77 7.56 0 10.74L20.07 16c3.9-3.89 3.91-9.95 0-14z"></path>
                    </svg>
                  </Button>
                  <Popover
                    open={slashOpen}
                    onOpenChange={(open) => {
                      if (!open) {
                        setSlashOpen(false);
                        setSlashQuery("");
                        slashReplaceRangeRef.current = null;
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <div className="flex-1">
                        <Textarea 
                          ref={composerTextareaRef}
                          placeholder="Digite sua mensagem..." 
                          value={messageText} 
                          rows={1}
                          onChange={e => {
                            if (!selectedConversation) return;

                            const value = e.target.value;
                            const cursor = e.target.selectionStart ?? value.length;
                            updateMessageDraft(selectedConversation.id, value);

                            const uptoCursor = value.slice(0, cursor);
                            const match = uptoCursor.match(/(?:^|\s)\/([^\s\/]{0,50})$/);
                            if (match) {
                              setSlashOpen(true);
                              setSlashQuery(match[1] || "");
                              const slashIndex = uptoCursor.lastIndexOf('/');
                              slashReplaceRangeRef.current = { start: slashIndex, end: cursor };
                            } else {
                              setSlashOpen(false);
                              setSlashQuery("");
                              slashReplaceRangeRef.current = null;
                            }
                          }} 
                          onKeyDown={e => {
                            if (slashOpen) {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                setSlashOpen(false);
                                setSlashQuery("");
                                slashReplaceRangeRef.current = null;
                                return;
                              }

                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                const first = slashSuggestions[0];
                                if (first) {
                                  applySlashQuickMessage(first);
                                } else {
                                  setSlashOpen(false);
                                  setSlashQuery("");
                                  slashReplaceRangeRef.current = null;
                                }
                                return;
                              }
                            }

                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }} 
                          className="h-9 min-h-[36px] max-h-32 text-xs rounded-none border-gray-300 focus-visible:ring-0 focus-visible:border-primary bg-white shadow-sm resize-none dark:bg-[#2d2d2d] dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-400" 
                        />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      side="top"
                      className="w-80 p-0 rounded-none border border-[#d4d4d4] bg-white text-gray-800 shadow-lg dark:bg-[#0f0f0f] dark:text-gray-100 dark:border-gray-700"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <Command className="rounded-none">
                        <CommandList>
                          <CommandEmpty>Nenhuma mensagem rápida encontrada</CommandEmpty>
                          <CommandGroup heading={`Mensagens rápidas${slashQuery ? `: ${slashQuery}` : ""}`}>
                            {slashSuggestions.map((m: any) => (
                              <CommandItem
                                key={m.id}
                                value={m.title}
                                onSelect={() => applySlashQuickMessage(m)}
                              >
                                <span className="text-xs truncate">{m.title}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button onClick={startRecording} size="icon" variant="secondary" title="Gravar áudio" className="h-9 w-9 rounded-none border border-[#d4d4d4] hover:bg-gray-200 bg-white shadow-none dark:bg-[#2d2d2d] dark:border-gray-600 dark:hover:bg-gray-700">
                    <Mic className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </Button>
                  <Button onClick={handleSendMessage} disabled={!messageText.trim() || isSending} size="icon" className="h-9 w-9 rounded-none bg-primary hover:bg-primary/90 shadow-none">
                    {isSending ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>}

              {/* Barra de seleção (modo de encaminhamento) */}
              {selectionMode && <MessageSelectionBar selectedCount={selectedMessages.size} onCancel={cancelSelection} onForward={() => setForwardModalOpen(true)} />}
            </div>
          </> : (
            // ✅ Evitar "piscar" no modal: quando chega via selectedConversationId, mostrar skeleton até abrir/carregar
            selectedConversationId && (isOpeningConversation || messagesLoading) ? (
              <div className="flex-1 flex items-center justify-center bg-white dark:bg-[#1f1f1f]">
                <div className="w-full max-w-2xl p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-6 w-56 bg-gray-200 dark:bg-gray-800 rounded-none" />
                    <div className="h-4 w-80 bg-gray-200 dark:bg-gray-800 rounded-none" />
                    <div className="pt-4 space-y-3">
                      <div className="h-10 w-2/3 bg-gray-200 dark:bg-gray-800 rounded-none" />
                      <div className="h-10 w-1/2 bg-gray-200 dark:bg-gray-800 rounded-none" />
                      <div className="h-10 w-3/5 bg-gray-200 dark:bg-gray-800 rounded-none" />
                      <div className="h-10 w-1/3 bg-gray-200 dark:bg-gray-800 rounded-none" />
                    </div>
                    <div className="pt-4 h-9 w-full bg-gray-200 dark:bg-gray-800 rounded-none" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-white dark:bg-[#1f1f1f]">
                <div className="text-center">
                  <MessageCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2 dark:text-gray-200">
                    Selecione uma conversa
                  </h3>
                  <p className="text-muted-foreground dark:text-gray-400">
                    Escolha uma conversa da lista para começar a conversar
                  </p>
                </div>
              </div>
            )
          )}
        
        <PeekConversationModal isOpen={peekModalOpen} onClose={() => {
        setPeekModalOpen(false);
        setPeekConversationId(null);
      }} conversationId={peekConversationId} />
      
      <ContactSidePanel isOpen={contactPanelOpen} onClose={() => setContactPanelOpen(false)} contact={selectedConversation?.contact || null} />
      
      <QuickItemsModal
        open={quickItemsModalOpen}
        onOpenChange={setQuickItemsModalOpen}
        onSendMessage={handleSendQuickMessage}
        onInsertMessage={(content) => insertMessageIntoComposer(content)}
        onSendAudio={handleSendQuickAudio}
        onPreviewAudio={requestQuickAudioPreview}
        onSendMedia={handleSendQuickMedia}
        onSendDocument={handleSendQuickDocument}
      />
      {activeAudioPreview && (
        <div className="w-full rounded-none border border-[#d4d4d4] bg-[#f8f9fa] px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-[#171717] dark:text-gray-100 mb-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium truncate">{activeAudioPreview.label}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Pré-visualização
            </span>
          </div>
          <audio controls className="w-full rounded-md bg-white/70 dark:bg-white/10" src={activeAudioPreview.src} />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none border border-gray-300 dark:border-gray-600 dark:text-gray-100"
              onClick={activeAudioPreview.onCancel}
              disabled={activeAudioPreview.sending}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-none bg-primary text-primary-foreground dark:hover:bg-primary/90"
              onClick={activeAudioPreview.onSend}
              disabled={activeAudioPreview.sending}
            >
              {activeAudioPreview.sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar"
              )}
            </Button>
          </div>
        </div>
      )}
      
      <ForwardMessageModal isOpen={forwardModalOpen} onClose={() => setForwardModalOpen(false)} onForward={handleForwardMessages} />
      
      <SelectAgentModal 
        open={showSelectAgentModal} 
        onOpenChange={setShowSelectAgentModal} 
        conversationId={selectedConversation?.id || ''} 
      />

      <ChangeAgentModal
        open={changeAgentModalOpen}
        onOpenChange={setChangeAgentModalOpen}
        conversationId={selectedConversation?.id || ''}
        currentAgentId={selectedConversation?.agent_active_id}
        onAgentChanged={async () => {
          console.log('🔄 Agente alterado, atualizando conversa...');
          // Recarregar conversas para atualizar a lista
          await fetchConversations();
        }}
      />

      <AssignmentHistoryModal
        isOpen={assignmentHistoryModalOpen}
        onOpenChange={setAssignmentHistoryModalOpen}
        conversationId={selectedConversation?.id || ''}
      />

      <TransferConversationModal
        open={transferModalOpen}
        onOpenChange={setTransferModalOpen}
        conversation={selectedConversation}
        users={workspaceMembers}
        queues={queues}
        connections={workspaceConnections}
        isLoadingConnections={connectionsLoading}
        isLoadingQueues={queuesLoading}
        onTransferSuccess={handleTransferSuccess}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border border-[#d4d4d4] bg-white text-gray-900 shadow-lg rounded-none dark:border-gray-700 dark:bg-[#0b0b0b] dark:text-gray-100">
          <AlertDialogHeader className="px-6 pt-5 pb-3 border-b border-[#d4d4d4] bg-[#f4b400] text-gray-900 dark:border-gray-900 dark:bg-[#f4b400] dark:text-gray-900">
            <AlertDialogTitle className="text-base font-semibold">
              Deletar atendimento
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="bg-red-50 dark:bg-[#1a1a1a] h-20 w-full flex items-center justify-center px-8 text-sm text-red-800 text-center dark:text-white">
            Esta ação irá remover o atendimento e todas as mensagens associadas. Deseja continuar?
          </div>
          <AlertDialogFooter className="flex flex-row justify-end gap-2 px-6 py-4 bg-[#f4b400]/10 border-t border-[#d4d4d4] dark:bg-[#0b0b0b] dark:border-gray-900">
            <AlertDialogCancel
              disabled={isDeletingConversation}
              className="h-9 px-6 text-sm font-semibold rounded-none border border-gray-300 bg-white hover:bg-gray-100 dark:border-gray-800 dark:bg-[#1f1f1f] dark:text-gray-100 dark:hover:bg-[#2a2a2a]"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeletingConversation}
              className="h-9 px-6 text-sm font-semibold rounded-none bg-red-600 hover:bg-red-700 focus:ring-red-600 dark:bg-red-600 dark:hover:bg-red-700"
            >
              {isDeletingConversation ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deletando...
                </span>
              ) : (
                "Deletar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>

      {/* ✅ Listener para recarregar mensagens quando a página fica visível novamente */}
      {(() => {
        useEffect(() => {
          const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && selectedConversation?.id) {
              console.log('👁️ [WhatsAppChat] Página visível, recarregando mensagens:', selectedConversation.id);
              loadMessages(selectedConversation.id, true); // ✅ Forçar refresh
            }
          };

          document.addEventListener('visibilitychange', handleVisibilityChange);
          return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
        }, [selectedConversation?.id]);

        return null;
      })()}
    </div>;
}