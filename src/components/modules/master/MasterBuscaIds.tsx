import { useMemo, useState, useEffect } from "react";
import { Workspace } from "@/contexts/WorkspaceContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceStructure } from "@/hooks/useWorkspaceStructure";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Search, Code2, Layers, ListTree, Bot, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MasterBuscaIdsProps {
  workspaces: Workspace[];
}

export function MasterBuscaIds({ workspaces }: MasterBuscaIdsProps) {
  const { toast } = useToast();

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [selectedColumnId, setSelectedColumnId] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [agents, setAgents] = useState<
    { id: string; name: string; is_active: boolean; workspace_id?: string | null }[]
  >([]);
  const [connections, setConnections] = useState<
    { id: string; instance_name: string | null; status: string }[]
  >([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(false);

  const {
    pipelines,
    columns,
    tags,
    loadingPipelines,
    loadingColumns,
    loadingTags,
    loadColumns,
    queues,
    loadingQueues,
  } = useWorkspaceStructure(selectedWorkspaceId || null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.workspace_id === selectedWorkspaceId) || null,
    [workspaces, selectedWorkspaceId]
  );

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) || null,
    [pipelines, selectedPipelineId]
  );

  const selectedColumn = useMemo(
    () => columns.find((c) => c.id === selectedColumnId) || null,
    [columns, selectedColumnId]
  );

  // Carregar agentes ativos do workspace selecionado
  useEffect(() => {
    const loadAgents = async () => {
      if (!selectedWorkspaceId) {
        setAgents([]);
        return;
      }
      try {
        setLoadingAgents(true);
        const { data, error } = await supabase
          .from("ai_agents")
          .select("id, name, is_active, workspace_id")
          .eq("workspace_id", selectedWorkspaceId)
          .eq("is_active", true)
          .order("name");

        if (error) throw error;
        setAgents(data || []);
      } catch (error) {
        console.error("Erro ao carregar agentes do workspace:", error);
        toast({
          title: "Erro",
          description: "Erro ao carregar agentes ativos da empresa",
          variant: "destructive",
        });
      } finally {
        setLoadingAgents(false);
      }
    };

    loadAgents();
  }, [selectedWorkspaceId, toast]);

  // Carregar conexões ativas do workspace selecionado
  useEffect(() => {
    const loadConnections = async () => {
      if (!selectedWorkspaceId) {
        setConnections([]);
        return;
      }
      try {
        setLoadingConnections(true);
        const { data, error } = await supabase
          .from("connections")
          .select("id, instance_name, status")
          .eq("workspace_id", selectedWorkspaceId)
          .eq("status", "connected")
          .order("created_at", { ascending: true });

        if (error) throw error;
        setConnections(data || []);
      } catch (error) {
        console.error("Erro ao carregar conexões do workspace:", error);
        toast({
          title: "Erro",
          description: "Erro ao carregar conexões ativas da empresa",
          variant: "destructive",
        });
      } finally {
        setLoadingConnections(false);
      }
    };

    loadConnections();
  }, [selectedWorkspaceId, toast]);

  // Carregar colunas quando pipeline mudar
  useEffect(() => {
    if (selectedPipelineId) {
      loadColumns(selectedPipelineId);
    } else {
      setSelectedColumnId("");
    }
  }, [selectedPipelineId, loadColumns]);

  // Resetar seleções quando workspace mudar
  useEffect(() => {
    setSelectedPipelineId("");
    setSelectedColumnId("");
  }, [selectedWorkspaceId]);

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      toast({
        title: "Copiado",
        description: "ID copiado para a área de transferência",
      });
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      console.error("Erro ao copiar ID:", error);
      toast({
        title: "Erro",
        description: "Não foi possível copiar o ID",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-[#050505]">
      <div className="border-b border-[#d4d4d4] dark:border-gray-800 px-4 py-3 flex items-center gap-3 bg-[#f8f8f8] dark:bg-[#060608]">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-700 dark:text-gray-200" />
          <div>
            <h1 className="text-sm font-bold tracking-wide text-gray-800 dark:text-gray-100 uppercase">
              Busca por IDs
            </h1>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Encontre rapidamente nomes e IDs de recursos do sistema para usar em automações e integrações.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Seleção de Workspace e Estrutura */}
        <Card className="border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#1f1f1f]">
          <CardHeader className="bg-white dark:bg-[#1f1f1f]">
            <CardTitle className="text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-gray-700 dark:text-gray-300" />
              IDs do sistema
            </CardTitle>
            <CardDescription className="text-xs text-gray-600 dark:text-gray-400">
              Selecione a empresa e, opcionalmente, um pipeline/coluna para visualizar os IDs organizados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 bg-white dark:bg-[#1f1f1f]">
            {/* Workspace */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Empresa (Workspace)
                </Label>
                <Select
                  value={selectedWorkspaceId}
                  onValueChange={(value) => setSelectedWorkspaceId(value)}
                >
                  <SelectTrigger className="h-8 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-gray-100">
                    <SelectValue
                      placeholder={
                        workspaces.length === 0
                          ? "Nenhuma empresa disponível"
                          : "Selecione uma empresa"
                      }
                    />
                  </SelectTrigger>
                  {workspaces.length > 0 && (
                    <SelectContent className="dark:bg-[#2d2d2d] dark:border-gray-700">
                      {workspaces.map((workspace) => (
                        <SelectItem
                          key={workspace.workspace_id}
                          value={workspace.workspace_id}
                          className="text-xs dark:text-gray-200 dark:focus:bg-gray-700"
                        >
                          {workspace.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  )}
                </Select>
              </div>

              {/* Pipeline */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Pipeline (opcional)
                </Label>
                <Select
                  value={selectedPipelineId}
                  onValueChange={(value) => setSelectedPipelineId(value)}
                  disabled={!selectedWorkspace || loadingPipelines || pipelines.length === 0}
                >
                  <SelectTrigger className="h-8 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-gray-100">
                    <SelectValue
                      placeholder={
                        !selectedWorkspace
                          ? "Selecione uma empresa primeiro"
                          : loadingPipelines
                          ? "Carregando pipelines..."
                          : pipelines.length === 0
                          ? "Nenhum pipeline disponível"
                          : "Selecione um pipeline (opcional)"
                      }
                    />
                  </SelectTrigger>
                  {pipelines.length > 0 && (
                    <SelectContent className="dark:bg-[#2d2d2d] dark:border-gray-700">
                      {pipelines.map((pipeline) => (
                        <SelectItem
                          key={pipeline.id}
                          value={pipeline.id}
                          className="text-xs dark:text-gray-200 dark:focus:bg-gray-700"
                        >
                          {pipeline.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  )}
                </Select>
              </div>

              {/* Coluna */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Coluna (opcional)
                </Label>
                <Select
                  value={selectedColumnId}
                  onValueChange={(value) => setSelectedColumnId(value)}
                  disabled={
                    !selectedPipelineId || loadingColumns || columns.length === 0
                  }
                >
                  <SelectTrigger className="h-8 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] text-gray-900 dark:text-gray-100">
                    <SelectValue
                      placeholder={
                        !selectedPipelineId
                          ? "Selecione um pipeline primeiro"
                          : loadingColumns
                          ? "Carregando colunas..."
                          : columns.length === 0
                          ? "Nenhuma coluna disponível"
                          : "Selecione uma coluna (opcional)"
                      }
                    />
                  </SelectTrigger>
                  {columns.length > 0 && (
                    <SelectContent className="dark:bg-[#2d2d2d] dark:border-gray-700">
                      {columns.map((column) => (
                        <SelectItem
                          key={column.id}
                          value={column.id}
                          className="text-xs dark:text-gray-200 dark:focus:bg-gray-700"
                        >
                          {column.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  )}
                </Select>
              </div>
            </div>

            {selectedWorkspace && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                As listas abaixo exibem os nomes e IDs da empresa selecionada, para facilitar a
                configuração de automações, webhooks e integrações externas.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Listas de IDs */}
        {!selectedWorkspace && (
          <Card className="border-dashed border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#111111]">
            <CardContent className="py-8 text-center space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                Selecione uma empresa para visualizar os IDs do sistema.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Você verá listas com nomes e IDs de pipelines, colunas, filas e tags do workspace.
              </p>
            </CardContent>
          </Card>
        )}

        {selectedWorkspace && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Workspace + Pipelines */}
            <Card className="border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#141414]">
              <CardHeader className="bg-white dark:bg-[#141414]">
                <CardTitle className="text-sm text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                  Workspace & Pipelines
                </CardTitle>
                <CardDescription className="text-xs text-gray-600 dark:text-gray-400">
                  Informações gerais e todos os pipelines do workspace selecionado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 bg-white dark:bg-[#141414]">
                {/* Workspace */}
                <div className="border border-[#e5e5e5] dark:border-gray-700 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                        {selectedWorkspace.name}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        ID do workspace
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] font-mono bg-[#f3f3f3] dark:bg-[#1f1f1f] px-2 py-1 rounded text-gray-900 dark:text-gray-100">
                        {selectedWorkspace.workspace_id}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-none"
                        onClick={() => handleCopy(selectedWorkspace.workspace_id)}
                      >
                        {copiedId === selectedWorkspace.workspace_id ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Pipelines */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Pipelines ({pipelines.length})
                    </Label>
                    {selectedPipeline && (
                      <Badge variant="outline" className="text-[10px] rounded-none">
                        Pipeline selecionado: {selectedPipeline.name}
                      </Badge>
                    )}
                  </div>

                  <div className="max-h-48 overflow-auto border border-[#e5e5e5] dark:border-gray-700 rounded">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-[#f3f3f3] dark:bg-[#1b1b1b]">
                        <tr>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            Nome
                          </th>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            ID
                          </th>
                          <th className="w-12 px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pipelines.map((pipeline) => (
                          <tr
                            key={pipeline.id}
                            className="odd:bg-white even:bg-[#fafafa] dark:odd:bg-[#141414] dark:even:bg-[#161616]"
                          >
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <span className="text-[11px] text-gray-900 dark:text-gray-100">
                                {pipeline.name}
                              </span>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <code className="text-[10px] font-mono bg-[#f5f5f5] dark:bg-[#1b1b1b] px-1.5 py-0.5 rounded text-gray-900 dark:text-gray-100">
                                {pipeline.id}
                              </code>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800 text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-none"
                                onClick={() => handleCopy(pipeline.id)}
                              >
                                {copiedId === pipeline.id ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {pipelines.length === 0 && !loadingPipelines && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Nenhum pipeline encontrado para este workspace.
                            </td>
                          </tr>
                        )}
                        {loadingPipelines && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Carregando pipelines...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Colunas, Filas, Tags, Agentes e Conexões */}
            <Card className="border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#141414]">
              <CardHeader className="bg-white dark:bg-[#141414]">
                <CardTitle className="text-sm text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <ListTree className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                  Estrutura detalhada do workspace
                </CardTitle>
                <CardDescription className="text-xs text-gray-600 dark:text-gray-400">
                  Colunas do pipeline selecionado, filas de atendimento, tags, agentes de IA ativos
                  e conexões ativas da empresa.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 bg-white dark:bg-[#141414]">
                {/* Colunas */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Colunas do pipeline selecionado
                    </Label>
                    <Badge variant="outline" className="text-[10px] rounded-none">
                      {columns.length} coluna(s)
                    </Badge>
                  </div>
                  <div className="max-h-40 overflow-auto border border-[#e5e5e5] dark:border-gray-700 rounded">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-[#f3f3f3] dark:bg-[#1b1b1b]">
                        <tr>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            Nome
                          </th>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            ID
                          </th>
                          <th className="w-12 px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {columns.map((column) => (
                          <tr
                            key={column.id}
                            className="odd:bg-white even:bg-[#fafafa] dark:odd:bg-[#141414] dark:even:bg-[#161616]"
                          >
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <span className="text-[11px] text-gray-900 dark:text-gray-100">
                                {column.name}
                              </span>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <code className="text-[10px] font-mono bg-[#f5f5f5] dark:bg-[#1b1b1b] px-1.5 py-0.5 rounded text-gray-900 dark:text-gray-100">
                                {column.id}
                              </code>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800 text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-none"
                                onClick={() => handleCopy(column.id)}
                              >
                                {copiedId === column.id ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {columns.length === 0 && !loadingColumns && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Selecione um pipeline para ver as colunas.
                            </td>
                          </tr>
                        )}
                        {loadingColumns && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Carregando colunas...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Filas */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Filas de atendimento
                    </Label>
                    <Badge variant="outline" className="text-[10px] rounded-none">
                      {queues?.length || 0} fila(s)
                    </Badge>
                  </div>
                  <div className="max-h-32 overflow-auto border border-[#e5e5e5] dark:border-gray-700 rounded">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-[#f3f3f3] dark:bg-[#1b1b1b]">
                        <tr>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            Nome
                          </th>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            ID
                          </th>
                          <th className="w-12 px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {queues?.map((queue) => (
                          <tr
                            key={queue.id}
                            className="odd:bg-white even:bg-[#fafafa] dark:odd:bg-[#141414] dark:even:bg-[#161616]"
                          >
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <span className="text-[11px] text-gray-900 dark:text-gray-100">
                                {queue.name}
                              </span>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <code className="text-[10px] font-mono bg-[#f5f5f5] dark:bg-[#1b1b1b] px-1.5 py-0.5 rounded text-gray-900 dark:text-gray-100">
                                {queue.id}
                              </code>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800 text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-none"
                                onClick={() => handleCopy(queue.id)}
                              >
                                {copiedId === queue.id ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {(!queues || queues.length === 0) && !loadingQueues && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Nenhuma fila cadastrada para este workspace.
                            </td>
                          </tr>
                        )}
                        {loadingQueues && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Carregando filas...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tags */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Tags
                    </Label>
                    <Badge variant="outline" className="text-[10px] rounded-none">
                      {tags.length} tag(s)
                    </Badge>
                  </div>
                  <div className="max-h-32 overflow-auto border border-[#e5e5e5] dark:border-gray-700 rounded">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-[#f3f3f3] dark:bg-[#1b1b1b]">
                        <tr>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            Nome
                          </th>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            ID
                          </th>
                          <th className="w-16 px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            Cor
                          </th>
                          <th className="w-10 px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tags.map((tag) => (
                          <tr
                            key={tag.id}
                            className="odd:bg-white even:bg-[#fafafa] dark:odd:bg-[#141414] dark:even:bg-[#161616]"
                          >
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <span className="text-[11px] text-gray-900 dark:text-gray-100">
                                {tag.name}
                              </span>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <code className="text-[10px] font-mono bg-[#f5f5f5] dark:bg-[#1b1b1b] px-1.5 py-0.5 rounded text-gray-900 dark:text-gray-100">
                                {tag.id}
                              </code>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <div className="flex items-center gap-1">
                                <span
                                  className="inline-block w-3 h-3 rounded-full border border-black/5 dark:border-white/10"
                                  style={{ backgroundColor: tag.color || "#6366f1" }}
                                />
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                  {tag.color}
                                </span>
                              </div>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800 text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-none"
                                onClick={() => handleCopy(tag.id)}
                              >
                                {copiedId === tag.id ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {tags.length === 0 && !loadingTags && (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Nenhuma tag cadastrada para este workspace.
                            </td>
                          </tr>
                        )}
                        {loadingTags && (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Carregando tags...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Agentes de IA ativos */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Agentes de IA ativos
                    </Label>
                    <Badge variant="outline" className="text-[10px] rounded-none">
                      {agents.length} agente(s)
                    </Badge>
                  </div>
                  <div className="max-h-32 overflow-auto border border-[#e5e5e5] dark:border-gray-700 rounded">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-[#f3f3f3] dark:bg-[#1b1b1b]">
                        <tr>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            Nome
                          </th>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            ID
                          </th>
                          <th className="w-10 px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {agents.map((agent) => (
                          <tr
                            key={agent.id}
                            className="odd:bg-white even:bg-[#fafafa] dark:odd:bg-[#141414] dark:even:bg-[#161616]"
                          >
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <span className="text-[11px] text-gray-900 dark:text-gray-100">
                                {agent.name}
                              </span>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f00f] dark:border-gray-800">
                              <code className="text-[10px] font-mono bg-[#f5f5f5] dark:bg-[#1b1b1b] px-1.5 py-0.5 rounded text-gray-900 dark:text-gray-100">
                                {agent.id}
                              </code>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800 text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-none"
                                onClick={() => handleCopy(agent.id)}
                              >
                                {copiedId === agent.id ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {agents.length === 0 && !loadingAgents && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Nenhum agente de IA ativo para este workspace.
                            </td>
                          </tr>
                        )}
                        {loadingAgents && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Carregando agentes...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Conexões ativas */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Conexões ativas
                    </Label>
                    <Badge variant="outline" className="text-[10px] rounded-none">
                      {connections.length} conexão(ões)
                    </Badge>
                  </div>
                  <div className="max-h-32 overflow-auto border border-[#e5e5e5] dark:border-gray-700 rounded">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-[#f3f3f3] dark:bg-[#1b1b1b]">
                        <tr>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            Nome da instância
                          </th>
                          <th className="text-left px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700">
                            ID
                          </th>
                          <th className="w-10 px-2 py-1 border-b border-[#e5e5e5] dark:border-gray-700"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {connections.map((connection) => (
                          <tr
                            key={connection.id}
                            className="odd:bg-white even:bg-[#fafafa] dark:odd:bg-[#141414] dark:even:bg-[#161616]"
                          >
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <span className="text-[11px] text-gray-900 dark:text-gray-100">
                                {connection.instance_name || "-"}
                              </span>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800">
                              <code className="text-[10px] font-mono bg-[#f5f5f5] dark:bg-[#1b1b1b] px-1.5 py-0.5 rounded text-gray-900 dark:text-gray-100">
                                {connection.id}
                              </code>
                            </td>
                            <td className="px-2 py-1 border-b border-[#f0f0f0] dark:border-gray-800 text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-none"
                                onClick={() => handleCopy(connection.id)}
                              >
                                {copiedId === connection.id ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {connections.length === 0 && !loadingConnections && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Nenhuma conexão ativa para este workspace.
                            </td>
                          </tr>
                        )}
                        {loadingConnections && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-2 py-3 text-center text-[11px] text-gray-500 dark:text-gray-400"
                            >
                              Carregando conexões...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}


