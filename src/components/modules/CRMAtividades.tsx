import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  CalendarClock,
  AlertCircle,
  User,
  Phone,
  Briefcase,
  Map as MapIcon,
  Columns,
  Tag
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { DealDetailsPage } from "@/pages/DealDetailsPage";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ActivityData {
  id: string;
  subject: string;
  scheduled_for: string;
  is_completed: boolean;
  responsible_id: string | null;
  responsible_name?: string;
  pipeline_name?: string;
  stage_name?: string;
  deal_name?: string;
  contact_phone?: string;
  contact_name?: string;
  pipeline_card_id?: string | null;
  pipeline_id?: string | null;
  column_id?: string | null;
  contact_id?: string | null;
  type: string;
}

interface SelectedDealDetails {
  cardId: string;
  pipelineId: string;
  columnId: string;
  contactId?: string | null;
  contactName?: string;
  contactPhone?: string;
  dealName?: string;
}

const DEFAULT_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 10;

export function CRMAtividades() {
  const { selectedWorkspace } = useWorkspace();
  const { user, userRole } = useAuth();
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataReady, setIsDataReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<"open" | "completed" | "all">("open");
  const [selectedDealDetails, setSelectedDealDetails] = useState<SelectedDealDetails | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();
  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize));
  const startIndex = totalCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const endIndex = totalCount > 0 ? Math.min(page * pageSize, totalCount) : 0;

  const handleOpenDealDetails = (activity: ActivityData) => {
    console.log("🎯 Abrindo detalhes do negócio para a atividade:", activity.id, "Card ID:", activity.pipeline_card_id);
    if (!activity.pipeline_card_id) {
      console.warn("⚠️ Atividade sem pipeline_card_id");
      return;
    }
    setSelectedDealDetails({
      cardId: activity.pipeline_card_id,
      pipelineId: activity.pipeline_id || "",
      columnId: activity.column_id || "",
      contactId: activity.contact_id,
      contactName: activity.contact_name || activity.deal_name || "Contato",
      contactPhone: activity.contact_phone || "",
      dealName: activity.deal_name || activity.contact_name || "Negócio",
    });
  };

  const handleCloseDealDetails = () => setSelectedDealDetails(null);

  const fetchActivities = async () => {
    if (!selectedWorkspace?.workspace_id) return;

    try {
      setIsLoading(true);
      setIsDataReady(false);
      console.log("🔄 Buscando atividades...");

      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      let query = supabase
        .from("activities")
        .select("*", { count: "exact" })
        .eq("workspace_id", selectedWorkspace.workspace_id)
        .order("scheduled_for", { ascending: true })
        .range(start, end);

      if (userRole === "user" && user?.id) {
        query = query.eq("responsible_id", user.id);
      }

      const { data: activitiesData, error, count } = await query;

      if (error) throw error;

      setTotalCount(count || 0);

      if (!activitiesData || activitiesData.length === 0) {
        setActivities([]);
        return;
      }

      // Buscar nomes dos responsáveis
      const responsibleIds = activitiesData
        .map((a) => a.responsible_id)
        .filter(Boolean) as string[];
      
      const uniqueResponsibleIds = [...new Set(responsibleIds)];
      let usersMap = new Map<string, string>();

      if (uniqueResponsibleIds.length > 0) {
        const { data: users } = await supabase
          .from("system_users")
          .select("id, name")
          .in("id", uniqueResponsibleIds);

        users?.forEach((u) => usersMap.set(u.id, u.name));
      }

      // Buscar cartões do pipeline relacionados
      const pipelineCardIds = activitiesData
        .map((a) => a.pipeline_card_id)
        .filter(Boolean) as string[];

      // Buscar contact_ids diretamente das atividades (mesmo sem pipeline_card_id)
      const activityContactIds = activitiesData
        .map((a) => a.contact_id)
        .filter(Boolean) as string[];

      const pipelineCardsMap = new Map<
        string,
        {
          description: string | null;
          pipeline_id: string;
          pipeline_name: string;
          column_id: string;
          column_name: string;
          contact_id: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          status: string;
          pipeline_workspace_id?: string | null;
        }
      >();

      // Buscar contatos diretamente das atividades (para atividades sem pipeline_card_id)
      const allContactIds = new Set<string>();
      activityContactIds.forEach(id => allContactIds.add(id));

      // Buscar contatos das atividades
      let directContactsMap = new Map<string, { name: string; phone: string }>();
      if (allContactIds.size > 0) {
        const { data: directContactsData, error: contactsError } = await supabase
          .from("contacts")
          .select("id, name, phone")
          .in("id", Array.from(allContactIds))
          .eq("workspace_id", selectedWorkspace.workspace_id);

        if (contactsError) {
          console.error("Erro ao buscar contatos das atividades:", contactsError);
        }

        directContactsData?.forEach((contact) => {
          directContactsMap.set(contact.id, {
            name: contact.name || "-",
            phone: contact.phone || "-",
          });
        });

        console.log(`📞 Contatos buscados: ${directContactsData?.length || 0} de ${allContactIds.size} contact_ids`);
      }

      if (pipelineCardIds.length > 0) {
        const { data: cardsPositions, error: cardsError } = await supabase
          .from("v_card_positions")
          .select("*")
          .in("card_id", [...new Set(pipelineCardIds)]);

        if (cardsError) {
          console.error("Erro ao buscar posições dos cards:", cardsError);
        }

        if (cardsPositions && cardsPositions.length > 0) {
          console.log(`📋 Posições de cards encontradas: ${cardsPositions.length}`);
          
          cardsPositions.forEach((card: any) => {
            pipelineCardsMap.set(card.card_id, {
              description: card.description || card.contact_name,
              pipeline_id: card.pipeline_id,
              pipeline_name: card.pipeline_name || "-",
              column_id: card.column_id,
              column_name: card.column_name || "-",
              contact_id: card.contact_id,
              contact_name: card.contact_name || "-",
              contact_phone: card.contact_phone || "-",
              status: card.card_status,
              pipeline_workspace_id: card.workspace_id,
            });

            // Também atualizar o mapa de contatos diretos se tivermos dados mais frescos
            if (card.contact_id && card.contact_name) {
              directContactsMap.set(card.contact_id, {
                name: card.contact_name,
                phone: card.contact_phone || "-",
              });
            }
          });
        }
      }

      const formattedActivities: ActivityData[] = activitiesData
        .map((item: any) => {
          const card = item.pipeline_card_id ? pipelineCardsMap.get(item.pipeline_card_id) : null;

          if (item.pipeline_card_id && card) {
            const cardStatus = card.status?.toLowerCase().trim() ?? "";
            const allowedOpenStatuses = ["aberto", "open"];
            if (cardStatus && !allowedOpenStatuses.includes(cardStatus)) {
              return null;
            }
          }

          // Buscar dados do contato diretamente se não houver card
          const directContact = item.contact_id ? directContactsMap.get(item.contact_id) : null;
          
          // Priorizar dados do card, mas usar dados diretos do contato como fallback
          const pipelineName = card?.pipeline_name || "-";
          const stageName = card?.column_name || "-";
          const contactPhone = card?.contact_phone || directContact?.phone || "-";
          const contactName = card?.contact_name || directContact?.name || card?.description || "-";
          const dealName = card?.description || "-";
          const contactId = item.contact_id || card?.contact_id || null;

          // Log de debug para atividades sem dados completos
          if ((!card && !directContact && item.contact_id) || (card && !card.contact_phone && !directContact?.phone && item.contact_id)) {
            console.warn(`⚠️ Atividade ${item.id} sem dados de contato:`, {
              hasCard: !!card,
              hasDirectContact: !!directContact,
              contactId: item.contact_id,
              pipelineCardId: item.pipeline_card_id,
            });
          }

          return {
            id: item.id,
            subject: item.subject,
            scheduled_for: item.scheduled_for,
            is_completed: item.is_completed,
            responsible_id: item.responsible_id,
            responsible_name: item.responsible_id ? usersMap.get(item.responsible_id) || "Desconhecido" : "Sem responsável",
            pipeline_name: pipelineName,
            stage_name: stageName,
            deal_name: dealName,
            contact_phone: contactPhone,
            contact_name: contactName,
            pipeline_card_id: item.pipeline_card_id,
            pipeline_id: card?.pipeline_id ?? null,
            column_id: card?.column_id ?? null,
            contact_id: contactId,
            type: item.type,
          };
        })
        .filter(Boolean) as ActivityData[];

      setActivities(formattedActivities);
      setIsDataReady(true);
    } catch (error: any) {
      console.error("Erro ao buscar atividades:", error);
      toast({
        title: "Erro",
        description: error?.message || "Não foi possível carregar as atividades.",
        variant: "destructive",
      });
      setIsDataReady(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [selectedWorkspace?.workspace_id, page, pageSize]);

  const isArquivoActivityType = (raw?: string | null) => {
    const t = (raw || "").toLowerCase().trim();
    return t === "arquivo" || t === "arquivos";
  };

  const filteredActivities = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return activities.filter((activity) => {
      // Arquivo não é atividade: não deve aparecer nem na lista nem no kanban
      if (isArquivoActivityType(activity.type)) return false;

      const categoryOk =
        selectedCategory === "all" ||
        (activity.type || "").toLowerCase().trim() === selectedCategory.toLowerCase().trim();

      const statusOk =
        selectedStatus === "all" ||
        (selectedStatus === "completed" ? activity.is_completed : !activity.is_completed);

      const matchesSubject = activity.subject.toLowerCase().includes(term);
      const matchesDeal = activity.deal_name?.toLowerCase().includes(term);
      const matchesResponsible = activity.responsible_name?.toLowerCase().includes(term);
      const matchesPipeline = activity.pipeline_name?.toLowerCase().includes(term);
      const matchesContact = activity.contact_name?.toLowerCase().includes(term);
      const searchOk = matchesSubject || matchesDeal || matchesResponsible || matchesPipeline || matchesContact;
      return categoryOk && statusOk && searchOk;
    });
  }, [activities, searchTerm, selectedCategory, selectedStatus]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    // Tipos fixos que devem aparecer mesmo se ainda não existirem atividades no banco
    set.add("Ligação Agendada");
    for (const a of activities) {
      const t = (a.type || "").trim();
      if (t && !isArquivoActivityType(t)) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [activities]);

  const normalizeActivityType = (raw?: string | null) => {
    const t = (raw || "").trim();
    if (!t) return "Outros";
    return t;
  };

  const kanbanColumns = useMemo(() => {
    const groups = new Map<string, ActivityData[]>();
    for (const a of filteredActivities) {
      const key = normalizeActivityType(a.type);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }

    // Garantir coluna “Ligação Agendada” no Kanban, mesmo vazia, quando estiver em “Todas categorias”
    // (e também quando o usuário selecionar essa categoria manualmente).
    const forcedType = "Ligação Agendada";
    const selected = (selectedCategory || "").toLowerCase().trim();
    if (
      selectedCategory === "all" ||
      selected === forcedType.toLowerCase().trim()
    ) {
      if (!groups.has(forcedType)) groups.set(forcedType, []);
    }

    const sortKey = (name: string) => {
      const n = name.toLowerCase();
      if (n.includes("ligação") || n.includes("ligacao") || n.includes("call")) return 10;
      if (n.includes("mensagem") || n.includes("message") || n.includes("whats")) return 20;
      if (n.includes("reuni") || n.includes("meet")) return 30;
      if (n.includes("agenda") || n.includes("agend")) return 40;
      if (n.includes("lemb")) return 50;
      return 90;
    };

    const sorted = Array.from(groups.entries())
      .sort((a, b) => {
        const ka = sortKey(a[0]);
        const kb = sortKey(b[0]);
        if (ka !== kb) return ka - kb;
        return a[0].localeCompare(b[0], "pt-BR");
      })
      .map(([name, items]) => ({
        name,
        items: items.slice().sort((x, y) => {
          const dx = new Date(x.scheduled_for).getTime();
          const dy = new Date(y.scheduled_for).getTime();
          return dx - dy;
        }),
      }));

    return sorted;
  }, [filteredActivities, selectedCategory]);

  return (
    <div className="flex flex-col h-full bg-white border border-gray-300 m-2 shadow-sm font-sans text-xs dark:bg-[#0e0e0e] dark:border-gray-700 dark:text-gray-100">
      {/* Toolbar */}
      <div className="flex flex-col border-b border-gray-300 bg-[#f8f9fa] dark:border-gray-700 dark:bg-[#141414]">
        <div
          className="flex flex-wrap items-center justify-between px-4 pt-3 pb-2 gap-2 h-auto"
          style={{ fontSize: "15px" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="font-semibold text-gray-900 dark:text-gray-100"
              style={{ fontSize: "1.5rem" }}
            >
              Atividades
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode((v) => (v === "list" ? "kanban" : "list"))}
              className={cn(
                "h-7 px-2 rounded-none border text-xs inline-flex items-center gap-2",
                "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
                "dark:border-gray-700 dark:bg-[#1b1b1b] dark:text-gray-100 dark:hover:bg-[#222]",
                viewMode === "kanban" && "bg-[#FEF3C7] border-gray-300 text-black font-semibold dark:bg-gray-700 dark:text-white"
              )}
              title={viewMode === "list" ? "Mudar para Kanban" : "Mudar para Lista"}
            >
              <Columns className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{viewMode === "list" ? "Kanban" : "Lista"}</span>
            </button>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-7 w-44 rounded-none text-xs border-gray-300 dark:bg-[#1b1b1b] dark:border-gray-700 dark:text-gray-100">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">Todas categorias</SelectItem>
                {availableCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as any)}>
              <SelectTrigger className="h-7 w-36 rounded-none text-xs border-gray-300 dark:bg-[#1b1b1b] dark:border-gray-700 dark:text-gray-100">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="open">Em aberto</SelectItem>
                <SelectItem value="completed">Concluída</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative w-64 max-w-sm">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500 h-3 w-3 dark:text-gray-400" />
              <Input
                placeholder="Pesquisar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-7 text-xs border-gray-300 rounded-none focus-visible:ring-1 focus-visible:ring-primary dark:bg-[#1b1b1b] dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div
        className={cn(
          "flex-1 bg-[#e6e6e6] dark:bg-[#050505] relative",
          viewMode === "list" ? "overflow-auto" : "overflow-hidden"
        )}
      >
        {viewMode === "list" ? (
          <div className="inline-block min-w-full align-middle bg-white dark:bg-[#111111]">
            {/*
              Padronização de largura das colunas no modo lista:
              - Usar o mesmo tamanho atual do Pipeline (150px)
              - Se exceder, usar truncate (reticências) e title para ver completo no hover
            */}
            <table className="min-w-full border-collapse bg-white text-xs font-sans dark:bg-[#111111] dark:text-gray-100">
            <thead className="bg-[#f3f3f3] sticky top-0 z-10 dark:bg-[#2a2a2a]">
              <tr>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[150px] w-[150px] max-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                  <div className="flex items-center gap-1">
                    <MapIcon className="h-3 w-3 text-gray-400" />
                    <span>Pipeline</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[140px] w-[140px] max-w-[140px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <Tag className="h-3 w-3 text-gray-400" />
                    <span>Tipo da Atividade</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[150px] w-[150px] max-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-gray-400" />
                    <span>Assunto</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-center font-semibold text-gray-700 min-w-[150px] w-[150px] max-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                   <div className="flex items-center justify-center gap-1">
                    <CalendarClock className="h-3 w-3 text-gray-400" />
                    <span>Data Prevista</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[150px] w-[150px] max-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                   <div className="flex items-center gap-1">
                    <Columns className="h-3 w-3 text-gray-400" />
                    <span>Etapa</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[150px] w-[150px] max-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                   <div className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3 text-gray-400" />
                    <span>Nome</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[150px] w-[150px] max-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                   <div className="flex items-center gap-1">
                    <User className="h-3 w-3 text-gray-400" />
                    <span>Responsável</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-center font-semibold text-gray-700 min-w-[150px] w-[150px] max-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                   <div className="flex items-center justify-center gap-1">
                    <Phone className="h-3 w-3 text-gray-400" />
                    <span>Telefone</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !isDataReady ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-[#1f1f1f]">
                    <td className="border border-[#e0e0e0] px-2 py-1 dark:border-gray-700">
                      <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm" />
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 dark:border-gray-700">
                      <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm" />
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 dark:border-gray-700">
                      <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm" />
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 dark:border-gray-700">
                      <div className="h-4 w-20 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm mx-auto" />
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 dark:border-gray-700">
                      <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm" />
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 dark:border-gray-700">
                      <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm" />
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 dark:border-gray-700">
                      <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm" />
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 dark:border-gray-700">
                      <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm mx-auto" />
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-1 dark:border-gray-700"></td>
                  </tr>
                ))
              ) : filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={9} className="border border-[#e0e0e0] text-center py-12 bg-gray-50 dark:border-gray-700 dark:bg-[#1a1a1a]">
                    <div className="flex flex-col items-center gap-2">
                      <CalendarClock className="h-8 w-8 text-gray-300 dark:text-gray-500" />
                      <p className="text-gray-500 font-medium dark:text-gray-300">
                        Nenhuma atividade encontrada.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredActivities.map((activity) => (
                  <tr key={activity.id} className="hover:bg-blue-50 group h-[32px] dark:hover:bg-[#1f2937]">
                    <td className="border border-[#e0e0e0] px-2 py-0 w-[150px] max-w-[150px] dark:border-gray-700 dark:text-gray-200">
                      <div className="truncate" title={activity.pipeline_name || ''}>
                        {activity.pipeline_name}
                      </div>
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 w-[140px] max-w-[140px] dark:border-gray-700 dark:text-gray-200">
                      <div className="truncate" title={activity.type || ''}>
                        {activity.type || "-"}
                      </div>
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 w-[150px] max-w-[150px] dark:border-gray-700 dark:text-gray-200 font-medium">
                      <div className="truncate" title={activity.subject || ''}>
                        {activity.subject}
                      </div>
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 text-center w-[150px] max-w-[150px] dark:border-gray-700 dark:text-gray-200">
                      <div
                        className="truncate mx-auto"
                        title={format(new Date(activity.scheduled_for), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      >
                        {format(new Date(activity.scheduled_for), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </div>
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 w-[150px] max-w-[150px] dark:border-gray-700 dark:text-gray-200">
                      <div className="truncate" title={activity.stage_name || ''}>
                        <Badge variant="outline" className="rounded-none font-normal border-gray-300 dark:border-gray-600 max-w-full truncate">
                          {activity.stage_name}
                        </Badge>
                      </div>
                    </td>
                      <td className="border border-[#e0e0e0] px-2 py-0 w-[150px] max-w-[150px] dark:border-gray-700 dark:text-gray-200">
                        {activity.pipeline_card_id ? (
                          <button
                            type="button"
                            onClick={() => handleOpenDealDetails(activity)}
                            className="text-black dark:text-white underline hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
                            title="Ver detalhes do negócio"
                          >
                            <div className="truncate max-w-[150px]" title={activity.contact_name && activity.contact_name !== '-' ? activity.contact_name : (activity.contact_phone || 'Sem nome')}>
                              {activity.contact_name && activity.contact_name !== '-' ? activity.contact_name : (activity.contact_phone || 'Sem nome')}
                            </div>
                          </button>
                        ) : (
                          <div className="truncate" title={activity.contact_name && activity.contact_name !== '-' ? activity.contact_name : (activity.contact_phone || 'Sem nome')}>
                            {activity.contact_name && activity.contact_name !== '-' ? activity.contact_name : (activity.contact_phone || 'Sem nome')}
                          </div>
                        )}
                      </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 w-[150px] max-w-[150px] dark:border-gray-700 dark:text-gray-200">
                      <div className="truncate" title={activity.responsible_name || ''}>
                        {activity.responsible_name}
                      </div>
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 text-center w-[150px] max-w-[150px] font-mono dark:border-gray-700 dark:text-gray-200">
                      <div className="truncate mx-auto" title={activity.contact_phone || ''}>
                        {activity.contact_phone}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        ) : (
          <div className="p-3 h-full overflow-hidden">
            {isLoading || !isDataReady ? (
              <div className="text-gray-500 dark:text-gray-400 text-sm">Carregando atividades...</div>
            ) : kanbanColumns.length === 0 ? (
              <div className="text-gray-500 dark:text-gray-400 text-sm">Nenhuma atividade encontrada.</div>
            ) : (
              <div className="h-full overflow-x-hidden">
                <div className="flex gap-3 h-full items-stretch w-full min-w-0">
                {kanbanColumns.map((col) => (
                  <div
                    key={col.name}
                    className="flex-1 min-w-0 bg-white border border-[#d4d4d4] dark:bg-[#111111] dark:border-gray-700 rounded-none flex flex-col h-full"
                  >
                    <div className="shrink-0 bg-[#f3f3f3] dark:bg-[#3a3a3a] border-b border-[#d4d4d4] dark:border-gray-700 px-2 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                          {col.name}
                        </div>
                        <Badge
                          variant="outline"
                          className="rounded-none text-[10px] h-5 px-1.5 border-gray-300 dark:border-gray-600"
                        >
                          {col.items.length}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                      {col.items.map((activity) => (
                        <div
                          key={activity.id}
                          className={cn(
                            "border border-[#e0e0e0] bg-white dark:bg-[#0f0f0f] dark:border-gray-700 rounded-none p-2",
                            "hover:bg-blue-50 dark:hover:bg-[#1f2937] transition-colors"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-gray-900 dark:text-gray-100 text-xs leading-tight line-clamp-2">
                              {activity.subject}
                            </div>
                          </div>

                          <div className="mt-1 text-[10px] text-gray-600 dark:text-gray-400">
                            {format(new Date(activity.scheduled_for), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </div>

                          <div className="mt-2 space-y-1 text-[10px] text-gray-700 dark:text-gray-300">
                            <div className="truncate">
                              <span className="text-gray-500 dark:text-gray-500">Pipeline:</span>{" "}
                              {activity.pipeline_name}
                            </div>
                            <div className="truncate">
                              <span className="text-gray-500 dark:text-gray-500">Etapa:</span>{" "}
                              {activity.stage_name}
                            </div>
                            <div className="truncate">
                              <span className="text-gray-500 dark:text-gray-500">Resp.:</span>{" "}
                              {activity.responsible_name}
                            </div>
                          </div>

                          <div className="mt-2">
                            {activity.pipeline_card_id ? (
                              <button
                                type="button"
                                onClick={() => handleOpenDealDetails(activity)}
                                className="text-[10px] text-black dark:text-white underline hover:opacity-80"
                                title="Ver detalhes do negócio"
                              >
                                {activity.contact_name && activity.contact_name !== "-"
                                  ? activity.contact_name
                                  : activity.contact_phone || "Sem nome"}
                              </button>
                            ) : (
                              <div className="text-[10px] text-gray-700 dark:text-gray-300 truncate">
                                {activity.contact_name && activity.contact_name !== "-"
                                  ? activity.contact_name
                                  : activity.contact_phone || "Sem nome"}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
        )}
        {viewMode === "list" && (
          <>
            {/* Footer fixo com paginação */}
            <div className="sticky bottom-0 left-0 right-0 bg-[#f8f9fa] dark:bg-[#141414] border-t border-gray-300 dark:border-gray-700 px-4 py-2 z-20">
              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-600 dark:text-gray-400">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Linhas {startIndex}-{endIndex} de {totalCount || 0}
                  </span>
                  <div className="flex items-center gap-1">
                    <span>Linhas/página:</span>
                    <Select value={String(pageSize)} onValueChange={(value) => {
                      const parsed = Number(value);
                      const normalized = Math.max(MIN_PAGE_SIZE, isNaN(parsed) ? DEFAULT_PAGE_SIZE : parsed);
                      setPageSize(normalized);
                      setPage(1);
                    }}>
                      <SelectTrigger className="h-7 w-24 rounded-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["10", "25", "50", "100", "200"].map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 border border-gray-300 rounded-sm disabled:opacity-50 dark:border-gray-700"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || isLoading}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {page} / {totalPages}
                  </span>
                  <button
                    className="px-2 py-1 border border-gray-300 rounded-sm disabled:opacity-50 dark:border-gray-700"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={isLoading || page >= totalPages}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <Sheet open={Boolean(selectedDealDetails)} onOpenChange={(open) => !open && handleCloseDealDetails()}>
        <SheetContent 
          side="right" 
          className="p-0 sm:max-w-[90vw] w-[90vw] border-l border-gray-200 dark:border-gray-800 shadow-2xl transition-all duration-500 ease-in-out [&>button.absolute]:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Detalhes do Negócio</SheetTitle>
          </SheetHeader>
          {selectedDealDetails && selectedDealDetails.cardId && (
            <DealDetailsPage 
              cardId={selectedDealDetails.cardId} 
              workspaceId={selectedWorkspace?.workspace_id || undefined}
              onClose={handleCloseDealDetails}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}