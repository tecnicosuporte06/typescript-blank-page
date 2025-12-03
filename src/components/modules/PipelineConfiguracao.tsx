import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Palette } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePipelinesContext } from "@/contexts/PipelinesContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWorkspaceHeaders } from "@/lib/workspaceHeaders";
import { DeletarPipelineModal } from "@/components/modals/DeletarPipelineModal";

interface PipelineConfigProps {
  isDarkMode?: boolean;
  onColumnsReorder?: (newOrder: any[]) => void;
}

interface Action {
  id: string;
  actionName: string;
  nextPipeline: string;
  targetColumn: string;
  dealState: string;
  buttonColor?: string;
}

// Inicializar sem ações - só aparecerá quando clicar em "Nova ação"
const initialActions: Action[] = [];

export default function PipelineConfiguracao({
  isDarkMode,
  onColumnsReorder
}: PipelineConfigProps) {
  const [activeTab, setActiveTab] = useState('geral');
  const [actions, setActions] = useState<Action[]>(initialActions);
  const [actionColumns, setActionColumns] = useState<{[key: string]: any[]}>({});
  const { getHeaders } = useWorkspaceHeaders();
  const [isDeletePipelineModalOpen, setIsDeletePipelineModalOpen] = useState(false);
  const [isDeletingPipeline, setIsDeletingPipeline] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const {
    columns,
    selectedPipeline,
    reorderColumns,
    pipelines,
    isLoadingColumns: contextIsLoadingColumns,
    selectPipeline,
    refreshCurrentPipeline,
    deletePipeline
  } = usePipelinesContext();
  const {
    user,
    userRole
  } = useAuth();
  const {
    selectedWorkspace
  } = useWorkspace();
  const { toast } = useToast();
  const [pipelineName, setPipelineName] = useState(selectedPipeline?.name || "Vendas");
  const [currency, setCurrency] = useState("brl");
  const [selectedColumn, setSelectedColumn] = useState("qualificar");
  const [selectedAutomation, setSelectedAutomation] = useState("");
  const canConfigureOpenStatus = userRole === 'master' || userRole === 'admin';

  const handleDeletePipeline = async () => {
    if (!selectedPipeline) return;
    
    setIsDeletingPipeline(true);
    
    try {
      await deletePipeline(selectedPipeline.id);
      setIsDeletePipelineModalOpen(false);
      
      toast({
        title: "Pipeline excluído",
        description: "O pipeline foi excluído com sucesso.",
      });
      
    } catch (error: any) {
      console.error('❌ Erro ao deletar pipeline:', error);
      toast({
        title: "Erro ao excluir pipeline",
        description: error.message || "Ocorreu um erro ao tentar excluir o pipeline.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingPipeline(false);
    }
  };

  const deleteColumn = async (columnId: string) => {
    try {
      console.log('🗑️ Deleting column:', columnId);
      
      const { data, error } = await supabase.functions.invoke(`pipeline-management/columns?id=${columnId}`, {
        method: 'DELETE',
        headers: {
          'x-system-user-id': user?.id || '',
          'x-system-user-email': user?.email || '',
          'x-workspace-id': selectedWorkspace?.workspace_id || ''
        }
      });

      if (error) throw error;

      console.log('✅ Column deleted successfully');
      
      toast({
        title: "Sucesso",
        description: "Coluna excluída com sucesso",
      });

      // O realtime já vai atualizar automaticamente, mas forçar refresh para garantir
      await refreshCurrentPipeline();
      
    } catch (error: any) {
      console.error('❌ Error deleting column:', error);
      
      // Show user-friendly error message
      if (error.message?.includes('existing cards')) {
        toast({
          title: "Erro ao excluir coluna",
          description: "Não é possível excluir uma coluna que contém cards. Mova os cards para outra coluna primeiro.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao excluir coluna",
          description: "Ocorreu um erro ao tentar excluir a coluna. Tente novamente.",
          variant: "destructive",
        });
      }
    }
  };
  
  // Carregar ações salvas quando selecionar um pipeline
  useEffect(() => {
    if (selectedPipeline?.id) {
      loadPipelineActions(selectedPipeline.id);
    }
  }, [selectedPipeline?.id]);

  const loadPipelineActions = async (pipelineId: string) => {
    try {
      console.log('📥 Carregando ações para pipeline:', pipelineId);
      
      const headers = getHeaders();
      const { data, error } = await supabase.functions.invoke(
        `pipeline-management/actions?pipeline_id=${pipelineId}`,
        {
          method: 'GET',
          headers
        }
      );

      if (error) {
        console.error('❌ Erro ao carregar ações:', error);
        throw error;
      }

      console.log('📦 Ações carregadas do banco:', data);

      if (data && data.length > 0) {
        // Calcular ações formatadas usando o estado atual
        setActions(prevActions => {
          const prevActionsMap = new Map(prevActions.map(a => [a.id, a]));
          
          const formattedActions: Action[] = data.map(action => {
            const existingAction = prevActionsMap.get(action.id);
            
            // Pegar a cor EXATAMENTE como está no banco de dados
            // Não usar fallback - se não tem cor salva, deixar undefined
            let buttonColor: string | undefined = undefined;
            
            // Verificar se button_color existe no objeto retornado do banco
            const dbColor = action.button_color || action.buttonColor;
            
            if (dbColor && typeof dbColor === 'string' && dbColor.trim() !== '') {
              // Se o banco tem uma cor salva válida, usar ela EXATAMENTE como está
              buttonColor = dbColor.trim();
              console.log(`✅ COR DO BANCO para ação ${action.id}:`, buttonColor);
            } else if (existingAction && existingAction.id.startsWith('temp-')) {
              // Só usar valor local se é uma ação temporária ainda não salva
              buttonColor = existingAction.buttonColor;
              console.log(`⚠️ Ação temporária ${action.id}, usando cor local:`, buttonColor);
            } else {
              // Se não tem cor no banco e não é temporária, deixar undefined (sem cor)
              console.log(`ℹ️ Ação ${action.id} sem cor no banco. Dados recebidos:`, {
                button_color: action.button_color,
                buttonColor: action.buttonColor,
                action_completa: JSON.stringify(action, null, 2)
              });
            }
            
            return {
              id: action.id,
              actionName: action.action_name,
              nextPipeline: action.target_pipeline_id,
              targetColumn: action.target_column_id,
              dealState: action.deal_state,
              buttonColor: buttonColor // Usar exatamente o que veio do banco ou undefined
            };
          });
          
          // Adicionar ações temporárias que ainda não foram salvas
          const tempActions = prevActions.filter(a => a.id.startsWith('temp-'));
          const finalActions = [...formattedActions, ...tempActions];
          
          console.log('✅ Ações formatadas:', finalActions);
          
          // Carregar colunas para cada ação que já tem pipeline selecionado
          formattedActions.forEach(action => {
            if (action.nextPipeline) {
              fetchPipelineColumns(action.nextPipeline).then(columns => {
                setActionColumns(prev => ({
                  ...prev,
                  [action.id]: columns
                }));
              }).catch(error => {
                console.error(`Erro ao carregar colunas para ação ${action.id}:`, error);
              });
            }
          });
          
          return finalActions;
        });
      } else {
        console.log('⚠️ Nenhuma ação encontrada, usando ações iniciais');
        setActions(initialActions);
      }
    } catch (error) {
      console.error('❌ Error loading pipeline actions:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as ações do pipeline.",
        variant: "destructive",
      });
      setActions(initialActions);
    }
  };

  const addNewAction = () => {
    const newAction: Action = {
      id: `temp-${Date.now()}`,
      actionName: "",
      nextPipeline: "",
      targetColumn: "",
      dealState: "",
      buttonColor: undefined // Sem cor padrão - usuário escolhe
    };
    setActions([...actions, newAction]);
  };

  const updateAction = (id: string, field: keyof Action, value: string) => {
    console.log('🔄 updateAction chamado:', { id, field, value });
    setActions(prevActions => {
      const newActions = prevActions.map(action => action.id === id ? {
        ...action,
        [field]: value
      } : action);
      console.log('✅ Novo estado actions:', newActions);
      return newActions;
    });
  };

  const saveAction = async (action: Action) => {
    console.log('💾 saveAction chamado com:', action);
    console.log('📊 Pipeline selecionado:', selectedPipeline);
    console.log('👤 Usuário:', { id: user?.id, email: user?.email });
    console.log('🏢 Workspace:', selectedWorkspace?.workspace_id);
    
    if (!selectedPipeline?.id) {
      console.error('❌ Nenhum pipeline selecionado!');
      return;
    }

    if (!user?.id || !user?.email) {
      console.error('❌ Usuário não autenticado!');
      toast({
        title: "Erro de autenticação",
        description: "Você precisa estar autenticado para salvar ações.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedWorkspace?.workspace_id) {
      console.error('❌ Nenhum workspace selecionado!');
      toast({
        title: "Erro",
        description: "Nenhum workspace selecionado.",
        variant: "destructive",
      });
      return;
    }
    
    if (!action.actionName || !action.nextPipeline || !action.targetColumn || !action.dealState) {
      console.log('❌ Campos faltando:', {
        actionName: action.actionName,
        nextPipeline: action.nextPipeline,
        targetColumn: action.targetColumn,
        dealState: action.dealState
      });
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Configurar contexto do usuário primeiro
      const { error: contextError } = await supabase.rpc('set_current_user_context', {
        user_id: user.id,
        user_email: user.email
      });

      if (contextError) {
        console.error('❌ Erro ao configurar contexto:', contextError);
        throw new Error('Falha ao configurar contexto do usuário');
      }

      console.log('✅ Contexto do usuário configurado');

      const actionData = {
        pipeline_id: selectedPipeline.id,
        action_name: action.actionName,
        target_pipeline_id: action.nextPipeline,
        target_column_id: action.targetColumn,
        deal_state: action.dealState,
        button_color: action.buttonColor || null, // Enviar exatamente o que tem, sem fallback
        order_position: actions.indexOf(action)
      };
      
      console.log('📤 Dados que serão enviados:', actionData);
      console.log('🎨 buttonColor da ação:', action.buttonColor, '→ será salvo como:', actionData.button_color);

      if (action.id.startsWith('temp-')) {
        // Criar nova ação
        const headers = getHeaders();
        const { data, error } = await supabase.functions.invoke(
          'pipeline-management/actions',
          {
            method: 'POST',
            headers,
            body: actionData
          }
        );

        if (error) {
          console.error('❌ Erro ao criar ação:', error);
          throw error;
        }

        console.log('✅ Ação criada com sucesso:', data);
        console.log('🎨 Cor retornada pela API:', data?.button_color || data?.buttonColor);

        // Atualizar apenas a ação criada no estado local, preservando as outras
        // Usar a cor retornada pela API se disponível, senão usar a cor local (sem fallback azul)
        const savedColor = data?.button_color || data?.buttonColor || action.buttonColor || undefined;
        
        setActions(prevActions => prevActions.map(a => 
          a.id === action.id 
            ? {
                ...a,
                id: data.id, // Atualizar com o ID real do banco
                buttonColor: savedColor // Usar cor retornada pela API ou preservar a escolhida
              }
            : a // Manter outras ações intactas
        ));

        // Carregar colunas se necessário
        if (action.nextPipeline) {
          const columns = await fetchPipelineColumns(action.nextPipeline);
          setActionColumns(prev => ({
            ...prev,
            [data.id]: columns
          }));
        }

        toast({
          title: "Ação salva",
          description: "A ação foi criada com sucesso.",
        });
      } else {
        // Atualizar ação existente
        const headers = getHeaders();
        const { data, error } = await supabase.functions.invoke(
          `pipeline-management/actions?id=${action.id}`,
          {
            method: 'PUT',
            headers,
            body: actionData
          }
        );

        if (error) {
          console.error('❌ Erro ao atualizar ação:', error);
          throw error;
        }

        console.log('✅ Ação atualizada com sucesso');
        console.log('🎨 Dados retornados pela API:', data);
        console.log('🎨 Cor retornada pela API:', data?.button_color || data?.buttonColor);

        // Usar a cor retornada pela API se disponível, senão usar a cor local (sem fallback azul)
        const savedColor = data?.button_color || data?.buttonColor || action.buttonColor || undefined;

        // Atualizar apenas a ação específica no estado local, preservando as outras
        setActions(prevActions => prevActions.map(a => 
          a.id === action.id 
            ? {
                ...a,
                ...action, // Preservar todos os valores locais
                buttonColor: savedColor // Usar cor retornada pela API ou preservar a escolhida
              }
            : a // Manter outras ações intactas com suas cores
        ));

        toast({
          title: "Ação atualizada",
          description: "A ação foi atualizada com sucesso.",
        });
      }
    } catch (error: any) {
      console.error('❌ Error saving action:', error);
      toast({
        title: "Erro ao salvar ação",
        description: error.message || "Não foi possível salvar a ação. Verifique suas permissões.",
        variant: "destructive",
      });
    }
  };

  const deleteAction = async (actionId: string) => {
    try {
      if (!actionId.startsWith('temp-')) {
        const headers = getHeaders();
        const { error } = await supabase.functions.invoke(
          `pipeline-management/actions?id=${actionId}`,
          {
            method: 'DELETE',
            headers
          }
        );

        if (error) throw error;
      }

      setActions(prev => prev.filter(a => a.id !== actionId));
      
      toast({
        title: "Ação removida",
        description: "A ação foi removida com sucesso.",
      });
    } catch (error) {
      console.error('Error deleting action:', error);
      toast({
        title: "Erro",
        description: "Não foi possível remover a ação.",
        variant: "destructive",
      });
    }
  };

  // Buscar colunas do pipeline selecionado
  const fetchPipelineColumns = async (pipelineId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke(`pipeline-management/columns?pipeline_id=${pipelineId}`, {
        method: 'GET',
        headers: {
          'x-system-user-id': user?.id || '',
          'x-system-user-email': user?.email || '',
          'x-workspace-id': selectedWorkspace?.workspace_id || ''
        }
      });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching pipeline columns:', error);
      return [];
    }
  };

  // Quando um pipeline for selecionado, buscar suas colunas
  const handlePipelineChange = async (actionId: string, pipelineId: string) => {
    console.log('🎯 handlePipelineChange chamado:', { actionId, pipelineId });
    console.log('📊 Estado actions antes:', actions);
    
    updateAction(actionId, 'nextPipeline', pipelineId);
    updateAction(actionId, 'targetColumn', ''); // Reset coluna selecionada
    
    console.log('📊 Estado actions depois updateAction:', actions);
    
    const columns = await fetchPipelineColumns(pipelineId);
    console.log('📋 Colunas carregadas:', columns);
    
    setActionColumns(prev => ({
      ...prev,
      [actionId]: columns
    }));
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex flex-col h-full bg-white border border-gray-300 m-2 shadow-sm font-sans text-sm dark:bg-[#0f0f0f] dark:border-gray-700 dark:text-gray-100"
    >
      <div className="flex flex-col border-b border-gray-300 bg-[#f8f9fa] dark:border-gray-700 dark:bg-[#141414]">
        <div className="flex items-center justify-between px-4 py-2 bg-primary text-primary-foreground h-10">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight">Configuração de Pipeline</span>
          </div>
          <span className="text-[10px] opacity-80">
            {selectedPipeline ? selectedPipeline.name : "Selecione um pipeline"}
          </span>
        </div>
        <TabsList className="grid w-full grid-cols-2 rounded-none bg-gray-100 dark:bg-[#1a1a1a]">
          <TabsTrigger value="geral" className="rounded-none data-[state=active]:bg-white data-[state=active]:text-primary dark:data-[state=active]:bg-[#111111] dark:data-[state=active]:text-gray-100">
            Configurações Gerais
          </TabsTrigger>
          <TabsTrigger value="acoes" className="rounded-none data-[state=active]:bg-white data-[state=active]:text-primary dark:data-[state=active]:bg-[#111111] dark:data-[state=active]:text-gray-100">
            Ações
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="flex-1 overflow-auto bg-[#f3f3f3] dark:bg-[#050505] p-4">
        <div className="w-full space-y-4">
          <TabsContent value="geral" className="space-y-4">
            <div className="bg-white border border-gray-200 shadow-sm dark:bg-[#111111] dark:border-gray-700">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between dark:border-gray-700">
                <div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Dados principais</p>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Atualize o nome e defina o pipeline padrão</span>
                </div>
                <div className="text-[11px] text-gray-400 uppercase tracking-widest">
                  #{selectedPipeline?.id?.slice(0, 6) || "---"}
                </div>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Nome do pipeline</label>
                    <Input
                      value={pipelineName}
                      onChange={(e) => setPipelineName(e.target.value)}
                      className="rounded-none text-sm dark:bg-[#161616] dark:border-gray-700"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 self-end">
                    <Button
                      className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={async () => {
                        if (!selectedPipeline?.id) return;

                        try {
                          const { error } = await supabase
                            .from('pipelines')
                            .update({
                              name: pipelineName
                            })
                            .eq('id', selectedPipeline.id);

                          if (error) throw error;

                          toast({
                            title: "Sucesso",
                            description: "Pipeline atualizado com sucesso"
                          });

                          if (refreshCurrentPipeline) {
                            await refreshCurrentPipeline();
                          }
                        } catch (error) {
                          console.error('Erro ao atualizar pipeline:', error);
                          toast({
                            title: "Erro",
                            description: "Erro ao atualizar pipeline",
                            variant: "destructive"
                          });
                        }
                      }}
                    >
                      Salvar
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-none border-gray-300 text-gray-700 hover:bg-gray-100 bg-white dark:border-gray-500 dark:text-gray-100 dark:bg-[#1f1f1f] dark:hover:bg-[#353535]"
                      onClick={async () => {
                        if (!selectedPipeline?.id || !selectedWorkspace?.workspace_id) return;

                        try {
                          const { error } = await supabase.functions.invoke('manage-workspaces', {
                            body: {
                              action: 'update',
                              workspaceId: selectedWorkspace.workspace_id,
                              name: selectedWorkspace.name,
                              defaultPipelineId: selectedPipeline.id
                            },
                            headers: getHeaders()
                          });

                          if (error) throw error;

                          toast({
                            title: "Sucesso",
                            description: "Pipeline definido como padrão com sucesso!",
                          });

                          if (refreshCurrentPipeline) {
                            await refreshCurrentPipeline();
                          }
                        } catch (error) {
                          console.error('Erro ao definir pipeline padrão:', error);
                          toast({
                            title: "Erro",
                            description: "Erro ao definir pipeline padrão",
                            variant: "destructive"
                          });
                        }
                      }}
                    >
                      Definir como padrão
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-red-200 shadow-sm dark:bg-[#181111] dark:border-red-900/50">
              <div className="px-4 py-3 border-b border-red-200 bg-red-50 dark:bg-[#2a1212] dark:border-red-900/40">
                <p className="text-xs font-semibold text-red-900 dark:text-red-200">Zona de perigo</p>
                <span className="text-[11px] text-red-700 dark:text-red-300">Excluir o pipeline remove colunas e negócios.</span>
              </div>
              <div className="p-4">
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-none bg-red-600 hover:bg-red-700"
                  onClick={() => setIsDeletePipelineModalOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir pipeline
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="acoes" className="space-y-4">
            <div className="bg-white border border-gray-200 shadow-sm dark:bg-[#111111] dark:border-gray-700">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between dark:border-gray-700">
                <div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Ações do pipeline</p>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Configure botões rápidos para movimentar negócios</span>
                </div>
                <Button onClick={addNewAction} size="sm" className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-1" />
                  Nova ação
                </Button>
              </div>
              {actions.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <p className="text-sm">Nenhuma ação configurada</p>
                  <p className="text-xs mt-1">Clique em "Nova ação" para começar</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {actions.map((action) => (
                  <div key={action.id} className="p-4 grid gap-4 lg:grid-cols-[2.5fr,1.5fr,1.5fr,1fr,auto] items-start">
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Nome e cor</span>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setEditingActionId(action.id);
                            setColorPickerOpen(true);
                          }}
                          className="w-10 h-10 rounded-none border-2 border-gray-400 hover:border-gray-600 dark:border-gray-500 dark:hover:border-gray-300 transition-colors"
                          style={{ backgroundColor: action.buttonColor || undefined }}
                          title={action.buttonColor ? `Cor salva: ${action.buttonColor}` : "Selecionar cor (nenhuma cor salva)"}
                        >
                          <Palette className={`h-4 w-4 ${action.buttonColor ? 'text-white' : 'text-gray-500'} drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]`} />
                        </Button>
                        <Input
                          value={action.actionName}
                          onChange={(e) => updateAction(action.id, 'actionName', e.target.value)}
                          placeholder="Nome da ação"
                          className="rounded-none text-sm dark:bg-[#161616] dark:border-gray-700"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Próximo pipeline</span>
                      <Select value={action.nextPipeline} onValueChange={(value) => handlePipelineChange(action.id, value)}>
                        <SelectTrigger className="rounded-none text-sm dark:bg-[#161616] dark:border-gray-700">
                          <SelectValue placeholder="Selecione um pipeline" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 rounded-none border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1b1b1b]">
                          {pipelines?.map((pipeline) => (
                            <SelectItem
                              key={pipeline.id}
                              value={pipeline.id}
                              className="text-sm text-gray-900 dark:text-gray-100 focus:bg-gray-100 dark:focus:bg-[#2a2a2a]"
                            >
                              {pipeline.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Coluna destino</span>
                      <Select
                        value={action.targetColumn}
                        onValueChange={(value) => updateAction(action.id, 'targetColumn', value)}
                        disabled={!action.nextPipeline}
                      >
                        <SelectTrigger className="rounded-none text-sm dark:bg-[#161616] dark:border-gray-700 disabled:opacity-60">
                          <SelectValue placeholder="Escolha a coluna" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 rounded-none border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1b1b1b]">
                          {(actionColumns[action.id] || []).map((column: any) => (
                            <SelectItem
                              key={column.id}
                              value={column.id}
                              className="text-sm text-gray-900 dark:text-gray-100 focus:bg-gray-100 dark:focus:bg-[#2a2a2a]"
                            >
                              {column.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status do negócio</span>
                      <Select value={action.dealState} onValueChange={(value) => updateAction(action.id, 'dealState', value)}>
                        <SelectTrigger className="rounded-none text-sm dark:bg-[#161616] dark:border-gray-700">
                          <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent className="rounded-none border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1b1b1b]">
                          <SelectItem
                            value="Aberto"
                            disabled={!canConfigureOpenStatus}
                            className="text-sm text-gray-900 dark:text-gray-100 focus:bg-gray-100 dark:focus:bg-[#2a2a2a]"
                          >
                            Aberto {!canConfigureOpenStatus ? "(restrito)" : ""}
                          </SelectItem>
                          <SelectItem
                            value="Ganho"
                            className="text-sm text-gray-900 dark:text-gray-100 focus:bg-gray-100 dark:focus:bg-[#2a2a2a]"
                          >
                            Ganho
                          </SelectItem>
                          <SelectItem
                            value="Perda"
                            className="text-sm text-gray-900 dark:text-gray-100 focus:bg-gray-100 dark:focus:bg-[#2a2a2a]"
                          >
                            Perda
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Ações</span>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Button
                          size="sm"
                          className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90"
                          disabled={!action.actionName || !action.nextPipeline || !action.targetColumn || !action.dealState}
                          onClick={() => saveAction(action)}
                        >
                          Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-none"
                          onClick={() => deleteAction(action.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </div>
      </div>

      <DeletarPipelineModal
        isOpen={isDeletePipelineModalOpen}
        onClose={() => setIsDeletePipelineModalOpen(false)}
        onConfirm={handleDeletePipeline}
        pipelineName={selectedPipeline?.name || ""}
        isDeleting={isDeletingPipeline}
      />

      {/* Modal de seleção de cor */}
      <Dialog open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
        <DialogContent className="rounded-none border border-gray-300 dark:border-gray-700 dark:bg-[#0b0b0b] dark:text-gray-100">
          <DialogHeader>
            <DialogTitle>Selecionar cor do botão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-8 gap-2">
              {[
                '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
                '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
                '#14b8a6', '#a855f7', '#e11d48', '#f43f5e', '#fb923c',
                '#fbbf24', '#a3e635', '#22c55e', '#2dd4bf', '#38bdf8',
                '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#d946ef',
                '#f472b6', '#fb7185', '#fb7185', '#94a3b8', '#64748b'
              ].map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    if (editingActionId) {
                      updateAction(editingActionId, 'buttonColor', color);
                      setColorPickerOpen(false);
                      setEditingActionId(null);
                    }
                  }}
                  className="w-10 h-10 rounded border-2 border-gray-300 hover:border-gray-500 dark:border-gray-600 dark:hover:border-gray-400 transition-all"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700 dark:text-gray-200">Cor personalizada:</label>
              <input
                type="color"
                onChange={(e) => {
                  if (editingActionId) {
                    updateAction(editingActionId, 'buttonColor', e.target.value);
                    setColorPickerOpen(false);
                    setEditingActionId(null);
                  }
                }}
                className="w-12 h-10 rounded border border-gray-300 cursor-pointer dark:border-gray-600"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}