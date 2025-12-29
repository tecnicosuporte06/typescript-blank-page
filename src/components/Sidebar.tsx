import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, MoreVertical, ArrowLeft, LayoutDashboard, MessageCircle, Users, FolderOpen, Settings, Zap, Link, Shield, DollarSign, Target, Package, Calendar, CheckSquare, MessageSquare, Bot, BrainCircuit, GitBranch, Bell, User, LogOut, Handshake, FileText, Building2, BarChart3, AudioLines, Moon, Sun, Key } from "lucide-react";
import logoEx from "@/assets/logo-ex.png";
import logoEnc from "@/assets/logo-enc.png";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ModuleType } from "./TezeusCRM";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { NotificationTooltip } from "@/components/NotificationTooltip";
import { useRealtimeNotifications } from "@/components/RealtimeNotificationProvider";
import { useNotifications } from "@/hooks/useNotifications";
import { useWhatsAppConversations } from "@/hooks/useWhatsAppConversations";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ImpersonateWorkspaceModal } from "@/components/modals/ImpersonateWorkspaceModal";
import { MeuPerfilModal } from "@/components/modals/MeuPerfilModal";
import { useSystemCustomizationContext } from "@/contexts/SystemCustomizationContext";
import { useCargoPermissions } from "@/hooks/useCargoPermissions";

interface SidebarProps {
  activeModule: ModuleType;
  onModuleChange: (module: ModuleType) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onNavigateToConversation?: (conversationId: string) => void;
}

interface MenuItem {
  id: ModuleType;
  label: string;
  icon: React.ReactNode;
  children?: MenuItem[];
  masterOnly?: boolean;
}

export function Sidebar({
  activeModule,
  onModuleChange,
  isCollapsed,
  onToggleCollapse,
  onNavigateToConversation
}: SidebarProps) {
  const navigate = useNavigate();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [shouldLoadNotifications, setShouldLoadNotifications] = useState(false);
  const [isPerfilModalOpen, setIsPerfilModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const temporarilyDisableThemeTransitions = () => {
    const root = document.documentElement;
    root.classList.add('disable-theme-transitions');
    window.setTimeout(() => {
      root.classList.remove('disable-theme-transitions');
    }, 0);
  };

  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark' || 
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    temporarilyDisableThemeTransitions();
    setIsDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = (checked: boolean) => {
    temporarilyDisableThemeTransitions();
    setIsDarkMode(checked);
    if (checked) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Hooks para notificações - usando o provider compartilhado
  const {
    notifications,
    totalUnread
  } = useRealtimeNotifications();
  
  // Funções do hook original
  const { 
    markContactAsRead,
    markAllAsRead,
    getAvatarInitials,
    getAvatarColor,
    formatTimestamp
  } = useNotifications();
  
  
  useEffect(() => {
    console.log('🔔 [Sidebar] Dados de notificação ATUALIZADOS:', {
      totalUnread,
      num_notifications: notifications.length,
      timestamp: new Date().toISOString(),
      notifications: notifications.map((n: any) => ({
        contact: n.contactName,
        content: n.content
      }))
    });
  }, [notifications, totalUnread]);
  const {
    user,
    userRole,
    hasRole,
    logout
  } = useAuth();
  const { canView, canViewAnyIn } = useCargoPermissions();
  // Usar workspaces do contexto (que já tem cache)
  const {
    selectedWorkspace,
    setSelectedWorkspace,
    workspaces,
    isLoadingWorkspaces: isLoading
  } = useWorkspace();
  const {
    customization
  } = useSystemCustomizationContext();

  const handleBackToMasterDashboard = () => {
    // Limpar workspace selecionado
    setSelectedWorkspace(null);
    localStorage.removeItem('selectedWorkspace');
    // Redirecionar para dashboard master
    navigate('/master-dashboard');
  };

  // Auto-select first workspace for master users
  useEffect(() => {
    if (userRole === 'master' && !selectedWorkspace && workspaces.length > 0 && !isLoading) {
      setSelectedWorkspace(workspaces[0]);
    }
  }, [userRole, selectedWorkspace, workspaces, isLoading, setSelectedWorkspace]);

  // ✅ CORREÇÃO: Listener para forçar atualização das notificações em tempo real
  useEffect(() => {
    const handleConversationRead = () => {
      console.log('🔔 Sidebar: Detectada leitura de conversa, forçando atualização');
      // O hook useNotifications já vai reagir automaticamente
    };

    const handleNewMessage = () => {
      console.log('🔔 Sidebar: Nova mensagem detectada, forçando atualização');
      // O hook useNotifications já vai reagir automaticamente
    };

    window.addEventListener('conversation-read', handleConversationRead);
    window.addEventListener('new-contact-message', handleNewMessage);

    return () => {
      window.removeEventListener('conversation-read', handleConversationRead);
      window.removeEventListener('new-contact-message', handleNewMessage);
    };
  }, []);

  const menuItems: (MenuItem & {
    group?: string;
    masterOnly?: boolean;
  })[] = [{
    id: "relatorios" as ModuleType,
    label: "Relatórios",
    icon: <LayoutDashboard className="w-5 h-5" />
  }, {
    id: "pipeline" as ModuleType,
    label: "Pipeline",
    icon: <DollarSign className="w-5 h-5" />,
    group: "crm"
  }, {
    id: "conversas" as ModuleType,
    label: "Conversas",
    icon: <MessageCircle className="w-5 h-5" />
  }, {
    id: "atividades" as ModuleType,
    label: "Atividades",
    icon: <CheckSquare className="w-5 h-5" />,
    group: "crm"
  }, {
    id: "agendas" as ModuleType,
    label: "Agendas",
    icon: <Calendar className="w-5 h-5" />,
    group: "crm"
  }, {
    id: "contatos" as ModuleType,
    label: "Contatos",
    icon: <Users className="w-5 h-5" />,
    group: "crm"
  }, {
    id: "etiquetas" as ModuleType,
    label: "Etiquetas",
    icon: <Target className="w-5 h-5" />,
    group: "crm"
  }, {
    id: "produtos" as ModuleType,
    label: "Produtos",
    icon: <Package className="w-5 h-5" />,
    group: "crm"
  }, {
    id: "filas" as ModuleType,
    label: "Filas",
    icon: <Users className="w-5 h-5" />,
    group: "administracao"
  }, {
    id: "mensagens-rapidas" as ModuleType,
    label: "Mensagens Rápidas",
    icon: <AudioLines className="w-5 h-5" />
  }, {
    id: "empresa" as ModuleType,
    label: "Empresa",
    icon: <Building2 className="w-5 h-5" />
  }].filter(item => {
    // Filtrar itens masterOnly se o usuário não for master
    if (item.masterOnly && userRole !== 'master') {
      return false;
    }
    return true;
  });

  const renderMenuItem = (item: MenuItem & {
    group?: string;
    masterOnly?: boolean;
  }) => {
    const isActive = activeModule === item.id;

    const menuButton = (
      <button
        key={item.id}
        onClick={() => onModuleChange(item.id)}
        className={cn(
          "w-full flex items-center transition-all relative group outline-none",
          isCollapsed ? "justify-center p-2" : "gap-2 px-3 py-1.5",
          "text-sm font-medium rounded-none", // Excel-like typography
          isActive 
            ? "bg-[#FEF3C7] text-black font-bold shadow-sm z-10" // Active look: yellow background, bold black text
            : "text-black hover:bg-[#e1e1e1] hover:z-10" // Hover look
        )}
      >
        {React.cloneElement(item.icon as React.ReactElement, {
          className: cn(
            "transition-all duration-300",
            isCollapsed ? "w-4 h-4" : "w-3.5 h-3.5",
            isActive ? "text-black" : "text-black group-hover:text-black"
          )
        })}
        {!isCollapsed && <span className="truncate">{item.label}</span>}
      </button>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider key={item.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              {menuButton}
            </TooltipTrigger>
            <TooltipContent side="right" className="ml-2 text-xs bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md">
              <p>{item.label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return menuButton;
  };

  const handleNotificationClick = (conversationId: string) => {
    console.log('🔔 Sidebar - Clique na notificação:', conversationId);
    setIsNotificationOpen(false);

    if (onNavigateToConversation) {
      onNavigateToConversation(conversationId);
      setTimeout(() => {
        markContactAsRead(conversationId);
      }, 300);
    }
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead();
    setIsNotificationOpen(false);
  };

  const handleMarkContactAsRead = (conversationId: string) => {
    markContactAsRead(conversationId);
  };

  return (
    <div 
      data-sidebar 
      className={cn(
        "flex flex-col m-2 shadow-sm font-sans text-xs transition-all duration-300 ease-in-out relative",
        "bg-primary", // Amarelo igual ao topo, mesma cor em ambos os modos
        isCollapsed ? "w-12" : "w-52" // Compact widths
      )}
    >
      {/* Title Bar (Logo) */}
      <div className={cn(
        "flex-shrink-0 flex items-center bg-primary text-primary-foreground transition-all duration-300 justify-center overflow-hidden",
        isCollapsed ? "h-20 p-2" : "h-36 p-4"
      )}>
        {/* Logo ou Texto */}
        {customization.logo_url ? (
          <img 
            src={customization.logo_url} 
            alt="Logo" 
            className="w-full h-full object-contain transition-all duration-300"
          />
        ) : (
          <img 
            src={isCollapsed ? logoEnc : logoEx} 
            alt="TEZEUS" 
            className="w-full h-full object-contain transition-all duration-300"
          />
        )}
      </div>

      {/* Botão de colapso flutuante na lateral */}
      <button 
        onClick={onToggleCollapse} 
        className={cn(
          "absolute top-1/2 -right-3 transform -translate-y-1/2",
          "z-40 w-6 h-6 flex items-center justify-center",
          "bg-yellow-400 border border-yellow-500 dark:bg-yellow-500 dark:border-yellow-600",
          "rounded-full shadow-md hover:bg-yellow-500 dark:hover:bg-yellow-600 transition-all duration-200 group",
          isCollapsed && "rotate-180"
        )}
        style={{
          animation: 'pulse-subtle 4s ease-in-out infinite'
        }}
      >
        <style>{`
          @keyframes pulse-subtle {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.7;
            }
          }
        `}</style>
        <ChevronLeft className="w-4 h-4 text-gray-800 dark:text-gray-900 group-hover:text-gray-900 transition-colors" />
      </button>

      {/* Workspace Info */}
      {selectedWorkspace && (
        <div className={cn(
          "flex-shrink-0 bg-primary transition-all duration-300",
          isCollapsed ? 'p-1 flex justify-center' : 'px-3 py-2.5'
        )}>
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-black flex-shrink-0" />
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-black truncate leading-tight">
                  {selectedWorkspace.name}
                </p>
                {selectedWorkspace.cnpj && (
                  <p className="text-[9px] text-black truncate leading-tight">
                    {selectedWorkspace.cnpj}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        {menuItems.filter(item => {
          if (item.id === 'relatorios') return canView('dashboard-item');
          if (item.id === 'conversas') return canView('conversas-item');
          if (item.id === 'mensagens-rapidas') return true;
          if (item.id === 'empresa') return hasRole(['master', 'admin']);
          if (item.id === 'pipeline') return canView('crm-negocios-item');
          if (item.id === 'contatos') return canView('crm-contatos-item');
          if (item.id === 'etiquetas') return canView('crm-tags-item');
          if (item.id === 'produtos') return canView('crm-produtos-item');
          if (item.group === 'administracao') return hasRole(['master', 'admin']);
          return true;
        }).map(renderMenuItem)}
      </nav>

      {/* Action Icons */}
      <div className={cn("flex-shrink-0 bg-primary", isCollapsed ? "p-1" : "p-2")}>
        <div className={cn("flex items-center", isCollapsed ? "flex-col gap-2" : "justify-between")}>
          {!isCollapsed && (
            <div className="flex items-center px-1">
              <Switch 
                checked={isDarkMode} 
                onCheckedChange={toggleDarkMode}
                className="scale-75 border-0 data-[state=unchecked]:bg-[#b5bec9] data-[state=checked]:bg-[#3a3a3e]"
                thumbClassName="relative text-[12px] bg-[#4a4a4d] text-white data-[state=checked]:bg-[#f4f4f4] data-[state=checked]:text-[#2b2b2b] shadow-md"
                thumbContent={
                  isDarkMode ? (
                    <Sun className="h-3 w-3" strokeWidth={2} />
                  ) : (
                    <Moon className="h-3 w-3" strokeWidth={2} fill="white" />
                  )
                }
              />
            </div>
          )}
          <div className={cn("flex items-center", isCollapsed ? "flex-col gap-2" : "gap-2")}>
            <TooltipProvider>
            <Tooltip>
              {totalUnread > 0 ? (
                <Popover open={isNotificationOpen} onOpenChange={setIsNotificationOpen}>
                  <PopoverTrigger asChild>
                     <TooltipTrigger asChild>
                       <button className="p-1 hover:bg-gray-300 rounded relative transition-all duration-200">
                         <Bell className="w-4 h-4 text-black" />
                         <Badge 
                           variant="destructive" 
                           className="absolute -top-1 -right-1 w-3.5 h-3.5 p-0 flex items-center justify-center text-[9px] border-0"
                         >
                           {totalUnread > 99 ? '99' : totalUnread}
                         </Badge>
                      </button>
                    </TooltipTrigger>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" className="p-0 w-auto rounded-none border-[#d4d4d4] bg-white dark:bg-[#1b1b1b] dark:border-gray-700 shadow-md">
                    <NotificationTooltip notifications={notifications} totalUnread={totalUnread} getAvatarInitials={getAvatarInitials} getAvatarColor={getAvatarColor} formatTimestamp={formatTimestamp} onNotificationClick={handleNotificationClick} onMarkAllAsRead={handleMarkAllAsRead} onMarkContactAsRead={handleMarkContactAsRead} />
                  </PopoverContent>
                </Popover>
              ) : (
                <TooltipTrigger asChild>
                  <button className="p-1 hover:bg-gray-300 rounded relative">
                    <Bell className="w-4 h-4 text-black" />
                  </button>
                </TooltipTrigger>
              )}
              {isCollapsed && <TooltipContent side="right" className="bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md"><p>Notificações</p></TooltipContent>}
            </Tooltip>
          </TooltipProvider>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className={cn("flex-shrink-0 bg-primary", isCollapsed ? "p-1" : "p-2")}>
        <div className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-2")}>
          {isCollapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
                  <User className="w-4 h-4 text-black" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="z-50 bg-white border border-gray-300 shadow-md dark:bg-[#2d2d2d] dark:border-gray-600" side="right" align="end">
                {hasRole(['master']) && selectedWorkspace && (
                  <DropdownMenuItem onClick={handleBackToMasterDashboard} className="text-xs">
                    <ArrowLeft className="w-3 h-3 mr-2" />
                    Central Tezeus
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setIsPerfilModalOpen(true)} className="text-xs">
                  <User className="w-3 h-3 mr-2" />
                  Meu Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} className="text-xs text-red-600 focus:text-red-600">
                  <LogOut className="w-3 h-3 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-black" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-black truncate">{user?.name}</div>
                <div className="text-[10px] text-black truncate">{user?.email}</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 hover:bg-gray-100 rounded text-black">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="z-50 bg-white border border-gray-300 shadow-md dark:bg-[#2d2d2d] dark:border-gray-600" align="end">
                  {hasRole(['master']) && selectedWorkspace && (
                    <DropdownMenuItem onClick={handleBackToMasterDashboard} className="text-xs">
                      <ArrowLeft className="w-3 h-3 mr-2" />
                      Central Tezeus
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setIsPerfilModalOpen(true)} className="text-xs">
                    <User className="w-3 h-3 mr-2" />
                    Meu Perfil
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout} className="text-xs text-red-600 focus:text-red-600">
                    <LogOut className="w-3 h-3 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Modal Meu Perfil */}
      <MeuPerfilModal 
        isOpen={isPerfilModalOpen} 
        onClose={() => setIsPerfilModalOpen(false)} 
      />
    </div>
  );
}
