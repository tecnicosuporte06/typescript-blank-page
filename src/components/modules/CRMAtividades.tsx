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
  Columns
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
  const { selectedWorkspace } = useWorkspace();
  const { user, userRole } = useAuth();
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedDealDetails, setSelectedDealDetails] = useState<SelectedDealDetails | null>(null);
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

      let query = supabase
        .from("activities")
        .select("*")
        .eq("workspace_id", selectedWorkspace.workspace_id)
        .order("scheduled_for", { ascending: true });

      if (userRole === "user" && user?.id) {
        query = query.eq("responsible_id", user.id);
      }

      const { data: activitiesData, error } = await query;

      if (error) throw error;

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

      if (pipelineCardIds.length > 0) {
        const { data: cardsOnly } = await supabase
          .from("pipeline_cards")
          .select("id, description, pipeline_id, column_id, contact_id, status")
          .in("id", [...new Set(pipelineCardIds)]);

        const pipelineIds = Array.from(new Set(cardsOnly?.map((card) => card.pipeline_id).filter(Boolean))) as string[];
        const columnIds = Array.from(new Set(cardsOnly?.map((card) => card.column_id).filter(Boolean))) as string[];
        const contactIds = Array.from(new Set(cardsOnly?.map((card) => card.contact_id).filter(Boolean))) as string[];

        const { data: pipelinesData } = await supabase
          .from("pipelines")
          .select("id, name, workspace_id")
          .in("id", pipelineIds)
          .eq("workspace_id", selectedWorkspace.workspace_id);

        const allowedPipelineIds = new Set(pipelinesData?.map((pipeline) => pipeline.id));

        const { data: columnsData } = await supabase
          .from("pipeline_columns")
          .select("id, name, pipeline_id")
          .in("id", columnIds);

        const columnsMapById = new Map(columnsData?.map((column) => [column.id, column]));

        const { data: contactsData } = await supabase
          .from("contacts")
          .select("id, name, phone")
          .in("id", contactIds);

        const contactsMapById = new Map(contactsData?.map((contact) => [contact.id, contact]));

        cardsOnly?.forEach((card) => {
          if (!allowedPipelineIds.has(card.pipeline_id)) {
            return;
          }
          const pipelineInfo = pipelinesData?.find((pipeline) => pipeline.id === card.pipeline_id);
          const columnInfo = columnsMapById.get(card.column_id);
          const contactInfo = contactsMapById.get(card.contact_id || "");

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

          const pipelineName = card?.pipeline_name || "-";
          const stageName = card?.column_name || "-";
          const contactPhone = card?.contact_phone || "-";
          const contactName = card?.contact_name || card?.description || "-";
          const dealName = card?.description || "-";
          const contactId = item.contact_id || card?.contact_id || null;

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
  }, [selectedWorkspace?.workspace_id]);

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
      <div className="flex-1 overflow-auto bg-[#e6e6e6] dark:bg-[#050505]">
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
                  <td colSpan={8} className="border border-[#e0e0e0] text-center py-12 bg-gray-50 dark:border-gray-700 dark:bg-[#1a1a1a]">
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
                   <td className="border border-[#e0e0e0] bg-gray-50 dark:border-gray-700 dark:bg-[#1a1a1a]"></td>
                </tr>
              ))}
            </tbody>
          </table>
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

