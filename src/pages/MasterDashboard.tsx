import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Settings, Home, Users, Building2, BarChart3, Settings2, BrainCircuit, LayoutDashboard, UserCircle, ListOrdered, LogOut, ArrowLeft, Edit, Trash2, Activity, Bell, AlertTriangle, Plus, Eye, EyeOff, MoreVertical, User, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useWorkspace, Workspace } from '@/contexts/WorkspaceContext';
import { WorkspaceCard } from '@/components/master/WorkspaceCard';
import { useAuth } from '@/hooks/useAuth';
import { DSAgenteMaster, type DSAgenteMasterRef } from '@/components/modules/master/DSAgenteMaster';
import { AutomacoesFilasMaster, type AutomacoesFilasMasterRef } from '@/components/modules/master/AutomacoesFilasMaster';
import { WhatsAppProvidersMaster } from '@/components/modules/master/WhatsAppProvidersMaster';
import { AdministracaoUsuarios, type AdministracaoUsuariosRef } from '@/components/modules/AdministracaoUsuarios';
import { AdministracaoConfiguracoes } from '@/components/modules/AdministracaoConfiguracoes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { WorkspaceUsersModal } from '@/components/modals/WorkspaceUsersModal';
import { WorkspaceConfigModal } from '@/components/modals/WorkspaceConfigModal';
import { CreateWorkspaceModal } from '@/components/modals/CreateWorkspaceModal';
import { ImportNegociosContatosModal } from '@/components/modals/ImportNegociosContatosModal';
import { supabase } from '@/integrations/supabase/client';
import { RelatoriosAvancados } from '@/components/relatorios-avancados/RelatoriosAvancados';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useSystemCustomizationContext } from "@/contexts/SystemCustomizationContext";
import { Switch } from "@/components/ui/switch";

export default function MasterDashboard() {
  const navigate = useNavigate();
  const { workspaces, isLoading, fetchWorkspaces, deleteWorkspace, toggleWorkspaceStatus, clearCache } = useWorkspaces();
  const { setSelectedWorkspace } = useWorkspace();
  const { userRole, logout, user } = useAuth();
  const { customization } = useSystemCustomizationContext();
  
  // Debug workspaces
  console.log('🔍 [MasterDashboard] workspaces data:', {
    count: workspaces.length,
    workspaces: workspaces,
    isLoading,
    firstWorkspace: workspaces[0]
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [activePage, setActivePage] = useState<'home' | 'users' | 'workspaces' | 'reports' | 'settings' | 'ds-agent' | 'filas' | 'usuarios' | 'configuracoes'>('workspaces');
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [selectedWorkspaceForModal, setSelectedWorkspaceForModal] = useState<Workspace | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedWorkspaceForConfig, setSelectedWorkspaceForConfig] = useState<Workspace | null>(null);
  const [createWorkspaceModalOpen, setCreateWorkspaceModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [toggleActiveDialogOpen, setToggleActiveDialogOpen] = useState(false);
  const [workspaceToToggle, setWorkspaceToToggle] = useState<Workspace | null>(null);
  const [toggleConfirmationText, setToggleConfirmationText] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const usuariosRef = useRef<AdministracaoUsuariosRef>(null);
  const filasRef = useRef<AutomacoesFilasMasterRef>(null);
  const agentesRef = useRef<DSAgenteMasterRef>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    setIsDarkMode(shouldUseDark);
    document.documentElement.classList.toggle('dark', shouldUseDark);
  }, []);

  const toggleDarkMode = (checked: boolean) => {
    setIsDarkMode(checked);
    if (checked) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Verificar se o usuário é realmente master
  if (userRole !== 'master') {
    navigate('/dashboard');
    return null;
  }

  // Filtrar workspaces com base na busca
  const filteredWorkspaces = useMemo(() => {
    if (!searchQuery.trim()) return workspaces;
    
    const query = searchQuery.toLowerCase();
    return workspaces.filter(w => 
      w.name.toLowerCase().includes(query) ||
      w.cnpj?.toLowerCase().includes(query)
    );
  }, [workspaces, searchQuery]);

  const handleLogin = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    localStorage.setItem('selectedWorkspace', JSON.stringify(workspace));
    navigate(`/workspace/${workspace.workspace_id}/dashboard`);
  };

  const handleViewUsers = (workspace: Workspace) => {
    setSelectedWorkspaceForModal(workspace);
    setUsersModalOpen(true);
  };

  const handleViewWorkspace = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    localStorage.setItem('selectedWorkspace', JSON.stringify(workspace));
    navigate(`/workspace/${workspace.workspace_id}/dashboard`);
  };

  const handleViewConfig = (workspace: Workspace) => {
    setSelectedWorkspaceForConfig(workspace);
    setConfigModalOpen(true);
  };

  const handleNavigateToAdminPage = (page: 'ds-agent' | 'filas' | 'usuarios' | 'configuracoes') => {
    setActivePage(page);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleEditWorkspace = async (workspace: Workspace) => {
    // Buscar connection limit e user limit para esta workspace
    const { data: limitData } = await supabase
      .from('workspace_limits')
      .select('connection_limit, user_limit')
      .eq('workspace_id', workspace.workspace_id)
      .single();
    
    setEditingWorkspace({
      ...workspace,
      connectionLimit: limitData?.connection_limit || 1,
      userLimit: limitData?.user_limit || 5
    });
    setCreateWorkspaceModalOpen(true);
  };

  const handleDeleteWorkspace = (workspace: Workspace) => {
    setWorkspaceToDelete(workspace);
    setDeleteDialogOpen(true);
    setDeleteConfirmationText(''); // Resetar o input de confirmação
  };

  const confirmDelete = async () => {
    if (workspaceToDelete) {
      try {
        setIsRefreshing(true);
        await deleteWorkspace(workspaceToDelete.workspace_id);
        setDeleteDialogOpen(false);
        setWorkspaceToDelete(null);
        
        // Limpar cache e atualizar lista
        clearCache?.();
        await fetchWorkspaces();
      } catch (error) {
        // Error handled in hook
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  const handleToggleActive = (workspace: Workspace) => {
    setWorkspaceToToggle(workspace);
    setToggleActiveDialogOpen(true);
    setToggleConfirmationText('');
  };

  const confirmToggleActive = async () => {
    if (!workspaceToToggle) return;
    
    setIsRefreshing(true);
    try {
      await toggleWorkspaceStatus(
        workspaceToToggle.workspace_id, 
        !(workspaceToToggle.is_active !== false)
      );
      setToggleActiveDialogOpen(false);
      setWorkspaceToToggle(null);
      setToggleConfirmationText('');
      
      // Refresh com delay
      setTimeout(async () => {
        clearCache?.();
        await fetchWorkspaces();
        setIsRefreshing(false);
      }, 500);
    } catch (error) {
      setIsRefreshing(false);
    }
  };

  const handleCreateModalClose = async (open: boolean) => {
    setCreateWorkspaceModalOpen(open);
    if (!open) {
      setEditingWorkspace(null);
      
      // Limpar cache e atualizar lista ao fechar modal
      setIsRefreshing(true);
      clearCache?.();
      await fetchWorkspaces();
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex fixed inset-0 dark:bg-[#040405]">
      {/* Sidebar */}
      <aside 
        data-sidebar 
        className={cn(
          "flex flex-col m-2 shadow-sm font-sans text-xs transition-all duration-300 ease-in-out relative",
          "bg-[#f0f0f0] border border-gray-300 dark:bg-[#1a1a1a] dark:border-gray-700",
          "w-52"
        )}
      >
        {/* Title Bar (Logo) */}
        <div className={cn(
          "flex-shrink-0 flex items-center bg-primary text-primary-foreground h-8 transition-all duration-300",
          "justify-between px-2"
        )}>
          {/* Logo ou Texto */}
          {customization.logo_url ? (
            <img 
              src={customization.logo_url} 
              alt="Logo" 
              className={cn(
                "object-contain transition-all duration-300", 
                "h-5"
              )} 
            />
          ) : (
            <h1 className={cn(
              "font-bold transition-all duration-300 truncate", 
              "text-[16px]"
            )}>
              TEZEUS
            </h1>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto">
          <button
            onClick={() => setActivePage('workspaces')}
            className={cn(
              "w-full flex items-center transition-all relative group border border-transparent outline-none",
              "gap-2 px-3 py-1.5",
              "text-sm font-medium rounded-none",
              activePage === 'workspaces'
                ? "bg-[#FEF3C7] border-gray-300 text-black font-bold shadow-sm z-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                : "text-gray-700 hover:bg-[#e1e1e1] hover:border-gray-300 hover:z-10 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:border-gray-600"
            )}
          >
            <Building2 className={cn(
              "transition-all duration-300 w-3.5 h-3.5",
              activePage === 'workspaces' ? "text-black dark:text-white" : "text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200"
            )} />
            <span className="truncate">Empresas</span>
          </button>
          
          <button
            onClick={() => setActivePage('reports')}
            className={cn(
              "w-full flex items-center transition-all relative group border border-transparent outline-none",
              "gap-2 px-3 py-1.5",
              "text-sm font-medium rounded-none",
              activePage === 'reports'
                ? "bg-[#FEF3C7] border-gray-300 text-black font-bold shadow-sm z-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                : "text-gray-700 hover:bg-[#e1e1e1] hover:border-gray-300 hover:z-10 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:border-gray-600"
            )}
          >
            <BarChart3 className={cn(
              "transition-all duration-300 w-3.5 h-3.5",
              activePage === 'reports' ? "text-black dark:text-white" : "text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200"
            )} />
            <span className="truncate">Relatórios</span>
          </button>
          
          <button
            onClick={() => setActivePage('usuarios')}
            className={cn(
              "w-full flex items-center transition-all relative group border border-transparent outline-none",
              "gap-2 px-3 py-1.5",
              "text-sm font-medium rounded-none",
              activePage === 'usuarios'
                ? "bg-[#FEF3C7] border-gray-300 text-black font-bold shadow-sm z-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                : "text-gray-700 hover:bg-[#e1e1e1] hover:border-gray-300 hover:z-10 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:border-gray-600"
            )}
          >
            <UserCircle className={cn(
              "transition-all duration-300 w-3.5 h-3.5",
              activePage === 'usuarios' ? "text-black dark:text-white" : "text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200"
            )} />
            <span className="truncate">Usuários</span>
          </button>
          
          <button
            onClick={() => setActivePage('ds-agent')}
            className={cn(
              "w-full flex items-center transition-all relative group border border-transparent outline-none",
              "gap-2 px-3 py-1.5",
              "text-sm font-medium rounded-none",
              activePage === 'ds-agent'
                ? "bg-[#FEF3C7] border-gray-300 text-black font-bold shadow-sm z-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                : "text-gray-700 hover:bg-[#e1e1e1] hover:border-gray-300 hover:z-10 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:border-gray-600"
            )}
          >
            <BrainCircuit className={cn(
              "transition-all duration-300 w-3.5 h-3.5",
              activePage === 'ds-agent' ? "text-black dark:text-white" : "text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200"
            )} />
            <span className="truncate">Agentes de IA</span>
          </button>
          
          <button
            onClick={() => setActivePage('filas')}
            className={cn(
              "w-full flex items-center transition-all relative group border border-transparent outline-none",
              "gap-2 px-3 py-1.5",
              "text-sm font-medium rounded-none",
              activePage === 'filas'
                ? "bg-[#FEF3C7] border-gray-300 text-black font-bold shadow-sm z-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                : "text-gray-700 hover:bg-[#e1e1e1] hover:border-gray-300 hover:z-10 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:border-gray-600"
            )}
          >
            <ListOrdered className={cn(
              "transition-all duration-300 w-3.5 h-3.5",
              activePage === 'filas' ? "text-black dark:text-white" : "text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200"
            )} />
            <span className="truncate">Filas</span>
          </button>
          
          <button
            onClick={() => setActivePage('configuracoes')}
            className={cn(
              "w-full flex items-center transition-all relative group border border-transparent outline-none",
              "gap-2 px-3 py-1.5",
              "text-sm font-medium rounded-none",
              activePage === 'configuracoes'
                ? "bg-[#FEF3C7] border-gray-300 text-black font-bold shadow-sm z-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                : "text-gray-700 hover:bg-[#e1e1e1] hover:border-gray-300 hover:z-10 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:border-gray-600"
            )}
          >
            <Settings2 className={cn(
              "transition-all duration-300 w-3.5 h-3.5",
              activePage === 'configuracoes' ? "text-black dark:text-white" : "text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200"
            )} />
            <span className="truncate">Configurações</span>
          </button>
        </nav>

        <div className="border-t border-gray-300 bg-white dark:border-gray-700 dark:bg-[#1a1a1a] px-2 py-2 flex items-center justify-between text-xs">
          <span className="text-gray-700 dark:text-gray-300 font-medium">Modo escuro</span>
          <Switch
            checked={isDarkMode}
            onCheckedChange={toggleDarkMode}
            className="scale-75 data-[state=checked]:bg-primary dark:bg-gray-600"
          />
        </div>

        {/* User Info */}
        <div className={cn("flex-shrink-0 border-t border-gray-300 bg-white dark:border-gray-700 dark:bg-[#1a1a1a]", "p-2")}>
          <div className={cn("flex items-center", "gap-2")}>
            <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center border border-gray-300 flex-shrink-0 dark:bg-gray-700 dark:border-gray-600">
              <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-800 truncate dark:text-gray-200">{user?.name}</div>
              <div className="text-[10px] text-gray-500 truncate dark:text-gray-400">{user?.email}</div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 hover:bg-gray-100 rounded text-gray-500 dark:hover:bg-gray-700 dark:text-gray-400">
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="z-50 bg-white border border-gray-300 shadow-md dark:bg-[#2d2d2d] dark:border-gray-600" align="end">
                <DropdownMenuItem onClick={handleLogout} className="text-xs text-red-600 focus:text-red-600">
                  <LogOut className="w-3 h-3 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Excel-style Toolbar - aba Empresas */}
        {activePage === 'workspaces' && (
          <div className="bg-[#f3f3f3] border-b border-[#d4d4d4] px-3 py-1.5 shrink-0 dark:bg-[#0f0f0f] dark:border-gray-700">
            <div className="flex w-full items-center gap-2">
              {/* Nova Empresa Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCreateWorkspaceModalOpen(true)}
                className="h-7 w-7 rounded-none hover:bg-gray-200 text-gray-700 border border-transparent hover:border-gray-300 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:border-gray-600"
                title="Nova Empresa"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>

              <div className="h-4 w-px bg-gray-300 mx-1" />

              {/* Search Input */}
              <div className="relative flex-1 min-w-[150px] max-w-xs">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400 dark:text-gray-500" />
                <Input
                  type="text"
                  placeholder="Buscar empresas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 h-7 text-xs bg-white border-gray-300 rounded-none focus-visible:ring-1 focus-visible:ring-primary dark:bg-[#1a1a1a] dark:border-gray-600 dark:text-gray-100"
                />
              </div>

              <div className="flex-1" />

              {/* Title */}
              <span className="text-xs font-semibold text-gray-700">
                Workspaces do Master
              </span>
            </div>
          </div>
        )}

        {/* Excel-style Toolbar - aba Usuários */}
        {activePage === 'usuarios' && (
          <div className="bg-[#f3f3f3] border-b border-[#d4d4d4] px-3 py-1.5 shrink-0 dark:bg-[#0f0f0f] dark:border-gray-700">
            <div className="flex w-full items-center gap-2">
              {/* Adicionar Usuário Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => usuariosRef.current?.handleAddUser()}
                className="h-7 w-7 rounded-none hover:bg-gray-200 text-gray-700 border border-transparent hover:border-gray-300"
                title="Adicionar usuário"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>

              <div className="h-4 w-px bg-gray-300 mx-1" />

              {/* Gerenciar Cargos Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => usuariosRef.current?.handleGerenciarCargos()}
                className="h-7 px-2 text-xs rounded-none hover:bg-gray-200 text-gray-700 border border-transparent hover:border-gray-300"
                title="Gerenciar cargos"
              >
                <Settings className="h-3.5 w-3.5 mr-1" />
                Gerenciar cargos
              </Button>

              <div className="h-4 w-px bg-gray-300 mx-1" />

              {/* Search Input */}
              <div className="relative flex-1 min-w-[150px] max-w-xs">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400 dark:text-gray-500" />
                <Input
                  type="text"
                  placeholder="Buscar usuários..."
                  value={userSearchQuery}
                  onChange={(e) => {
                    setUserSearchQuery(e.target.value);
                    usuariosRef.current?.setSearchTerm(e.target.value);
                  }}
                  className="pl-7 h-7 text-xs bg-white border-gray-300 rounded-none focus-visible:ring-1 focus-visible:ring-primary dark:bg-[#1a1a1a] dark:border-gray-600 dark:text-gray-100"
                />
              </div>

              <div className="flex-1" />

              {/* Title */}
              <span className="text-xs font-semibold text-gray-700">
                Usuários do Sistema
              </span>
            </div>
          </div>
        )}

        {/* Excel-style Toolbar - aba Filas */}
        {activePage === 'filas' && (
          <div className="bg-[#f3f3f3] border-b border-[#d4d4d4] px-3 py-1.5 shrink-0 dark:bg-[#0f0f0f] dark:border-gray-700">
            <div className="flex w-full items-center gap-2">
              {/* Adicionar Fila Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => filasRef.current?.handleAddFila()}
                className="h-7 w-7 rounded-none hover:bg-gray-200 text-gray-700 border border-transparent hover:border-gray-300"
                title="Adicionar fila"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>

              <div className="flex-1" />

              {/* Title */}
              <span className="text-xs font-semibold text-gray-700">
                Filas do Sistema
              </span>
            </div>
          </div>
        )}

        {/* Excel-style Toolbar - aba Agentes de IA */}
        {activePage === 'ds-agent' && (
          <div className="bg-[#f3f3f3] border-b border-[#d4d4d4] px-3 py-1.5 shrink-0 dark:bg-[#0f0f0f] dark:border-gray-700">
            <div className="flex w-full items-center gap-2">
              {/* Adicionar Agente Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => agentesRef.current?.handleAddAgent()}
                className="h-7 w-7 rounded-none hover:bg-gray-200 text-gray-700 border border-transparent hover:border-gray-300"
                title="Adicionar agente"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>

              <div className="flex-1" />

              {/* Title */}
              <span className="text-xs font-semibold text-gray-700">
                Agentes de IA
              </span>
            </div>
          </div>
        )}

        {/* Content Area */}
        <main className={`flex-1 ${activePage === 'reports' ? 'overflow-hidden flex flex-col' : activePage === 'workspaces' || activePage === 'usuarios' || activePage === 'filas' || activePage === 'configuracoes' || activePage === 'ds-agent' ? 'overflow-hidden flex flex-col bg-white dark:bg-[#050505]' : 'p-6 overflow-auto'}`}>
          {activePage === 'workspaces' ? (
            <div className="h-full flex flex-col">
              {/* Excel-style Table */}
              <div className="flex-1 overflow-auto p-4">
                {isLoading || isRefreshing ? (
                  <div className="bg-white border border-[#d4d4d4] shadow-sm dark:bg-[#111111] dark:border-gray-700">
                    <div className="grid grid-cols-7 bg-[#f3f3f3] border-b border-[#d4d4d4] dark:bg-[#161616] dark:border-gray-700">
                      {['Nome', 'Status', 'Conexões', 'Usuários', 'Negócios', 'Criado em', 'Ações'].map((header) => (
                        <div key={header} className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] last:border-r-0 dark:text-gray-200 dark:border-gray-700">
                          {header}
                        </div>
                      ))}
                    </div>
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="grid grid-cols-7 border-b border-[#d4d4d4] animate-pulse dark:border-gray-700">
                        {[...Array(7)].map((_, j) => (
                          <div key={j} className="px-3 py-2.5 border-r border-[#d4d4d4] last:border-r-0 dark:border-gray-700">
                            <div className="h-4 bg-gray-200 rounded dark:bg-gray-800" />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : filteredWorkspaces.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 bg-white border-2 border-dashed border-[#d4d4d4] dark:bg-[#111111] dark:border-gray-700">
                    <Building2 className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2 dark:text-gray-100">Nenhuma empresa encontrada</h3>
                    <p className="text-gray-500 mb-4 dark:text-gray-400">
                      {searchQuery ? "Tente uma busca diferente" : "Comece criando uma nova empresa"}
                    </p>
                    {!searchQuery && (
                      <Button 
                        onClick={() => setCreateWorkspaceModalOpen(true)}
                        className="h-7 px-3 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Nova Empresa
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="bg-white border border-[#d4d4d4] shadow-sm dark:bg-[#111111] dark:border-gray-700">
                    {/* Table Header */}
                    <div className="grid grid-cols-7 bg-[#f3f3f3] border-b border-[#d4d4d4] sticky top-0 z-10 dark:bg-[#161616] dark:border-gray-700">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] dark:text-gray-200 dark:border-gray-700">
                        Nome
                      </div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] dark:text-gray-200 dark:border-gray-700">
                        Status
                      </div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] dark:text-gray-200 dark:border-gray-700">
                        Conexões
                      </div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] dark:text-gray-200 dark:border-gray-700">
                        Usuários
                      </div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] dark:text-gray-200 dark:border-gray-700">
                        Negócios
                      </div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] dark:text-gray-200 dark:border-gray-700">
                        Criado em
                      </div>
                      <div className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
                        Ações
                      </div>
                    </div>

                    {/* Table Body */}
                    {filteredWorkspaces.map((workspace) => (
                      <div
                        key={workspace.workspace_id}
                        className="grid grid-cols-7 border-b border-[#d4d4d4] hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-900/60"
                      >
                        {/* Nome */}
                        <div className="px-3 py-2.5 text-xs border-r border-[#d4d4d4] flex items-center gap-2 dark:border-gray-700 dark:text-gray-100">
                          <Building2 className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                          <span className="font-medium">{workspace.name}</span>
                        </div>

                        {/* Status */}
                        <div className="px-3 py-2.5 text-xs border-r border-[#d4d4d4] flex items-center dark:border-gray-700 dark:text-gray-100">
                          <Badge 
                            variant={workspace.is_active ? "default" : "secondary"}
                            className="text-[10px] px-1.5 py-0 h-5 dark:bg-green-600 dark:text-white"
                          >
                            {workspace.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>

                        {/* Conexões */}
                        <div className="px-3 py-2.5 text-xs border-r border-[#d4d4d4] dark:border-gray-700 dark:text-gray-200">
                          {workspace.connections_count || 0}
                        </div>

                        {/* Usuários */}
                        <div className="px-3 py-2.5 text-xs border-r border-[#d4d4d4] dark:border-gray-700">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewUsers(workspace)}
                            className="h-5 px-2 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-800 dark:text-gray-100"
                          >
                            <Users className="h-3 w-3 mr-1" />
                            Ver
                          </Button>
                        </div>

                        {/* Negócios */}
                        <div className="px-3 py-2.5 text-xs border-r border-[#d4d4d4] dark:border-gray-700 dark:text-gray-200">
                          {workspace.deals_count || 0}
                        </div>

                        {/* Criado em */}
                        <div className="px-3 py-2.5 text-xs text-gray-500 border-r border-[#d4d4d4] dark:text-gray-400 dark:border-gray-700">
                          {formatDistanceToNow(new Date(workspace.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </div>

                        {/* Ações */}
                        <div className="px-3 py-2.5 text-xs flex items-center gap-1 dark:text-gray-200">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLogin(workspace)}
                            className="h-6 px-2 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-800"
                            title="Entrar na empresa"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewConfig(workspace)}
                            className="h-6 px-2 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-800"
                            title="Configurações"
                          >
                            <Settings className="h-3 w-3" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-800"
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="z-50 min-w-[8rem] rounded-md border border-gray-200 bg-white p-1 text-gray-800 shadow-md dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-100"
                            >
                              <DropdownMenuItem
                                onClick={() => handleEditWorkspace(workspace)}
                                className="text-xs dark:focus:bg-gray-800"
                              >
                                <Edit className="mr-2 h-3.5 w-3.5" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggleActive(workspace)}
                                className="text-xs dark:focus:bg-gray-800"
                              >
                                {workspace.is_active ? (
                                  <>
                                    <EyeOff className="mr-2 h-3.5 w-3.5" />
                                    Desativar
                                  </>
                                ) : (
                                  <>
                                    <Eye className="mr-2 h-3.5 w-3.5" />
                                    Ativar
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setWorkspaceForImport(workspace);
                                  setImportModalOpen(true);
                                }}
                                className="text-xs dark:focus:bg-gray-800"
                              >
                                <Upload className="mr-2 h-3.5 w-3.5" />
                                Importar Negócios
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteWorkspace(workspace)}
                                className="text-destructive text-xs dark:text-red-400 dark:focus:bg-gray-800"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : activePage === 'reports' ? (
            <RelatoriosAvancados workspaces={workspaces} />
          ) : activePage === 'ds-agent' ? (
            <div className="h-full flex flex-col">
              <DSAgenteMaster ref={agentesRef} />
            </div>
          ) : activePage === 'filas' ? (
            <div className="h-full flex flex-col">
              <AutomacoesFilasMaster ref={filasRef} />
            </div>
          ) : activePage === 'usuarios' ? (
            <div className="h-full flex flex-col">
              <AdministracaoUsuarios ref={usuariosRef} />
            </div>
          )  : activePage === 'configuracoes' ? (
            <div className="h-full flex flex-col overflow-auto p-4">
              <AdministracaoConfiguracoes />
            </div>
          ) : null}
        </main>

        {/* Footer */}
        <footer className="bg-card border-t border-border px-6 py-3 dark:bg-[#0b0b0b] dark:border-gray-700">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tezeus CRM – Usuário Interno</span>
            <span>Versão 1.0.0</span>
          </div>
        </footer>
      </div>

      {/* Modal de Importação */}
      {workspaceForImport && (
        <ImportNegociosContatosModal
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          workspaceId={workspaceForImport.workspace_id}
          workspaceName={workspaceForImport.name}
        />
      )}

      {/* Modal de Usuários */}
      {selectedWorkspaceForModal && (
        <WorkspaceUsersModal
          open={usersModalOpen}
          onOpenChange={setUsersModalOpen}
          workspaceId={selectedWorkspaceForModal.workspace_id}
          workspaceName={selectedWorkspaceForModal.name}
        />
      )}

      {/* Modal de Configurações */}
      {selectedWorkspaceForConfig && (
        <WorkspaceConfigModal
          open={configModalOpen}
          onOpenChange={setConfigModalOpen}
          workspaceId={selectedWorkspaceForConfig.workspace_id}
          workspaceName={selectedWorkspaceForConfig.name}
        />
      )}

      {/* Modal de Criar/Editar Empresa */}
      <CreateWorkspaceModal 
        open={createWorkspaceModalOpen} 
        onOpenChange={handleCreateModalClose}
        workspace={editingWorkspace ? {
          workspace_id: editingWorkspace.workspace_id,
          name: editingWorkspace.name,
          cnpj: editingWorkspace.cnpj,
          connectionLimit: (editingWorkspace as any).connectionLimit || 1
        } : undefined}
      />

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog 
        open={deleteDialogOpen} 
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setDeleteConfirmationText('');
            setWorkspaceToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Confirmar exclusão da empresa</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Tem certeza que deseja excluir a empresa <strong>"{workspaceToDelete?.name}"</strong>?
              </p>
              <p className="text-destructive font-semibold">
                Esta ação não pode ser desfeita e irá deletar permanentemente TODOS os dados relacionados: conversas, contatos, conexões, configurações, tags, etc.
              </p>
              <div className="space-y-2">
                <Label htmlFor="delete-confirmation">
                  Para confirmar, digite <strong>"excluir empresa"</strong> no campo abaixo:
                </Label>
                <Input
                  id="delete-confirmation"
                  type="text"
                  placeholder="Digite 'excluir empresa' para confirmar"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  autoComplete="off"
                  className="border-destructive focus-visible:ring-destructive"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              disabled={deleteConfirmationText !== 'excluir empresa'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Excluir Empresa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert Dialog de Inativar/Ativar */}
      <AlertDialog
        open={toggleActiveDialogOpen}
        onOpenChange={(open) => {
          setToggleActiveDialogOpen(open);
          if (!open) {
            setToggleConfirmationText('');
            setWorkspaceToToggle(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {workspaceToToggle?.is_active !== false ? '⚠️ Inativar Empresa' : '✅ Ativar Empresa'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Tem certeza que deseja <strong>{workspaceToToggle?.is_active !== false ? 'inativar' : 'ativar'}</strong> a empresa{' '}
                <strong>"{workspaceToToggle?.name}"</strong>?
              </p>
              {workspaceToToggle?.is_active !== false && (
                <>
                  <p className="text-orange-600 font-semibold">
                    Ao inativar a empresa:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Todos os usuários (exceto masters) serão deslogados imediatamente</li>
                    <li>Todas as instâncias WhatsApp serão desconectadas</li>
                    <li>Novos logins serão bloqueados</li>
                    <li>Os dados permanecerão intactos</li>
                    <li>Você pode reativar a empresa a qualquer momento</li>
                  </ul>
                  <div className="space-y-2">
                    <Label htmlFor="toggle-confirmation">
                      Para confirmar, digite <strong>"inativar empresa"</strong> no campo abaixo:
                    </Label>
                    <Input
                      id="toggle-confirmation"
                      type="text"
                      placeholder="Digite 'inativar empresa' para confirmar"
                      value={toggleConfirmationText}
                      onChange={(e) => setToggleConfirmationText(e.target.value)}
                      autoComplete="off"
                      className="border-orange-500 focus-visible:ring-orange-500"
                    />
                  </div>
                </>
              )}
              {workspaceToToggle?.is_active === false && (
                <p className="text-green-600 font-semibold">
                  A empresa será reativada e os usuários poderão fazer login normalmente.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleActive}
              disabled={workspaceToToggle?.is_active !== false && toggleConfirmationText !== 'inativar empresa'}
              className={
                workspaceToToggle?.is_active !== false
                  ? 'bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }
            >
              {workspaceToToggle?.is_active !== false ? 'Inativar Empresa' : 'Ativar Empresa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
