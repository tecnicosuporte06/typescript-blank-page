import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { endOfDay, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/hooks/useAuth";
import { usePipelinesContext } from "@/contexts/PipelinesContext";
import { useToast } from "@/hooks/use-toast";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DealDetailsPage } from "@/pages/DealDetailsPage";
import { DealStatusMoveModal } from "@/components/modals/DealStatusMoveModal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type ResponsibleFilterValue = "ALL" | "UNASSIGNED" | string;

function CRMPanoramaContent() {
  const { selectedWorkspace } = useWorkspace();
  const { workspaceId: urlWorkspaceId } = useParams<{ workspaceId: string }>();
  const { user, userRole, hasRole } = useAuth();
  const { toast } = useToast();

  const isMaster = hasRole(["master"]);
  const effectiveWorkspaceId = isMaster && urlWorkspaceId ? urlWorkspaceId : selectedWorkspace?.workspace_id;

  const { pipelines, selectedPipeline, selectPipeline, updateCard, refreshCurrentPipeline } = usePipelinesContext();

  const [pipelineFilter, setPipelineFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "aberto" | "ganho" | "perda">("ALL");
  const [responsibleFilter, setResponsibleFilter] = useState<ResponsibleFilterValue>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const [rows, setRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<any | null>(null);

  const [dealStatusMoveOpen, setDealStatusMoveOpen] = useState(false);
  const [dealStatusMoveCard, setDealStatusMoveCard] = useState<any | null>(null);
  const [isDealStatusMoveLoading, setIsDealStatusMoveLoading] = useState(false);

  useEffect(() => {
    // manter compatibilidade UX: se o usuário escolher um pipeline no filtro e ainda não houver selectedPipeline, selecionar
    if (pipelineFilter !== "ALL" && pipelines?.length) {
      const p = pipelines.find((x: any) => x.id === pipelineFilter);
      if (p && (!selectedPipeline || selectedPipeline.id !== p.id)) {
        selectPipeline(p);
      }
    }
  }, [pipelineFilter, pipelines, selectPipeline, selectedPipeline]);

  const fetchRows = useCallback(async () => {
    if (!effectiveWorkspaceId) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      // Buscar cards diretamente por workspace (via join com pipelines), para evitar “carrega às vezes”
      // quando a lista de pipelines ainda não está pronta.
      const runQuery = async () => {
        let query = supabase
          .from("pipeline_cards")
          .select(
            `
            id,
            status,
            created_at,
            updated_at,
            value,
            qualification,
            pipeline_id,
            column_id,
            responsible_user_id,
            contacts (
              id,
              name,
              phone
            ),
            pipelines!inner (
              id,
              name,
              workspace_id
            ),
            pipeline_columns (
              id,
              name
            ),
            responsible_user:system_users!pipeline_cards_responsible_user_id_fkey (
              id,
              name
            )
          `
          )
          .eq("pipelines.workspace_id", effectiveWorkspaceId)
          .in("status", ["aberto", "ganho", "perda", "perdido"])
          .order("created_at", { ascending: false });

        if (pipelineFilter !== "ALL") {
          query = query.eq("pipeline_id", pipelineFilter);
        }

        // Filtro por data (created_at)
        if (dateFrom || dateTo) {
          const from = dateFrom ? startOfDay(dateFrom) : undefined;
          const to = dateTo ? endOfDay(dateTo) : undefined;
          if (from && to) {
            const start = from.getTime() <= to.getTime() ? from : to;
            const end = from.getTime() <= to.getTime() ? to : from;
            query = query.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
          } else if (from) {
            query = query.gte("created_at", from.toISOString());
          } else if (to) {
            query = query.lte("created_at", to.toISOString());
          }
        }

        if (statusFilter !== "ALL") {
          if (statusFilter === "perda") {
            query = query.in("status", ["perda", "perdido"]);
          } else {
            query = query.eq("status", statusFilter);
          }
        }

        const { data, error } = await query;
        if (error) throw error;

        if (userRole === "user") {
          // consistente com pipeline: user vê sem responsável + atribuídos a ele
          const uid = user?.id || null;
          const filtered = (data || []).filter((c: any) => {
            const responsibleId = c.responsible_user_id || c?.responsible_user?.id || null;
            return !responsibleId || (!!uid && responsibleId === uid);
          });
          return filtered;
        }

        return data || [];
      };

      // retry curto para falhas transitórias
      let data: any[] = [];
      let lastError: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          data = await runQuery();
          lastError = null;
          break;
        } catch (e: any) {
          lastError = e;
          await new Promise((r) => setTimeout(r, 350 + attempt * 500));
        }
      }
      if (lastError) throw lastError;

      setRows((data || []).map((r: any) => ({ ...r, contact: r.contacts || null, contacts: undefined })));
    } catch (e: any) {
      console.error("Erro ao carregar panorama:", e);
      setErrorMsg(e?.message || "Não foi possível carregar o panorama.");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, effectiveWorkspaceId, pipelineFilter, statusFilter, user?.id, userRole]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const responsibleOptions = useMemo(() => {
    // Listar somente usuários que realmente são responsáveis por alguma oportunidade carregada no panorama
    const optionsMap = new Map<string, { id: string; name: string }>();
    (rows || []).forEach((r: any) => {
      const rid = r?.responsible_user_id || r?.responsible_user?.id || null;
      if (!rid) return;
      const name = r?.responsible_user?.name || "Responsável sem nome";
      optionsMap.set(String(rid), { id: String(rid), name });
    });
    return Array.from(optionsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = (searchTerm || "").trim().toLowerCase();
    return rows
      .filter((r: any) => {
        if (!term) return true;
        const name = String(r?.contact?.name || "").toLowerCase();
        const phone = String(r?.contact?.phone || "").toLowerCase();
        const pipelineName = String(r?.pipelines?.name || "").toLowerCase();
        return name.includes(term) || phone.includes(term) || pipelineName.includes(term);
      })
      .filter((r: any) => {
        if (responsibleFilter === "ALL") return true;
        const responsibleId = r?.responsible_user_id || r?.responsible_user?.id || "";
        if (responsibleFilter === "UNASSIGNED") return !responsibleId;
        return responsibleId === responsibleFilter;
      });
  }, [rows, responsibleFilter, searchTerm]);

  const openDetails = (row: any) => {
    setSelectedRow(row);
    setDetailsOpen(true);
  };

  const openReopen = (row: any) => {
    setDealStatusMoveCard(row);
    setDealStatusMoveOpen(true);
  };

  const handleReopenConfirm = async (payload: { pipelineId: string; columnId: string }) => {
    if (!dealStatusMoveCard?.id) return;
    setIsDealStatusMoveLoading(true);
    try {
      await updateCard(dealStatusMoveCard.id, {
        pipeline_id: payload.pipelineId,
        column_id: payload.columnId,
        status: "aberto",
      } as any);

      toast({ title: "Sucesso", description: "Oportunidade reaberta." });
      setDealStatusMoveOpen(false);
      setDealStatusMoveCard(null);
      refreshCurrentPipeline();
      await fetchRows();
    } catch (e: any) {
      console.error("Erro ao reabrir (panorama):", e);
      toast({
        title: "Erro",
        description: e?.message || "Não foi possível reabrir a oportunidade.",
        variant: "destructive",
      });
    } finally {
      setIsDealStatusMoveLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0f0f0f] border border-gray-300 dark:border-gray-700 m-2 shadow-sm font-sans text-xs">
      <div className="flex-shrink-0 bg-background dark:bg-[#1a1a1a] border-b border-border dark:border-gray-700 w-full">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 h-auto">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-gray-100" style={{ fontSize: "1.5rem" }}>
              Panorama
            </span>
          </div>
          {/* Removido botão "Atualizar": panorama carrega automaticamente ao abrir e ao alterar filtros */}
        </div>

        <div className="px-2 md:px-4 py-2">
          <div className="w-full border border-[#d4d4d4] dark:border-gray-700 rounded-none p-2 md:p-3 shadow-sm bg-background dark:bg-[#1a1a1a]">
            <div className="flex w-full items-center gap-2 overflow-x-auto">
              <div className="flex-shrink-0">
                <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
                  <SelectTrigger className="w-[200px] h-7 text-xs bg-white dark:bg-[#1b1b1b] border-gray-300 dark:border-gray-700 rounded-none text-gray-900 dark:text-gray-100">
                    <SelectValue placeholder="Pipeline" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-white dark:bg-[#1b1b1b] border-gray-300 dark:border-gray-700 rounded-none">
                    <SelectItem value="ALL" className="text-xs">Todos os pipelines</SelectItem>
                    {(pipelines || []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[160px] h-7 text-xs bg-white dark:bg-[#1b1b1b] border-gray-300 dark:border-gray-700 rounded-none text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-white dark:bg-[#1b1b1b] border-gray-300 dark:border-gray-700 rounded-none">
                  <SelectItem value="ALL" className="text-xs">Todos</SelectItem>
                  <SelectItem value="aberto" className="text-xs">Abertos</SelectItem>
                  <SelectItem value="ganho" className="text-xs">Ganhos</SelectItem>
                  <SelectItem value="perda" className="text-xs">Perdidos</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative flex-1 min-w-[150px] max-w-xs">
                <Input
                  type="text"
                  placeholder="Buscar por contato, telefone ou pipeline..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-7 text-xs bg-white dark:bg-[#1b1b1b] border-gray-300 dark:border-gray-700 rounded-none"
                />
              </div>

              <Select value={responsibleFilter} onValueChange={(value) => setResponsibleFilter(value as ResponsibleFilterValue)}>
                <SelectTrigger className="w-[220px] h-7 text-xs bg-white dark:bg-[#1b1b1b] border-gray-300 dark:border-gray-700 rounded-none text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-white dark:bg-[#1b1b1b] border-gray-300 dark:border-gray-700 rounded-none">
                  <SelectItem value="ALL" className="text-xs">Todos</SelectItem>
                  <SelectItem value="UNASSIGNED" className="text-xs">Sem responsável</SelectItem>
                  {responsibleOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro por data inicial */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "h-7 px-2 rounded-none border text-xs inline-flex items-center gap-2",
                      "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
                      "dark:border-gray-700 dark:bg-[#1b1b1b] dark:text-gray-100 dark:hover:bg-[#222]"
                    )}
                    title="Filtrar por data inicial"
                  >
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: ptBR }) : "Data inicial"}
                    {dateFrom ? (
                      <span
                        className="opacity-70 hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDateFrom(undefined);
                        }}
                      >
                        ×
                      </span>
                    ) : null}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-none border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0f0f0f]" align="end">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(d) => setDateFrom(d || undefined)}
                    initialFocus
                    className="pointer-events-auto dark:bg-[#0f0f0f] dark:text-gray-100"
                  />
                </PopoverContent>
              </Popover>

              {/* Filtro por data final */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "h-7 px-2 rounded-none border text-xs inline-flex items-center gap-2",
                      "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
                      "dark:border-gray-700 dark:bg-[#1b1b1b] dark:text-gray-100 dark:hover:bg-[#222]"
                    )}
                    title="Filtrar por data final"
                  >
                    {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: ptBR }) : "Data final"}
                    {dateTo ? (
                      <span
                        className="opacity-70 hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDateTo(undefined);
                        }}
                      >
                        ×
                      </span>
                    ) : null}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-none border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0f0f0f]" align="end">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(d) => setDateTo(d || undefined)}
                    initialFocus
                    className="pointer-events-auto dark:bg-[#0f0f0f] dark:text-gray-100"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {errorMsg ? (
          <div className="p-4 text-xs text-red-600 dark:text-red-400">{errorMsg}</div>
        ) : null}

        <div className="h-full overflow-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Carregando panorama...</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-[#f3f3f3] dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left font-semibold px-3 py-2 w-[90px]">Status</th>
                  <th className="text-left font-semibold px-3 py-2">Contato</th>
                  <th className="text-left font-semibold px-3 py-2 w-[160px]">Pipeline</th>
                  <th className="text-left font-semibold px-3 py-2 w-[160px]">Etapa</th>
                  <th className="text-left font-semibold px-3 py-2 w-[140px]">Criado em</th>
                  <th className="text-left font-semibold px-3 py-2 w-[160px]">Resp.</th>
                  <th className="text-right font-semibold px-3 py-2 w-[110px]">Valor</th>
                  {/* Coluna de ações removida: abrir detalhes é via clique na linha */}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row: any) => {
                  const status = String(row.status || "").toLowerCase();
                  const statusLabel = status === "aberto" ? "Aberto" : status === "ganho" ? "Ganho" : "Perdido";
                  const statusClass =
                    status === "aberto"
                      ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-800/50"
                      : status === "ganho"
                        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-800/50"
                        : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800/50";

                  const contactName = row?.contact?.name || row?.contact?.phone || "-";
                  const createdAt = row?.created_at ? format(new Date(row.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-";
                  const pipelineName = row?.pipelines?.name || "-";
                  const stageName = row?.pipeline_columns?.name || "-";
                  const respName = row?.responsible_user?.name || "-";
                  const val = typeof row?.value === "number" ? row.value : null;
                  const valText =
                    val == null ? "-" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50 dark:hover:bg-[#1f2937] cursor-pointer"
                      onClick={() => openDetails(row)}
                    >
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center px-2 py-0.5 border rounded-none text-[10px] font-semibold", statusClass)}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[360px]" title={contactName}>
                          {contactName}
                        </div>
                        {row?.contact?.phone ? (
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">{row.contact.phone}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 truncate" title={pipelineName}>
                        {pipelineName}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 truncate" title={stageName}>
                        {stageName}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{createdAt}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 truncate" title={respName}>
                        {respName}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{valText}</td>
                    </tr>
                  );
                })}

                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-gray-500 dark:text-gray-400">
                      Nenhum negócio encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Sheet
        open={detailsOpen && !!selectedRow?.id}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setSelectedRow(null);
        }}
      >
        <SheetContent side="right" className="p-0 sm:max-w-[95vw] w-[95vw] max-w-[1400px] h-full border-l border-gray-200 dark:border-gray-800 shadow-2xl [&>button]:hidden">
          {selectedRow?.id ? (
            <DealDetailsPage
              cardId={selectedRow.id}
              workspaceId={effectiveWorkspaceId}
              onClose={() => {
                setDetailsOpen(false);
                setSelectedRow(null);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <DealStatusMoveModal
        open={dealStatusMoveOpen}
        onOpenChange={(open) => {
          setDealStatusMoveOpen(open);
          if (!open) setDealStatusMoveCard(null);
        }}
        mode="reopen"
        workspaceId={effectiveWorkspaceId || ""}
        pipelines={(pipelines || []).map((p: any) => ({ id: p.id, name: p.name }))}
        defaultPipelineId={dealStatusMoveCard?.pipeline_id || ""}
        defaultColumnId={dealStatusMoveCard?.column_id || ""}
        isLoading={isDealStatusMoveLoading}
        onConfirm={(payload) => handleReopenConfirm(payload)}
      />
    </div>
  );
}

export function CRMPanorama() {
  return <CRMPanoramaContent />;
}


