import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { DealDetailsModal } from "@/components/modals/DealDetailsModal";

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

export function CRMAtividades() {
  const PAGE_SIZE = 50;
  const { selectedWorkspace } = useWorkspace();
  const { user, userRole } = useAuth();
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedDealDetails, setSelectedDealDetails] = useState<SelectedDealDetails | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const handleOpenDealDetails = (activity: ActivityData) => {
    if (!activity.pipeline_card_id) {
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
      console.log("🔄 Buscando atividades...");

      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

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
        const { data: cardsOnly, error: cardsError } = await supabase
          .from("pipeline_cards")
          .select("id, description, pipeline_id, column_id, contact_id, status")
          .in("id", [...new Set(pipelineCardIds)]);

        if (cardsError) {
          console.error("Erro ao buscar pipeline cards:", cardsError);
        }

        if (cardsOnly && cardsOnly.length > 0) {
          console.log(`📋 Pipeline cards encontrados: ${cardsOnly.length} de ${pipelineCardIds.length}`);
          const pipelineIds = Array.from(new Set(cardsOnly.map((card) => card.pipeline_id).filter(Boolean))) as string[];
          const columnIds = Array.from(new Set(cardsOnly.map((card) => card.column_id).filter(Boolean))) as string[];
          const cardContactIds = Array.from(new Set(cardsOnly.map((card) => card.contact_id).filter(Boolean))) as string[];

          // Adicionar contact_ids dos cards ao conjunto
          cardContactIds.forEach(id => allContactIds.add(id));

          const { data: pipelinesData, error: pipelinesError } = await supabase
            .from("pipelines")
            .select("id, name, workspace_id")
            .in("id", pipelineIds)
            .eq("workspace_id", selectedWorkspace.workspace_id);

          if (pipelinesError) {
            console.error("Erro ao buscar pipelines:", pipelinesError);
          }

          const allowedPipelineIds = new Set(pipelinesData?.map((pipeline) => pipeline.id) || []);
          console.log(`🔷 Pipelines encontrados: ${pipelinesData?.length || 0} de ${pipelineIds.length}`);

          const { data: columnsData } = await supabase
            .from("pipeline_columns")
            .select("id, name, pipeline_id")
            .in("id", columnIds);

          const columnsMapById = new Map(columnsData?.map((column) => [column.id, column]));

          // Buscar contatos dos cards (se ainda não foram buscados)
          if (cardContactIds.length > 0) {
            const missingContactIds = cardContactIds.filter(id => !directContactsMap.has(id));
            if (missingContactIds.length > 0) {
              const { data: cardContactsData, error: cardContactsError } = await supabase
                .from("contacts")
                .select("id, name, phone")
                .in("id", missingContactIds)
                .eq("workspace_id", selectedWorkspace.workspace_id);

              if (cardContactsError) {
                console.error("Erro ao buscar contatos dos cards:", cardContactsError);
              }

              cardContactsData?.forEach((contact) => {
                directContactsMap.set(contact.id, {
                  name: contact.name || "-",
                  phone: contact.phone || "-",
                });
              });
            }
          }

          cardsOnly.forEach((card) => {
            if (!allowedPipelineIds.has(card.pipeline_id)) {
              // Mesmo que o pipeline não esteja no workspace, ainda podemos usar os dados do card
              // para mostrar informações básicas
              const contactInfo = directContactsMap.get(card.contact_id || "");
              pipelineCardsMap.set(card.id, {
                description: card.description,
                pipeline_id: card.pipeline_id,
                pipeline_name: "-", // Pipeline não permitido
                column_id: card.column_id,
                column_name: "-",
                contact_id: card.contact_id,
                contact_name: contactInfo?.name || card.description || "-",
                contact_phone: contactInfo?.phone || "-",
                status: card.status,
                pipeline_workspace_id: null,
              });
              return;
            }
            const pipelineInfo = pipelinesData?.find((pipeline) => pipeline.id === card.pipeline_id);
            const columnInfo = columnsMapById.get(card.column_id);
            const contactInfo = directContactsMap.get(card.contact_id || "");

            pipelineCardsMap.set(card.id, {
              description: card.description,
              pipeline_id: card.pipeline_id,
              pipeline_name: pipelineInfo?.name || "-",
              column_id: card.column_id,
              column_name: columnInfo?.name || "-",
              contact_id: card.contact_id,
              contact_name: contactInfo?.name || card.description || "-",
              contact_phone: contactInfo?.phone || "-",
              status: card.status,
              pipeline_workspace_id: pipelineInfo?.workspace_id,
            });
          });
        }
      }

      const formattedActivities: ActivityData[] = activitiesData
        .map((item: any) => {
          if (item.is_completed) {
            return null;
          }
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
    } catch (error: any) {
      console.error("Erro ao buscar atividades:", error);
      toast({
        title: "Erro",
        description: error?.message || "Não foi possível carregar as atividades.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [selectedWorkspace?.workspace_id, page]);

  const filteredActivities = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return activities.filter((activity) => {
      const matchesSubject = activity.subject.toLowerCase().includes(term);
      const matchesDeal = activity.deal_name?.toLowerCase().includes(term);
      const matchesResponsible = activity.responsible_name?.toLowerCase().includes(term);
      const matchesPipeline = activity.pipeline_name?.toLowerCase().includes(term);
      const matchesContact = activity.contact_name?.toLowerCase().includes(term);
      return matchesSubject || matchesDeal || matchesResponsible || matchesPipeline || matchesContact;
    });
  }, [activities, searchTerm]);

  return (
    <div className="flex flex-col h-full bg-white border border-gray-300 m-2 shadow-sm font-sans text-xs dark:bg-[#0e0e0e] dark:border-gray-700 dark:text-gray-100">
      {/* Toolbar */}
      <div className="flex flex-col border-b border-gray-300 bg-[#f8f9fa] dark:border-gray-700 dark:bg-[#141414]">
        <div className="flex items-center justify-between px-4 py-1 bg-primary text-primary-foreground h-8">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            <span className="font-semibold text-sm">Atividades</span>
          </div>
          <div className="text-[10px] opacity-80 dark:text-gray-200">
            {isLoading ? "Carregando..." : `${filteredActivities.length} registros`}
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 overflow-x-auto">
          <div className="relative w-48">
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

      {/* Table */}
      <div className="flex-1 overflow-auto bg-[#e6e6e6] dark:bg-[#050505] relative">
        <div className="inline-block min-w-full align-middle bg-white dark:bg-[#111111]">
          <table className="min-w-full border-collapse bg-white text-xs font-sans dark:bg-[#111111] dark:text-gray-100">
            <thead className="bg-[#f3f3f3] sticky top-0 z-10 dark:bg-[#1f1f1f]">
              <tr>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                  <div className="flex items-center gap-1">
                    <MapIcon className="h-3 w-3 text-gray-400" />
                    <span>Pipeline</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                  <div className="flex items-center gap-1">
                    <Tag className="h-3 w-3 text-gray-400" />
                    <span>Tipo da Atividade</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[200px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-gray-400" />
                    <span>Assunto</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-center font-semibold text-gray-700 min-w-[120px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                   <div className="flex items-center justify-center gap-1">
                    <CalendarClock className="h-3 w-3 text-gray-400" />
                    <span>Data Prevista</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                   <div className="flex items-center gap-1">
                    <Columns className="h-3 w-3 text-gray-400" />
                    <span>Etapa</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[200px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                   <div className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3 text-gray-400" />
                    <span>Nome</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                   <div className="flex items-center gap-1">
                    <User className="h-3 w-3 text-gray-400" />
                    <span>Responsável</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-center font-semibold text-gray-700 min-w-[120px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                   <div className="flex items-center justify-center gap-1">
                    <Phone className="h-3 w-3 text-gray-400" />
                    <span>Telefone</span>
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-center font-semibold text-gray-700 w-10 dark:border-gray-700 dark:text-gray-200">
                  <Checkbox
                    checked={
                      filteredActivities.length > 0 && filteredActivities.every((a) => selectedIds.includes(a.id))
                    }
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedIds(filteredActivities.map((a) => a.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="h-3 w-3 rounded-[2px] border-gray-500 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
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
                    <td className="border border-[#e0e0e0] px-2 py-0 whitespace-nowrap dark:border-gray-700 dark:text-gray-200">
                      {activity.pipeline_name}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 whitespace-nowrap dark:border-gray-700 dark:text-gray-200">
                      {activity.type || "-"}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 whitespace-nowrap dark:border-gray-700 dark:text-gray-200 font-medium">
                      {activity.subject}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 text-center whitespace-nowrap dark:border-gray-700 dark:text-gray-200">
                      {format(new Date(activity.scheduled_for), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 whitespace-nowrap dark:border-gray-700 dark:text-gray-200">
                      <Badge variant="outline" className="rounded-none font-normal border-gray-300 dark:border-gray-600">
                        {activity.stage_name}
                      </Badge>
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 whitespace-nowrap dark:border-gray-700 dark:text-gray-200">
                      {activity.pipeline_card_id ? (
                        <button
                          type="button"
                          onClick={() => handleOpenDealDetails(activity)}
                          className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm dark:text-yellow-300"
                          title="Ver detalhes do negócio"
                        >
                          {activity.contact_name || "-"}
                        </button>
                      ) : (
                        activity.contact_name || "-"
                      )}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 whitespace-nowrap dark:border-gray-700 dark:text-gray-200">
                      {activity.responsible_name}
                    </td>
                    <td className="border border-[#e0e0e0] px-2 py-0 text-center whitespace-nowrap font-mono dark:border-gray-700 dark:text-gray-200">
                      {activity.contact_phone}
                    </td>
                    <td className="border border-[#e0e0e0] px-1 py-0 text-center bg-gray-50 dark:bg-[#111111] dark:border-gray-700">
                      <Checkbox
                        checked={selectedIds.includes(activity.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedIds((prev) => [...prev, activity.id]);
                          } else {
                            setSelectedIds((prev) => prev.filter((id) => id !== activity.id));
                          }
                        }}
                        className="h-3 w-3 rounded-[2px] border-gray-400 data-[state=checked]:bg-primary data-[state=checked]:border-primary dark:border-gray-500"
                      />
                    </td>
                  </tr>
                ))
              )}
              {filteredActivities.length > 0 && Array.from({ length: Math.max(0, 20 - filteredActivities.length) }).map((_, i) => (
                <tr key={`empty-${i}`} className="h-[32px]">
                   <td className="border border-[#e0e0e0] dark:border-gray-700"></td>
                   <td className="border border-[#e0e0e0] dark:border-gray-700"></td>
                   <td className="border border-[#e0e0e0] dark:border-gray-700"></td>
                   <td className="border border-[#e0e0e0] dark:border-gray-700"></td>
                   <td className="border border-[#e0e0e0] dark:border-gray-700"></td>
                   <td className="border border-[#e0e0e0] dark:border-gray-700"></td>
                   <td className="border border-[#e0e0e0] dark:border-gray-700"></td>
                   <td className="border border-[#e0e0e0] dark:border-gray-700"></td>
                   <td className="border border-[#e0e0e0] bg-gray-50 dark:border-gray-700 dark:bg-[#1a1a1a]"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Footer fixo com paginação */}
        <div className="sticky bottom-0 left-0 right-0 bg-[#f8f9fa] dark:bg-[#141414] border-t border-gray-300 dark:border-gray-700 px-4 py-2 z-20">
          <div className="flex items-center justify-center gap-2 text-[11px] text-gray-600 dark:text-gray-400">
            <button
              className="px-2 py-1 border border-gray-300 rounded-sm disabled:opacity-50 dark:border-gray-700"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              Anterior
            </button>
            <span>
              Página {page} • {Math.ceil((totalCount || 0) / PAGE_SIZE) || 1}
            </span>
            <button
              className="px-2 py-1 border border-gray-300 rounded-sm disabled:opacity-50 dark:border-gray-700"
              onClick={() => setPage((p) => (p * PAGE_SIZE < totalCount ? p + 1 : p))}
              disabled={isLoading || page * PAGE_SIZE >= totalCount}
            >
              Próxima
            </button>
            <span className="opacity-70">
              {filteredActivities.length} registros
            </span>
          </div>
        </div>
      </div>
      {selectedDealDetails && (
        <DealDetailsModal
          isOpen={Boolean(selectedDealDetails)}
          onClose={handleCloseDealDetails}
          dealName={selectedDealDetails.dealName || "Negócio"}
          contactNumber={selectedDealDetails.contactPhone || ""}
          cardId={selectedDealDetails.cardId}
          currentColumnId={selectedDealDetails.columnId || ""}
          currentPipelineId={selectedDealDetails.pipelineId || ""}
          contactData={{
            id: selectedDealDetails.contactId || "",
            name: selectedDealDetails.contactName || "Contato",
            phone: selectedDealDetails.contactPhone || "",
          }}
          defaultTab="atividades"
        />
      )}
    </div>
  );
}