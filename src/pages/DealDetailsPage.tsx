import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, Check, X, ChevronDown, Plus, Pencil, User, Mail, FileText, File, 
  Image as ImageIcon, ChevronRight, RefreshCw, Tag, DollarSign, CheckSquare, 
  Circle, MoreVertical, List, ChevronsUpDown, Clock, Phone, 
  Calendar as CalendarIconLucide, Video, MapPin, CheckCircle2, Copy, Link2, 
  Building2, Info, Lock, MessageSquare as MessageSquareIcon, 
  FileText as FileTextIcon, Mail as MailIcon, File as FileIcon, Receipt, 
  CheckCircle, Bold, Italic, Underline, ListOrdered, AlignLeft, 
  AlignRight, Strikethrough, AtSign, Music, Upload, Download 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineColumns } from "@/hooks/usePipelineColumns";
import { useWorkspaceHeaders } from "@/lib/workspaceHeaders";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInDays, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useCardHistory, cardHistoryQueryKey } from "@/hooks/useCardHistory";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddContactTagButton } from "@/components/chat/AddContactTagButton";
import { AttachmentPreviewModal } from "@/components/modals/AttachmentPreviewModal";
import { MarkAsLostModal } from "@/components/modals/MarkAsLostModal";

interface DealDetailsPageProps {
  cardId?: string;
  workspaceId?: string;
  onClose?: () => void;
}

export function DealDetailsPage({ cardId: propCardId, workspaceId: propWorkspaceId, onClose }: DealDetailsPageProps = {}) {
  const { cardId: paramCardId, workspaceId: paramWorkspaceId } = useParams<{ cardId: string; workspaceId: string }>();
  
  const cardId = propCardId || paramCardId;
  const urlWorkspaceId = propWorkspaceId || paramWorkspaceId;
  
  const navigate = useNavigate();
  const { selectedWorkspace } = useWorkspace();
  const { user: authUser, userRole } = useAuth();
  const effectiveWorkspaceId = urlWorkspaceId || selectedWorkspace?.workspace_id;
  const { getHeaders } = useWorkspaceHeaders();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [cardData, setCardData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dealName, setDealName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [currentColumn, setCurrentColumn] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [contact, setContact] = useState<any>(null);
  const [contactExtraInfo, setContactExtraInfo] = useState<{ field_name: string; field_value: string | null }[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());
  const [users, setUsers] = useState<any[]>([]);
  const [contactTags, setContactTags] = useState<any[]>([]);
  const [cardProducts, setCardProducts] = useState<any[]>([]);
const [isProductModalOpen, setIsProductModalOpen] = useState(false);
const [availableProducts, setAvailableProducts] = useState<any[]>([]);
const [selectedProductId, setSelectedProductId] = useState<string>("");
const [manualValue, setManualValue] = useState<string>("");
  const [isEditingContactName, setIsEditingContactName] = useState(false);
  const [tempContactName, setTempContactName] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<any | null>(null);
  
  // Estados para anotações
  const [noteContent, setNoteContent] = useState("");
  const noteContentRef = useRef<HTMLDivElement>(null);
  
  // Estados para histórico
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  
  // Estados para modal de seleção de coluna
  const [isColumnSelectModalOpen, setIsColumnSelectModalOpen] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string>("");
  
  // Estado para popover de ações do card
  const [isCardActionsPopoverOpen, setIsCardActionsPopoverOpen] = useState(false);
  
// Estados para edição a partir do histórico
const [selectedActivityForEdit, setSelectedActivityForEdit] = useState<any | null>(null);
const [isActivityEditModalOpen, setIsActivityEditModalOpen] = useState(false);
const [activityEditForm, setActivityEditForm] = useState({
  type: "Ligação abordada",
  subject: "",
  description: "",
  priority: "normal",
  availability: "livre",
  startDate: new Date(),
  startTime: "13:00",
  endDate: new Date(),
  endTime: "13:30",
  responsibleId: "",
  markAsDone: false
});

const [selectedNoteForEdit, setSelectedNoteForEdit] = useState<any | null>(null);
const [noteEditContent, setNoteEditContent] = useState("");
const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
const [editingNoteContent, setEditingNoteContent] = useState("");
  const [pipelineActions, setPipelineActions] = useState<any[]>([]);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
const [confirmLossAction, setConfirmLossAction] = useState<any | null>(null);
const [isMarkAsLostModalOpen, setIsMarkAsLostModalOpen] = useState(false);
const [isMarkingAsLost, setIsMarkingAsLost] = useState(false);

  // Estados para visão geral
  const [overviewData, setOverviewData] = useState<{
    businessAge: number;
    inactiveDays: number;
    createdAt: string;
    activityStats: Array<{ type: string; count: number; percentage: number }>;
    userStats: Array<{ name: string; count: number; percentage: number }>;
  } | null>(null);
  
  // Usar hook de histórico
  const { data: historyEvents = [], isLoading: isLoadingHistory } = useCardHistory(cardId || "", contact?.id);
  
  // Estados para formulário de atividade
  const [activityForm, setActivityForm] = useState({
    type: "Ligação abordada",
    subject: "",
    description: "",
    priority: "normal",
    availability: "livre",
    startDate: new Date(),
    startTime: "13:00",
    endDate: new Date(),
    endTime: "13:30",
    responsibleId: "",
    location: "",
    videoCall: false,
    markAsDone: false
  });
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [selectedStartHour, setSelectedStartHour] = useState<number>(13);
  const [selectedStartMinute, setSelectedStartMinute] = useState<number>(0);
  const [selectedEndHour, setSelectedEndHour] = useState<number>(13);
  const [selectedEndMinute, setSelectedEndMinute] = useState<number>(30);
  
// Estados para seleção de datas/horas no modal de edição
const [showEditStartDatePicker, setShowEditStartDatePicker] = useState(false);
const [showEditEndDatePicker, setShowEditEndDatePicker] = useState(false);
const [showEditStartTimePicker, setShowEditStartTimePicker] = useState(false);
const [showEditEndTimePicker, setShowEditEndTimePicker] = useState(false);
const [editSelectedStartHour, setEditSelectedStartHour] = useState<number>(13);
const [editSelectedEndHour, setEditSelectedEndHour] = useState<number>(13);

const formatDateToInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTime = (date: Date) => {
  return format(date, "HH:mm");
};

const humanizeLabel = (label: string) => {
  if (!label) return "";
  const cleaned = label.replace(/[_-]+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

  const additionalContactInfo = useMemo(() => {
    const entries: { label: string; value: string }[] = [];

    const pushFromObject = (obj?: Record<string, any>) => {
      if (obj && typeof obj === "object") {
        Object.entries(obj).forEach(([key, value]) => {
          if (value === null || value === undefined) return;
          const strValue = String(value).trim();
          if (!strValue) return;
          entries.push({
            label: humanizeLabel(key),
            value: strValue,
          });
        });
      }
    };

    pushFromObject(contact?.extra_info as Record<string, any>);
    pushFromObject(contact?.additional_info as Record<string, any>);
    pushFromObject(contact?.custom_fields as Record<string, any>);

    contactExtraInfo.forEach((field) => {
      if (!field.field_name) return;
      const val = field.field_value ?? "";
      const strValue = String(val).trim();
      if (!strValue) return;
      entries.push({
        label: humanizeLabel(field.field_name),
        value: strValue,
      });
    });

    return entries;
  }, [contact, contactExtraInfo]);

  // Buscar dados do card
  const fetchCardData = useCallback(async () => {
    if (!cardId || !effectiveWorkspaceId) return;

    setIsLoading(true);
    try {
      const headers = getHeaders();
      if (!headers) {
        throw new Error('Não foi possível obter headers do workspace');
      }
      
      // Buscar card completo
      const { data: card, error: cardError } = await supabase.functions.invoke(
        `pipeline-management/cards?id=${cardId}`,
        {
          method: 'GET',
          headers
        }
      );

      if (cardError) throw cardError;
      if (!card) throw new Error('Card não encontrado');

      setCardData(card);
      setDealName(card.description || "Negócio");
      
      // Se o card já trouxer responsible_user, usar ele
      if (card.responsible_user) {
        setOwner(card.responsible_user);
      }
      
      // Buscar pipeline
      if (card.pipeline_id) {
        const { data: pipeline, error: pipelineError } = await supabase
          .from('pipelines')
          .select('*')
          .eq('id', card.pipeline_id)
          .eq('workspace_id', effectiveWorkspaceId)
          .maybeSingle();
        
        if (!pipelineError && pipeline) {
          setPipelineData(pipeline);
          // Buscar as ações configuradas para este pipeline
          fetchPipelineActions(pipeline.id);
        }
      }

      // Buscar coluna atual
      if (card.column_id) {
        const { data: column, error: columnError } = await supabase
          .from('pipeline_columns')
          .select('*')
          .eq('id', card.column_id)
          .maybeSingle();
        
        if (!columnError && column) {
          setCurrentColumn(column);
        }
      }

      // Buscar contato
      setContactExtraInfo([]);

      if (card.contact_id) {
        const { data: contactData, error: contactError } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', card.contact_id)
          .maybeSingle();
        
        if (!contactError && contactData) {
          setContact(contactData);

          // Buscar campos extras dinâmicos do contato
          try {
            const { data: extraInfoData, error: extraInfoError } = await supabase
              .from("contact_extra_info")
              .select("field_name, field_value")
              .eq("contact_id", card.contact_id)
              .order("created_at", { ascending: true });

            if (!extraInfoError && extraInfoData) {
              setContactExtraInfo(extraInfoData.filter((f) => f.field_name));
            }
          } catch (extraErr) {
            console.error("Erro ao buscar campos extras do contato:", extraErr);
          }
          
          // Buscar tags do contato
          const { data: tagsData } = await supabase
            .from('contact_tags')
            .select(`
              tag_id,
              tags!contact_tags_tag_id_fkey(id, name, color)
            `)
            .eq('contact_id', card.contact_id);
          
          if (tagsData) {
            const tags = tagsData
              .map((ct: any) => ct.tags)
              .filter(Boolean);
            setContactTags(tags);
          }
        }
      }
      
      // Buscar produtos do card
      if (cardId) {
        const { data: productsData } = await supabase
          .from('pipeline_cards_products')
          .select(`
            *,
            product:products(id, name, value)
          `)
          .eq('pipeline_card_id', cardId);
        
        if (productsData) {
          setCardProducts(productsData);
        }
      }

      // Buscar proprietário (responsible_user_id) - usar system_users
      if (card.responsible_user_id) {
        const { data: userData, error: userError } = await supabase
          .from('system_users')
          .select('id, name, profile_image_url, profile')
          .eq('id', card.responsible_user_id)
          .maybeSingle();
        
        if (!userError && userData) {
          setOwner(userData);
        }
      }

    } catch (error) {
      console.error('Erro ao buscar card:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados do negócio.",
        variant: "destructive",
      });
      // Redirecionar para o pipeline
      if (onClose) {
        onClose();
        return;
      }
      const pipelinePath = (userRole === 'master' && effectiveWorkspaceId) 
        ? `/workspace/${effectiveWorkspaceId}/pipeline` 
        : '/pipeline';
      navigate(pipelinePath);
    } finally {
      setIsLoading(false);
    }
  }, [cardId, effectiveWorkspaceId, getHeaders, navigate, toast]);

  // Função para excluir card
  const handleDeleteCard = useCallback(async () => {
    if (!cardId) return;
    
    try {
      const headers = getHeaders();
      if (!headers) {
        throw new Error('Não foi possível obter headers do workspace');
      }

      const { error } = await supabase.functions.invoke(
        `pipeline-management/cards?id=${cardId}`,
        {
          method: 'DELETE',
          headers
        }
      );

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Negócio excluído permanentemente.",
      });

      // Redirecionar para o pipeline
      if (onClose) {
        onClose();
        return;
      }
      const pipelinePath = (userRole === 'master' && effectiveWorkspaceId) 
        ? `/workspace/${effectiveWorkspaceId}/pipeline` 
        : '/pipeline';
      navigate(pipelinePath);
    } catch (error: any) {
      console.error('Erro ao excluir card:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível excluir o negócio.",
        variant: "destructive",
      });
    }
  }, [cardId, getHeaders, effectiveWorkspaceId, navigate, toast]);

  // Função para mover card para outra coluna
  const handleMoveCardToColumn = useCallback(async (newColumnId: string) => {
    if (!cardId || !newColumnId || newColumnId === cardData?.column_id) {
      return;
    }

    try {
      const headers = getHeaders();
      if (!headers) {
        throw new Error('Não foi possível obter headers do workspace');
      }

      const { error } = await supabase.functions.invoke(
        `pipeline-management/cards?id=${cardId}`,
        {
          method: 'PUT',
          headers,
          body: { column_id: newColumnId }
        }
      );

      if (error) throw error;

      toast({
        title: "Card movido",
        description: "O card foi movido para a nova coluna com sucesso.",
      });

      // Recarregar dados do card
      await fetchCardData();
      setIsColumnSelectModalOpen(false);
    } catch (error: any) {
      console.error('Erro ao mover card:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível mover o card.",
        variant: "destructive"
      });
    }
  }, [cardId, cardData?.column_id, getHeaders, fetchCardData, toast]);

  useEffect(() => {
    fetchCardData();
  }, [fetchCardData]);

  // Buscar usuários para o select de responsável
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('system_users')
          .select('id, name')
          .order('name');

        if (error) throw error;
        setUsers(data || []);
      } catch (error) {
        console.error('Erro ao buscar usuários:', error);
      }
    };

    fetchUsers();
  }, []);

  // Buscar produtos disponíveis
  useEffect(() => {
    const fetchProducts = async () => {
      if (!effectiveWorkspaceId) return;
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, value')
          .eq('workspace_id', effectiveWorkspaceId)
          .order('name');

        if (error) throw error;
        setAvailableProducts(data || []);
      } catch (error) {
        console.error('Erro ao buscar produtos:', error);
      }
    };

    fetchProducts();
  }, [effectiveWorkspaceId]);

  // Buscar atividades do card
  const fetchActivities = useCallback(async () => {
    if (!cardId || !contact?.id) return;

    setIsLoadingActivities(true);
    try {
      const { data: allActivities, error } = await supabase
        .from('activities')
        .select('*')
        .eq('contact_id', contact.id)
        .order('scheduled_for', { ascending: true });

      if (error) throw error;

      // Filtrar atividades do card ou globais
      const filteredActivities = allActivities?.filter(activity => 
        activity.pipeline_card_id === cardId || activity.pipeline_card_id === null
      ) || [];

      setActivities(filteredActivities);
    } catch (error) {
      console.error('Erro ao buscar atividades:', error);
    } finally {
      setIsLoadingActivities(false);
    }
  }, [cardId, contact?.id]);

  useEffect(() => {
    if (contact?.id && cardId) {
      fetchActivities();
    }
  }, [contact?.id, cardId, fetchActivities]);

  // Calcular dados da visão geral
  useEffect(() => {
    if (!cardData || !cardData.created_at) {
      setOverviewData(null);
      return;
    }

    const calculateOverview = () => {
      try {
        // Idade do negócio (dias desde criação)
        const createdAt = new Date(cardData.created_at);
        if (isNaN(createdAt.getTime())) {
          console.error('Data de criação inválida:', cardData.created_at);
          setOverviewData(null);
          return;
        }
        const now = new Date();
        const businessAge = Math.max(0, differenceInDays(now, createdAt));

      // Dias inativos (dias desde última atividade)
      let inactiveDays = 0;
      if (activities.length > 0) {
        const lastActivity = activities
          .map(a => new Date(a.scheduled_for || a.created_at))
          .sort((a, b) => b.getTime() - a.getTime())[0];
        inactiveDays = differenceInDays(now, lastActivity);
      } else {
        // Se não há atividades, dias inativos = idade do negócio
        inactiveDays = businessAge;
      }

      // Estatísticas de atividades por tipo
      const activityCounts: Record<string, number> = {};
      activities.forEach(activity => {
        const type = activity.type || 'Outras';
        activityCounts[type] = (activityCounts[type] || 0) + 1;
      });

      const totalActivities = activities.length;
      const activityStats = Object.entries(activityCounts)
        .map(([type, count]) => ({
          type,
          count,
          percentage: totalActivities > 0 ? Math.round((count / totalActivities) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4); // Top 4

      // Estatísticas de usuários mais ativos
      const userCounts: Record<string, { name: string; count: number }> = {};
      activities.forEach(activity => {
        if (activity.responsible_id) {
          const user = users.find(u => u.id === activity.responsible_id);
          if (user) {
            if (!userCounts[activity.responsible_id]) {
              userCounts[activity.responsible_id] = { name: user.name, count: 0 };
            }
            userCounts[activity.responsible_id].count++;
          }
        }
      });

      const userStats = Object.values(userCounts)
        .map(({ name, count }) => ({
          name,
          count,
          percentage: totalActivities > 0 ? Math.round((count / totalActivities) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5

        setOverviewData({
          businessAge,
          inactiveDays,
          createdAt: format(createdAt, "d 'de' MMMM 'de' yyyy", { locale: ptBR }),
          activityStats,
          userStats
        });
      } catch (error) {
        console.error('Erro ao calcular visão geral:', error);
        setOverviewData(null);
      }
    };

    calculateOverview();
  }, [cardData, activities, users]);

  const { columns } = usePipelineColumns(pipelineData?.id || null, effectiveWorkspaceId);
  const [timeInColumns, setTimeInColumns] = useState<Record<string, number>>({});

  // Verificar se cardId existe antes de renderizar
  if (!cardId) {
    return (
      <div className="h-screen flex flex-col bg-white dark:bg-[#0f0f0f]">
        <div className={cn("px-6 py-4 border-b shrink-0 bg-white dark:bg-[#0f0f0f] border-gray-200 dark:border-gray-700")}>
          <div className="flex items-center gap-4">
            {!onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const pipelinePath = (userRole === 'master' && effectiveWorkspaceId) 
                    ? `/workspace/${effectiveWorkspaceId}/pipeline` 
                    : '/pipeline';
                  navigate(pipelinePath);
                }}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <span className="text-sm font-medium">Voltar ao Pipeline</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400">Card ID não encontrado.</p>
          </div>
        </div>
      </div>
    );
  }

  const generateTimeOptions = () => {
    const times = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        const h = hour.toString().padStart(2, '0');
        const m = minute.toString().padStart(2, '0');
        times.push(`${h}:${m}`);
      }
    }
    return times;
  };

  const timeOptions = generateTimeOptions();

  // Calcular tempo em cada coluna
  useEffect(() => {
    if (!cardId || !cardData) {
      setTimeInColumns({});
      return;
    }

    const fetchColumnHistory = async () => {
      try {
        const { data: history } = await supabase
          .from('pipeline_card_history')
          .select('*')
          .eq('card_id', cardId)
          .eq('action', 'column_changed')
          .order('changed_at', { ascending: true });

        const timeInColumns: Record<string, number> = {};

        if (!history || history.length === 0) {
          // Se não há histórico, o card está na coluna atual desde a criação
          const cardCreatedAt = new Date(cardData.created_at || Date.now());
          const now = new Date();
          const days = differenceInDays(now, cardCreatedAt);
          if (days >= 1) {
            timeInColumns[cardData.column_id] = days;
          } else {
            const hours = differenceInHours(now, cardCreatedAt);
            if (hours >= 24) {
              timeInColumns[cardData.column_id] = 1;
            }
          }
          setTimeInColumns(timeInColumns);
          return;
        }

        // Encontrar quando o card foi criado
        const cardCreatedAt = new Date(cardData.created_at || Date.now());
        
        // Processar cada mudança de coluna
        let lastColumnId = (history[0]?.metadata as any)?.old_column_id || cardData.column_id;
        let lastChangeTime = cardCreatedAt;

        for (const event of history) {
          const changeTime = new Date(event.changed_at);
          const fromColumn = (event.metadata as any)?.old_column_id;
          const toColumn = (event.metadata as any)?.new_column_id;

          if (fromColumn && lastColumnId === fromColumn) {
            // Calcular dias na coluna anterior
            const days = differenceInDays(changeTime, lastChangeTime);
            if (days >= 1) {
              timeInColumns[fromColumn] = (timeInColumns[fromColumn] || 0) + days;
            } else {
              // Se menos de 1 dia, verificar horas
              const hours = differenceInHours(changeTime, lastChangeTime);
              if (hours >= 24) {
                timeInColumns[fromColumn] = (timeInColumns[fromColumn] || 0) + 1;
              }
            }
          }

          lastColumnId = toColumn || lastColumnId;
          lastChangeTime = changeTime;
        }

        // Calcular tempo na coluna atual (desde a última mudança até agora)
        if (lastColumnId === cardData.column_id) {
          const now = new Date();
          const days = differenceInDays(now, lastChangeTime);
          if (days >= 1) {
            timeInColumns[cardData.column_id] = (timeInColumns[cardData.column_id] || 0) + days;
          } else {
            const hours = differenceInHours(now, lastChangeTime);
            if (hours >= 24) {
              timeInColumns[cardData.column_id] = (timeInColumns[cardData.column_id] || 0) + 1;
            }
          }
        }

        setTimeInColumns(timeInColumns);
      } catch (error) {
        console.error('Erro ao calcular tempo nas colunas:', error);
        setTimeInColumns({});
      }
    };

    fetchColumnHistory();
  }, [cardId, cardData?.column_id, cardData?.created_at]);

  const handleSaveName = async () => {
    if (!cardId) return;
    
    try {
      const headers = getHeaders();
      const { error } = await supabase.functions.invoke(
        'pipeline-management/cards',
        {
          method: 'PUT',
          headers,
          body: {
            id: cardId,
            description: dealName
          }
        }
      );

      if (error) throw error;

      setIsEditingName(false);
      toast({
        title: "Sucesso",
        description: "Nome do negócio atualizado.",
      });
    } catch (error) {
      console.error('Erro ao salvar nome:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o nome do negócio.",
        variant: "destructive",
      });
    }
  };

  const handleMarkAsWon = async () => {
    // Manter por compatibilidade se necessário, mas vamos preferir executeAction
    if (!cardId) return;
    
    try {
      const headers = getHeaders();
      const { error } = await supabase.functions.invoke(
        'pipeline-management/cards',
        {
          method: 'PUT',
          headers,
          body: {
            id: cardId,
            status: 'ganho'
          }
        }
      );

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Negócio marcado como ganho.",
      });
      
      fetchCardData();
    } catch (error) {
      console.error('Erro ao marcar como ganho:', error);
      toast({
        title: "Erro",
        description: "Não foi possível marcar o negócio como ganho.",
        variant: "destructive",
      });
    }
  };

  const fetchPipelineActions = useCallback(async (pipelineId: string) => {
    try {
      const headers = getHeaders();
      if (!headers) return;

      const { data, error } = await supabase.functions.invoke(
        `pipeline-management/actions?pipeline_id=${pipelineId}`,
        {
          method: 'GET',
          headers
        }
      );

      if (!error) {
        // Garantir que as 3 ações padrão existam, preservando configurações do banco
        const standardStates = [
          { state: 'Ganho', defaultName: 'Ganho', id: 'std-ganho' },
          { state: 'Perda', defaultName: 'Perdido', id: 'std-perdido' },
          { state: 'Aberto', defaultName: 'Reabrir', id: 'std-reabrir' }
        ];

        const dbActions = data || [];
        const finalActions = [...dbActions];

        // Verificar quais estados padrão estão faltando e adicionar
        standardStates.forEach(std => {
          const exists = dbActions.some((a: any) => a.deal_state === std.state);
          if (!exists) {
            finalActions.push({
              id: std.id,
              action_name: std.defaultName,
              deal_state: std.state,
              target_pipeline_id: null,
              target_column_id: null
            });
          }
        });

        setPipelineActions(finalActions);
      }
    } catch (error) {
      console.error('Erro ao buscar ações do pipeline:', error);
    }
  }, [getHeaders]);

  const executeAction = async (action: any) => {
    if (!cardId || isExecutingAction) return;

    const actionState = (action?.deal_state || '').toString().toLowerCase();
    const actionName = (action?.action_name || '').toString().toLowerCase();
    const isLossAction =
      actionState === 'perda' ||
      actionState === 'perdido' ||
      actionState.includes('perda') ||
      actionName.includes('perda') ||
      actionName.includes('perdido');

    // Abrir modal para ações de perda
    if (isLossAction) {
      setConfirmLossAction(action);
      setIsMarkAsLostModalOpen(true);
      return;
    }

    setIsExecutingAction(true);

    try {
      const headers = getHeaders();
      if (!headers) throw new Error('Não foi possível obter headers do workspace');

      const body: any = {
        id: cardId
      };

      // Determinar o novo status baseado na regra da ação
      const statusMap: Record<string, string> = {
        'Ganho': 'ganho',
        'Perda': 'perda',
        'Aberto': 'aberto'
      };
      
      const newStatus = statusMap[action.deal_state] || 'aberto';
      body.status = newStatus;

      // Verificar se há transferência configurada - garantir que não enviamos strings vazias
      if (action.target_pipeline_id && action.target_pipeline_id.trim() !== "") {
        body.pipeline_id = action.target_pipeline_id;
      }
      
      if (action.target_column_id && action.target_column_id.trim() !== "") {
        body.column_id = action.target_column_id;
      }

      console.log('🚀 Executando ação de pipeline:', {
        action: action.action_name,
        body
      });

      // ✅ CORREÇÃO: Passar o ID na URL para a Edge Function
      const { error } = await supabase.functions.invoke(`pipeline-management/cards?id=${cardId}`, {
        method: 'PUT',
        headers,
        body
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Negócio marcado como ${action.action_name.toLowerCase()}.`,
      });

      // Recarregar dados do card
      await fetchCardData();
      
      // Se houve transferência de pipeline, carregar as ações do novo pipeline
      if (body.pipeline_id && body.pipeline_id !== cardData?.pipeline_id) {
        await fetchPipelineActions(body.pipeline_id);
      }

    } catch (error: any) {
      console.error('Erro ao executar ação:', error);
      toast({
        title: "Erro ao executar ação",
        description: error.message || "Não foi possível realizar a ação.",
        variant: "destructive",
      });
    } finally {
      setIsExecutingAction(false);
    }
  };

  const handleMarkAsLost = async (lossReasonId: string | null, comments: string) => {
    if (!cardId || !confirmLossAction) return;

    setIsMarkingAsLost(true);
    try {
      const headers = getHeaders();
      if (!headers) throw new Error('Não foi possível obter headers do workspace');

      const body: any = {
        id: cardId,
        status: 'perda'
      };

      if (confirmLossAction.target_pipeline_id && confirmLossAction.target_pipeline_id.trim() !== "") {
        body.pipeline_id = confirmLossAction.target_pipeline_id;
      }

      if (confirmLossAction.target_column_id && confirmLossAction.target_column_id.trim() !== "") {
        body.column_id = confirmLossAction.target_column_id;
      }

      // Primeiro executar a ação de perda (status/transferência)
      const { error: actionError } = await supabase.functions.invoke(`pipeline-management/cards?id=${cardId}`, {
        method: 'PUT',
        headers,
        body
      });

      if (actionError) throw actionError;

      // Depois salvar motivo e observação
      const { error: updateError } = await supabase
        .from('pipeline_cards')
        .update({
          loss_reason_id: lossReasonId,
          loss_comments: comments,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cardId);

      if (updateError) throw updateError;

      toast({
        title: "Sucesso",
        description: "Negócio marcado como perdido.",
      });

      await fetchCardData();

      if (body.pipeline_id && body.pipeline_id !== cardData?.pipeline_id) {
        await fetchPipelineActions(body.pipeline_id);
      }
    } catch (error: any) {
      console.error('Erro ao marcar como perdido:', error);
      toast({
        title: "Erro ao executar ação",
        description: error.message || "Não foi possível realizar a ação.",
        variant: "destructive",
      });
    } finally {
      setIsMarkingAsLost(false);
      setConfirmLossAction(null);
      setIsMarkAsLostModalOpen(false);
    }
  };

  // Salvar atividade
  const handleSaveActivity = async () => {
    if (!cardId || !contact?.id || !activityForm.responsibleId) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o responsável.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Combinar data e hora de início
      const [startHour, startMinute] = activityForm.startTime.split(':').map(Number);
      const startDateTime = new Date(activityForm.startDate);
      startDateTime.setHours(startHour, startMinute, 0, 0);

      // Combinar data e hora de fim
      const [endHour, endMinute] = activityForm.endTime.split(':').map(Number);
      const endDateTime = new Date(activityForm.endDate);
      endDateTime.setHours(endHour, endMinute, 0, 0);

      // Calcular duração em minutos
      const durationMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60));

      const activityData = {
        contact_id: contact.id,
        workspace_id: effectiveWorkspaceId,
        pipeline_card_id: cardId,
        type: activityForm.type,
        responsible_id: activityForm.responsibleId,
        subject: activityForm.subject.trim() || activityForm.type,
        description: activityForm.description || null,
        priority: activityForm.priority,
        availability: activityForm.availability,
        scheduled_for: startDateTime.toISOString(),
        duration_minutes: durationMinutes > 0 ? durationMinutes : 30,
        is_completed: activityForm.markAsDone
      };

      const { error } = await supabase
        .from('activities')
        .insert(activityData);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Atividade criada com sucesso.",
      });

      // Recarregar atividades
      await fetchActivities();

      // Invalidar histórico para que a nova atividade apareça
      // Usamos apenas o prefixo da chave para invalidar todas as variações (com ou sem contactId)
      queryClient.invalidateQueries({ queryKey: ['card-history', cardId] });

      // Resetar formulário
      setActivityForm({
        type: "Ligação abordada",
        subject: "",
        description: "",
        priority: "normal",
        availability: "livre",
        startDate: new Date(),
        startTime: "13:00",
        endDate: new Date(),
        endTime: "13:30",
        responsibleId: "",
        location: "",
        videoCall: false,
        markAsDone: false
      });
    } catch (error) {
      console.error('Erro ao salvar atividade:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar a atividade.",
        variant: "destructive",
      });
    }
  };

  const getActivityById = (id: string) => activities.find((a) => a.id === id);

  const openActivityEditFromHistory = useCallback(
    (event: any) => {
      try {
        const baseId = (event.id || "").split("_")[0];
        const activity = getActivityById(baseId);
        if (!activity) {
          toast({
            title: "Atividade não encontrada",
            description: "Não foi possível localizar a atividade para edição.",
            variant: "destructive",
          });
          return;
        }

        const scheduled = activity.scheduled_for ? new Date(activity.scheduled_for) : new Date();
        const endFromDuration = new Date(scheduled);
        const durationMinutes = activity.duration_minutes || 30;
        endFromDuration.setMinutes(endFromDuration.getMinutes() + durationMinutes);

        setActivityEditForm({
          type: activity.type || "Ligação abordada",
          subject: activity.subject || "",
          description: activity.description || "",
          priority: activity.priority || "normal",
          availability: activity.availability || "livre",
          startDate: scheduled,
          startTime: formatTime(scheduled),
          endDate: endFromDuration,
          endTime: formatTime(endFromDuration),
          responsibleId: activity.responsible_id || "",
          markAsDone: !!activity.is_completed,
        });
        setSelectedActivityForEdit(activity);
        setIsActivityEditModalOpen(true);
      } catch (error) {
        console.error("Erro ao preparar edição da atividade:", error);
        toast({
          title: "Erro",
          description: "Não foi possível abrir a edição da atividade.",
          variant: "destructive",
        });
      }
    },
    [activities, toast]
  );

  const handleUpdateActivity = useCallback(async () => {
    if (!selectedActivityForEdit || !contact?.id || !cardId || !activityEditForm.responsibleId) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o responsável.",
        variant: "destructive",
      });
      return;
    }

    try {
      const [startHour, startMinute] = activityEditForm.startTime.split(":").map(Number);
      const startDateTime = new Date(activityEditForm.startDate);
      startDateTime.setHours(startHour, startMinute, 0, 0);

      const [endHour, endMinute] = activityEditForm.endTime.split(":").map(Number);
      const endDateTime = new Date(activityEditForm.endDate);
      endDateTime.setHours(endHour, endMinute, 0, 0);

      const durationMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60));

      const { error } = await supabase
        .from("activities")
        .update({
          type: activityEditForm.type,
          responsible_id: activityEditForm.responsibleId,
          subject: activityEditForm.subject.trim() || activityEditForm.type,
          description: activityEditForm.description || null,
          priority: activityEditForm.priority,
          availability: activityEditForm.availability,
          scheduled_for: startDateTime.toISOString(),
          duration_minutes: durationMinutes > 0 ? durationMinutes : 30,
          is_completed: activityEditForm.markAsDone,
        })
        .eq("id", selectedActivityForEdit.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Atividade atualizada.",
      });

      setIsActivityEditModalOpen(false);
      setSelectedActivityForEdit(null);
      await fetchActivities();
      // Invalidar histórico para que a atividade atualizada apareça corretamente
      queryClient.invalidateQueries({ queryKey: ['card-history', cardId] });
    } catch (error: any) {
      console.error("Erro ao atualizar atividade:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível atualizar a atividade.",
        variant: "destructive",
      });
    }
  }, [activityEditForm, cardId, contact?.id, fetchActivities, queryClient, selectedActivityForEdit, toast]);

  const deleteActivityById = useCallback(
    async (activityId: string) => {
      const { error } = await supabase.from("activities").delete().eq("id", activityId);
      if (error) throw error;
      await fetchActivities();
      queryClient.invalidateQueries({ queryKey: ['card-history', cardId] });
    },
    [cardId, fetchActivities, queryClient]
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !cardId || !effectiveWorkspaceId || !contact?.id) return;

    setIsUploadingFile(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${effectiveWorkspaceId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('activity-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('activity-attachments')
        .getPublicUrl(filePath);

      // Criar uma atividade do tipo "Arquivo" para registrar o upload
      const { error: activityError } = await supabase
        .from('activities')
        .insert({
          contact_id: contact.id,
          workspace_id: effectiveWorkspaceId,
          pipeline_card_id: cardId,
          type: 'Arquivo',
          subject: `Arquivo anexado: ${file.name}`,
          attachment_name: file.name,
          attachment_url: publicUrl,
          responsible_id: authUser?.id || null,
          scheduled_for: new Date().toISOString(),
          is_completed: true,
          completed_at: new Date().toISOString()
        });

      if (activityError) throw activityError;

      toast({
        title: "Sucesso",
        description: "Arquivo anexado com sucesso.",
      });

      // Recarregar atividades para atualizar a lista de arquivos
      await fetchActivities();
      queryClient.invalidateQueries({ queryKey: ['card-history', cardId] });
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível carregar o arquivo.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingFile(false);
      if (event.target) event.target.value = '';
    }
  };

  const getFileIconComponent = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const label = (ext || 'file').slice(0, 4).toUpperCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');

    return (
      <div className="w-12 h-12 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-[#1f1f1f] flex items-center justify-center text-gray-700 dark:text-gray-200">
        {isImage ? (
          <ImageIcon className="h-5 w-5 text-gray-500 dark:text-gray-300" />
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-wide">
            {label}
          </span>
        )}
      </div>
    );
  };

  const handleDownloadFile = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteActivity = useCallback(async () => {
    if (!selectedActivityForEdit || !cardId) return;
    try {
      await deleteActivityById(selectedActivityForEdit.id);

      toast({
        title: "Sucesso",
        description: "Atividade excluída.",
      });

      setIsActivityEditModalOpen(false);
      setSelectedActivityForEdit(null);
    } catch (error: any) {
      console.error("Erro ao excluir atividade:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível excluir a atividade.",
        variant: "destructive",
      });
    }
  }, [cardId, deleteActivityById, selectedActivityForEdit, toast]);

  const openNoteEditFromHistory = useCallback(
    async (noteId?: string) => {
      if (!noteId) {
        toast({
          title: "Anotação não encontrada",
          description: "O item não possui referência de anotação.",
          variant: "destructive",
        });
        return;
      }

      try {
        const { data, error } = await supabase
          .from("pipeline_card_notes")
          .select("*")
          .eq("id", noteId)
          .maybeSingle();

        if (error || !data) {
          throw error || new Error("Anotação não localizada.");
        }

        setSelectedNoteForEdit(data);
        setNoteEditContent((data as any).content || "");
        setEditingNoteId((data as any).id);
        setEditingNoteContent((data as any).content || "");
      } catch (error: any) {
        console.error("Erro ao carregar anotação:", error);
        toast({
          title: "Erro",
          description: error.message || "Não foi possível abrir a edição da anotação.",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const handleUpdateNote = useCallback(async () => {
    const targetNoteId = editingNoteId || selectedNoteForEdit?.id;
    const contentToSave = editingNoteId ? editingNoteContent : noteEditContent;
    if (!targetNoteId || !contentToSave.trim() || !cardId) return;
    try {
      const { error } = await supabase
        .from("pipeline_card_notes")
        .update({
          content: contentToSave,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetNoteId);

      if (error) throw error;

      // Atualizar metadata no histórico para refletir novo conteúdo (quando existir)
      const { data: historyRow } = await supabase
        .from("pipeline_card_history")
        .select("id, metadata")
        .eq("card_id", cardId)
        .eq("metadata->>note_id", targetNoteId)
        .order("changed_at", { ascending: false })
        .maybeSingle();

      if (historyRow?.id) {
        const updatedMetadata = {
          ...(historyRow.metadata as any),
          content: contentToSave,
          description: `Anotação adicionada: ${contentToSave.slice(0, 100)}${
            contentToSave.length > 100 ? "..." : ""
          }`,
        };

        await supabase
          .from("pipeline_card_history")
          .update({ metadata: updatedMetadata })
          .eq("id", historyRow.id);
      }

      toast({
        title: "Sucesso",
        description: "Anotação atualizada.",
      });

      setSelectedNoteForEdit(null);
      setEditingNoteId(null);
      setEditingNoteContent("");
      queryClient.invalidateQueries({ queryKey: ['card-history', cardId] });
    } catch (error: any) {
      console.error("Erro ao atualizar anotação:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível atualizar a anotação.",
        variant: "destructive",
      });
    }
  }, [cardId, editingNoteContent, editingNoteId, noteEditContent, queryClient, selectedNoteForEdit, toast]);

  const handleUpdateContactName = async () => {
    if (!contact?.id || !tempContactName.trim()) {
      setIsEditingContactName(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('contacts')
        .update({ name: tempContactName.trim() })
        .eq('id', contact.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Nome do contato atualizado com sucesso."
      });

      setContact({ ...contact, name: tempContactName.trim() });
      setIsEditingContactName(false);
      await fetchCardData();
    } catch (error) {
      console.error('Erro ao atualizar nome do contato:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o nome do contato.",
        variant: "destructive"
      });
    }
  };

  const deleteNoteById = useCallback(
    async (noteId: string) => {
      const { error } = await supabase.from("pipeline_card_notes").delete().eq("id", noteId);
      if (error) throw error;
      await supabase
        .from("pipeline_card_history")
        .delete()
        .eq("card_id", cardId)
        .eq("metadata->>note_id", noteId);
      queryClient.invalidateQueries({ queryKey: ['card-history', cardId] });
    },
    [cardId, queryClient]
  );

  const handleDeleteNote = useCallback(async () => {
    const targetNoteId = editingNoteId || selectedNoteForEdit?.id;
    if (!targetNoteId || !cardId) return;
    try {
      await deleteNoteById(targetNoteId);

      toast({
        title: "Sucesso",
        description: "Anotação excluída.",
      });

      setSelectedNoteForEdit(null);
      setEditingNoteId(null);
      setEditingNoteContent("");
    } catch (error: any) {
      console.error("Erro ao excluir anotação:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível excluir a anotação.",
        variant: "destructive",
      });
    }
  }, [cardId, deleteNoteById, editingNoteId, selectedNoteForEdit, toast]);

  const handleHistoryEdit = useCallback(
    (event: any) => {
      if (event.type === "notes") {
        openNoteEditFromHistory(event.metadata?.note_id);
      } else if (event.type?.startsWith("activity_")) {
        openActivityEditFromHistory(event);
      } else {
        toast({
          title: "Item não editável",
          description: "Somente atividades e anotações podem ser editadas aqui.",
        });
      }
    },
    [openActivityEditFromHistory, openNoteEditFromHistory, toast]
  );

  const handleHistoryDelete = useCallback(
    async (event: any) => {
      try {
        if (event.type === "notes" && event.metadata?.note_id) {
          await deleteNoteById(event.metadata.note_id);
          toast({ title: "Sucesso", description: "Anotação excluída." });
        } else if (event.type?.startsWith("activity_")) {
          const baseId = (event.id || "").split("_")[0];
          await deleteActivityById(baseId);
          toast({ title: "Sucesso", description: "Atividade excluída." });
        } else {
          toast({
            title: "Item não excluível",
            description: "Somente atividades e anotações podem ser excluídas aqui.",
          });
        }
      } catch (error: any) {
        console.error("Erro ao excluir item do histórico:", error);
        toast({
          title: "Erro",
          description: error.message || "Não foi possível excluir o item.",
          variant: "destructive",
        });
      }
    },
    [deleteActivityById, deleteNoteById, toast]
  );

  const cancelNoteEdit = useCallback(() => {
    setEditingNoteId(null);
    setEditingNoteContent("");
    setSelectedNoteForEdit(null);
  }, []);

  const executeEditorCommand = (command: string, value: string | undefined = undefined) => {
    if (noteContentRef.current) {
      noteContentRef.current.focus();
      document.execCommand(command, false, value);
      // Forçar atualização do estado após comando
      setNoteContent(noteContentRef.current.innerHTML || "");
    }
  };

  // Adicionar produto ou valor ao card
  const handleAddProductToCard = useCallback(async () => {
    if (!cardId) return;
    
    // Se tem produto selecionado, adicionar produto
    if (selectedProductId) {
      try {
        const { error } = await supabase
          .from('pipeline_cards_products')
          .insert({
            pipeline_card_id: cardId,
            product_id: selectedProductId,
          });

        if (error) throw error;

        toast({
          title: "Produto adicionado",
          description: "O produto foi vinculado ao negócio.",
        });

        // Recarregar produtos do card
        const { data: productsData } = await supabase
          .from('pipeline_cards_products')
          .select(`
            id,
            product_id,
            product:products(id, name, value)
          `)
          .eq('pipeline_card_id', cardId);

        if (productsData) {
          setCardProducts(productsData);
        }

        setIsProductModalOpen(false);
        setSelectedProductId("");
        setManualValue("");
      } catch (error: any) {
        console.error('Erro ao adicionar produto:', error);
        toast({
          title: "Erro",
          description: error.message || "Não foi possível adicionar o produto.",
          variant: "destructive",
        });
      }
    } 
    // Se tem valor manual, atualizar valor do card
    else if (manualValue) {
      try {
        const valueNumber = parseFloat(manualValue.replace(',', '.'));
        if (isNaN(valueNumber)) {
          toast({
            title: "Erro",
            description: "Preço inválido.",
            variant: "destructive",
          });
          return;
        }

        const { error } = await supabase
          .from('pipeline_cards')
          .update({ value: valueNumber })
          .eq('id', cardId);

        if (error) throw error;

        // Atualizar cardData local
        setCardData((prev: any) => ({ ...prev, value: valueNumber }));

        toast({
          title: "Preço atualizado",
          description: "O preço foi atualizado no negócio.",
        });

        setIsProductModalOpen(false);
        setSelectedProductId("");
        setManualValue("");
      } catch (error: any) {
        console.error('Erro ao atualizar valor:', error);
        toast({
          title: "Erro",
          description: error.message || "Não foi possível atualizar o valor.",
          variant: "destructive",
        });
      }
    }
  }, [cardId, selectedProductId, manualValue, toast]);

  // Remover produto do card
  const handleRemoveProduct = useCallback(async (productRelationId: string) => {
    if (!cardId) return;
    try {
      const { error } = await supabase
        .from('pipeline_cards_products')
        .delete()
        .eq('id', productRelationId);

      if (error) throw error;

      // Recarregar produtos do card
      const { data: productsData } = await supabase
        .from('pipeline_cards_products')
        .select(`
          id,
          product_id,
          product:products(id, name, value)
        `)
        .eq('pipeline_card_id', cardId);

      if (productsData) {
        setCardProducts(productsData);
      }

      toast({
        title: "Produto removido",
        description: "O produto foi removido do negócio.",
      });
    } catch (error: any) {
      console.error('Erro ao remover produto:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível remover o produto.",
        variant: "destructive",
      });
    }
  }, [cardId, toast]);

  // Remover valor do card
  const handleRemoveValue = useCallback(async () => {
    if (!cardId) return;
    try {
      const { error } = await supabase
        .from('pipeline_cards')
        .update({ value: 0 })
        .eq('id', cardId);

      if (error) throw error;

      // Atualizar cardData local
      setCardData((prev: any) => ({ ...prev, value: 0 }));

      toast({
        title: "Preço removido",
        description: "O preço foi removido do negócio.",
      });
    } catch (error: any) {
      console.error('Erro ao remover valor:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível remover o valor.",
        variant: "destructive",
      });
    }
  }, [cardId, toast]);

  if (isLoading || !cardData || !cardId) {
    return (
      <div className="h-screen flex flex-col bg-white dark:bg-[#0f0f0f]">
        <div className={cn("px-6 py-4 border-b shrink-0 bg-white dark:bg-[#0f0f0f] border-gray-200 dark:border-gray-700")}>
          <div className="flex items-center gap-4">
            {!onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const pipelinePath = (userRole === 'master' && effectiveWorkspaceId) 
                    ? `/workspace/${effectiveWorkspaceId}/pipeline` 
                    : '/pipeline';
                  navigate(pipelinePath);
                }}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <span className="text-sm font-medium">Voltar ao Pipeline</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-400">Carregando detalhes do negócio...</p>
          </div>
        </div>
      </div>
    );
  }

  // Calcular dias em cada estágio
  const getDaysInStage = (columnId: string) => {
    if (!columnId || !timeInColumns) return 0;
    return timeInColumns[columnId] || 0;
  };

  const currentColumnIndex = columns && cardData ? columns.findIndex(col => col.id === cardData.column_id) : -1;
  
  // Encontrar colunas já passadas (antes da atual)
  const getPassedColumns = () => {
    if (!columns || currentColumnIndex === -1) return [];
    return columns.slice(0, currentColumnIndex);
  };

  const passedColumns = getPassedColumns();

  // Função para filtrar eventos do histórico
  const getFilteredHistoryEvents = (events: any[], filter: string) => {
    if (filter === "all") return events;
    if (filter === "activities") return events.filter(e => e.type?.startsWith("activity_"));
    if (filter === "activities_done") return events.filter(e => e.type?.startsWith("activity_") && e.metadata?.status === 'completed');
    if (filter === "activities_future") return events.filter(e => e.type?.startsWith("activity_") && e.metadata?.status !== 'completed');
    if (filter === "notes") return events.filter(e => e.type === "notes");
    if (filter === "email") return events.filter(e => e.type === "email");
    if (filter === "files") return events.filter(e => e.type === "files");
    if (filter === "documents") return events.filter(e => e.type === "documents");
    if (filter === "invoices") return events.filter(e => e.type === "invoices");
    if (filter === "changelog") return events.filter(e => 
      ["column_transfer", "pipeline_transfer", "tag", "user_assigned", "queue_transfer", "agent_activity"].includes(e.type)
    );
    return events;
  };


  return (
    <div className="h-screen flex flex-col bg-white dark:bg-[#0f0f0f] overflow-hidden">
      {/* Header Fixo */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0f0f0f]">
        {/* Top Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (onClose) {
                    onClose();
                    return;
                  }
                  const pipelineParam = cardData?.pipeline_id ? `?pipelineId=${cardData.pipeline_id}` : '';
                  if (effectiveWorkspaceId) {
                    navigate(`/workspace/${effectiveWorkspaceId}/pipeline${pipelineParam}`);
                  } else {
                    navigate(`/pipeline${pipelineParam}`);
                  }
                }}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              
              {/* Título */}
              <h1 className="text-lg font-semibold px-2 py-1">
                Oportunidade
              </h1>
            </div>

            <div className="flex items-center gap-4">
              {/* Proprietário */}
              {owner && (
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={owner.profile_image_url} />
                    <AvatarFallback>{owner.name?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{owner.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{owner.profile || 'Usuário'}</span>
                  </div>
                </div>
              )}

            <div className="flex items-center gap-2">
                {(() => {
                  const cardStatus = cardData?.status?.toLowerCase() || 'aberto';
                  const isMasterOrAdmin = userRole === 'master' || userRole === 'admin';
                  const isClosed = cardStatus === 'ganho' || cardStatus === 'perda' || cardStatus === 'perdido';

                  // Filtrar ações baseadas no estado do negócio e papel do usuário
                  const filteredActions = pipelineActions.filter((action: any) => {
                    const state = action.deal_state;
                    
                    // Regra: Ações de 'Aberto' (Reabrir) só aparecem para Master/Admin e se fechado
                    if (state === 'Aberto') {
                      const show = isMasterOrAdmin && isClosed;
                      return show;
                    }
                    
                    // Regra: Ações de 'Ganho' e 'Perda' só aparecem se estiver aberto
                    if (state === 'Ganho' || state === 'Perda') {
                      const show = cardStatus === 'aberto';
                      return show;
                    }

                    return true;
                  });

                  if (filteredActions.length === 0) {
                    console.log('⚠️ [Actions] Nenhuma ação passou pelos filtros:', { 
                      cardStatus, 
                      userRole, 
                      totalActions: pipelineActions.length,
                      actionsStates: pipelineActions.map(a => a.deal_state)
                    });
                  }

                  // Ordenar: Ganho, Perda, outros
                  const orderedActions = [...filteredActions].sort((a, b) => {
                    const order = { 'Ganho': 1, 'Perda': 2, 'Aberto': 3 };
                    return (order[a.deal_state] || 99) - (order[b.deal_state] || 99);
                  });

                  return orderedActions.map((action: any) => {
                    const isWin = action.deal_state === 'Ganho';
                    const isLoss = action.deal_state === 'Perda';
                    const shouldDisable = isExecutingAction;

                    return (
              <Button
                        key={action.id}
                        size="sm"
                        onClick={() => {
                          console.log('🎯 Botão clicado:', action.action_name);
                          executeAction(action);
                        }}
                        disabled={shouldDisable}
                        className={cn(
                          "h-8 px-4 text-xs font-medium rounded-none shadow-sm transition-all",
                          isWin 
                            ? "bg-green-600 hover:bg-green-700 text-white border-transparent dark:bg-green-600 dark:hover:bg-green-700 dark:text-white" 
                            : isLoss 
                              ? "bg-red-600 hover:bg-red-700 text-white border-transparent dark:bg-red-600 dark:hover:bg-red-700 dark:text-white" 
                              : "bg-white text-gray-900 border border-gray-300 hover:bg-gray-100 dark:bg-[#1b1b1b] dark:text-gray-100 dark:border-gray-700"
                        )}
                      >
                        {isExecutingAction ? '...' : action.action_name}
              </Button>
                    );
                  });
                })()}
              </div>
              
              {/* Popover de ações do card */}
              <Popover open={isCardActionsPopoverOpen} onOpenChange={setIsCardActionsPopoverOpen}>
                <PopoverContent 
                  className="w-48 p-1 z-[100] bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 shadow-md" 
                  align="end"
                  side="bottom"
                  sideOffset={5}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="space-y-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-9 px-2"
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsEditingName(true);
                        setIsCardActionsPopoverOpen(false);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start h-9 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsCardActionsPopoverOpen(false);
                        handleDeleteCard();
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Excluir
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* Breadcrumb do pipeline */}
        {pipelineData && columns && Array.isArray(columns) && columns.length > 0 && cardData && cardData.column_id && (
          <div className="px-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <button 
                className="flex items-center gap-1 text-sm text-gray-900 dark:text-gray-100 bg-transparent border-0 p-0 cursor-pointer"
                data-testid="pipeline-info"
              >
                <span>{pipelineData.name}</span>
                <ChevronRight className="h-4 w-4 mx-1 text-gray-400" />
                <Popover open={isColumnSelectModalOpen} onOpenChange={setIsColumnSelectModalOpen}>
                  <PopoverTrigger asChild>
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedColumnId(cardData?.column_id || "");
                      }}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      {currentColumn?.name || 'Coluna não encontrada'}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent 
                    className="w-auto p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1b1b1b] shadow-lg"
                    align="start"
                    sideOffset={8}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="space-y-4 min-w-[400px]">
                      {/* Select das Colunas do Pipeline */}
                      <Select
                        value={selectedColumnId || ""}
                        onValueChange={(value) => {
                          setSelectedColumnId(value);
                        }}
                      >
                        <SelectTrigger className="w-full rounded-md border border-gray-300 dark:border-gray-600">
                          <SelectValue placeholder="Selecione uma coluna">
                            {columns?.find(c => c.id === selectedColumnId)?.name || 'Selecione uma coluna'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {columns && columns.length > 0 ? (
                            columns.map((column) => (
                              <SelectItem key={column.id} value={column.id}>
                                {column.name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="" disabled>
                              Nenhuma coluna disponível
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>

                      {/* Etapa do funil - Visualização com segmentos */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">
                          Etapa do funil
                        </label>
                        {columns && columns.length > 0 ? (
                          <div className="flex items-center gap-0.5" role="listbox">
                            {columns.map((column, index) => {
                              const selectedIndex = columns.findIndex(c => c.id === selectedColumnId);
                              // Verde do segmento 0 até o índice selecionado (inclusive)
                              const isGreen = selectedIndex !== -1 && index <= selectedIndex;
                              const isFirst = index === 0;
                              const isLast = index === columns.length - 1;
                              
                              return (
                                <div
                                  key={column?.id || index}
                                  className={cn(
                                    "relative flex items-center justify-center text-xs font-medium transition-colors",
                                    "cursor-pointer hover:opacity-90"
                                  )}
                                  onClick={() => {
                                    setSelectedColumnId(column.id);
                                  }}
                                  style={{ 
                                    flex: 1,
                                    height: '32px',
                                    clipPath: isLast 
                                      ? "polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%)"
                                      : isFirst
                                      ? "polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%)"
                                      : "polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%, 6px 50%)",
                                    marginLeft: isFirst ? 0 : -6,
                                    paddingLeft: isFirst ? "0.5rem" : "0.75rem",
                                    paddingRight: isLast ? "0.5rem" : "0.75rem",
                                    zIndex: columns.length - index,
                                    backgroundColor: isGreen
                                      ? "#16a34a" // green-600
                                      : "#e5e7eb", // gray-200
                                    color: isGreen ? "#ffffff" : "#374151", // gray-700
                                  }}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                            Nenhuma coluna disponível
                          </div>
                        )}
                      </div>

                      {/* Botões */}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => setIsColumnSelectModalOpen(false)}
                          className="bg-white dark:bg-[#1f1f1f] border-gray-300 dark:border-gray-600"
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={() => {
                            if (selectedColumnId) {
                              handleMoveCardToColumn(selectedColumnId);
                            }
                          }}
                          disabled={!selectedColumnId || selectedColumnId === cardData?.column_id}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Salvar
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Conteúdo Principal */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Esquerda */}
        <div className="w-80 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0f0f0f] overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Resumo */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full text-left font-medium text-sm py-2.5 px-3">
                <span>Resumo</span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                {/* Responsável (Usuário) */}
                {owner && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-gray-400" />
                    <div className="flex-1">
                      <span className="text-gray-900 dark:text-gray-100">
                        {owner.name}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {/* Pessoa/Contato */}
                {contact && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-gray-400" />
                      <div className="flex-1">
                        {isEditingContactName ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={tempContactName}
                              onChange={(e) => setTempContactName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdateContactName();
                                if (e.key === 'Escape') setIsEditingContactName(false);
                              }}
                              className="h-7 text-xs py-0"
                              autoFocus
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-green-600"
                              onClick={handleUpdateContactName}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-600"
                              onClick={() => setIsEditingContactName(false)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-gray-900 dark:text-gray-100">
                            {contact.name || contact.phone || 'Sem contato'}
                          </span>
                        )}
                      </div>
                      {!isEditingContactName && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                          onClick={() => {
                            setTempContactName(contact.name || "");
                            setIsEditingContactName(true);
                          }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-300">
                        {contact.phone || 'Sem telefone'}
                      </span>
                    </div>
                  </>
                )}

                {/* Valor */}
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <div className="flex-1">
                    {cardProducts.length > 0 && cardProducts[0]?.product?.name ? (
                      <>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {cardProducts[0].product.name}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 text-xs">
                          R$ {cardProducts[0].total_value 
                            ? cardProducts[0].total_value.toFixed(2).replace('.', ',')
                            : cardProducts[0].product.value 
                            ? cardProducts[0].product.value.toFixed(2).replace('.', ',')
                            : cardData.value?.toFixed(2).replace('.', ',') || '0,00'}
                        </div>
                      </>
                    ) : cardData.value && cardData.value > 0 ? (
                      <div className="font-medium">
                        R$ {cardData.value.toFixed(2).replace('.', ',')}
                      </div>
                    ) : (
                      <div className="text-gray-500 dark:text-gray-400">
                        R$ 0,00
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {(cardProducts.length > 0 || (cardData.value && cardData.value > 0)) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          if (cardProducts.length > 0) {
                            handleRemoveProduct(cardProducts[0].id);
                          } else {
                            handleRemoveValue();
                          }
                        }}
                        title="Remover produto/valor"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setIsProductModalOpen(true)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Produtos
                    </Button>
                  </div>
                </div>

                {/* Etiquetas */}
                <div className="flex items-start gap-2 text-sm">
                  <Tag className="h-4 w-4 text-gray-400 mt-0.5" />
                  <div className="flex-1 flex flex-wrap gap-1">
                    {contactTags.length > 0 ? (
                      contactTags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                                className="text-[11px] font-semibold h-5 rounded-none border-none px-2 py-0.5 inline-flex items-center gap-1 text-black dark:text-white"
                                style={{
                                  backgroundColor: tag.color ? `${tag.color}99` : 'rgba(0,0,0,0.06)'
                                }}
                        >
                          <span>{tag.name}</span>
                          <button
                            className="ml-1 rounded-sm hover:bg-black/10 transition-colors flex items-center justify-center"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!contact?.id) return;
                              try {
                                const { error } = await supabase
                                  .from('contact_tags')
                                  .delete()
                                  .eq('contact_id', contact.id)
                                  .eq('tag_id', tag.id);
                                
                                if (error) throw error;
                                
                                setContactTags(prev => prev.filter(t => t.id !== tag.id));
                                toast({
                                  title: "Etiqueta removida",
                                  description: "A etiqueta foi removida com sucesso."
                                });
                              } catch (error) {
                                console.error('Erro ao remover etiqueta:', error);
                                toast({
                                  title: "Erro",
                                  description: "Não foi possível remover a etiqueta.",
                                  variant: "destructive"
                                });
                              }
                            }}
                            title="Remover etiqueta"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Adicionar etiquetas</span>
                    )}
                  </div>
                  {contact?.id && (
                    <AddContactTagButton
                      contactId={contact.id}
                      onTagAdded={(tag) => {
                        setContactTags((prev) => {
                          if (prev.some((existing) => existing.id === tag.id)) {
                            return prev;
                          }
                          return [...prev, tag];
                        });
                      }}
                    />
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Visão Geral */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full text-left font-medium text-sm py-2.5 px-3">
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4" />
                  <span>Visão geral</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Recarregar dados
                    if (cardId && contact?.id) {
                      fetchActivities();
                    }
                  }}
                  title="Atualizar"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-4">
                {overviewData ? (
                  <>
                    {/* Informações Gerais */}
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Idade do negócio</span>
                        <span className="font-medium">{overviewData.businessAge} dias</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-600 dark:text-gray-400">Inativo (dias)</span>
                          <Info className="h-3 w-3 text-gray-400" />
                        </div>
                        <span className="font-medium">{overviewData.inactiveDays}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Criado em</span>
                        <span className="font-medium">{overviewData.createdAt}</span>
                      </div>
                    </div>

                    {/* Atividades Principais */}
                    {overviewData.activityStats.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Atividades principais</h3>
                        
                        {/* Gráfico de barras */}
                        <div className="flex gap-0.5 h-4 rounded overflow-hidden">
                          {overviewData.activityStats.map((stat, index) => {
                            const colors = ['bg-yellow-500', 'bg-yellow-400', 'bg-yellow-300', 'bg-yellow-200'];
                            return (
                              <div
                                key={stat.type}
                                className={colors[index] || 'bg-gray-300'}
                                style={{ width: `${stat.percentage}%` }}
                                title={`${stat.type}: ${stat.count} (${stat.percentage}%)`}
                              />
                            );
                          })}
                        </div>

                        {/* Tabela de atividades */}
                        <table className="w-full text-xs">
                          <tbody>
                            {overviewData.activityStats.map((stat) => (
                              <tr key={stat.type} className="border-b border-gray-200 dark:border-gray-700">
                                <td className="py-1 text-gray-700 dark:text-gray-300">{stat.type}</td>
                                <td className="py-1 text-right font-medium">{stat.count}</td>
                                <td className="py-1 text-right text-gray-500 dark:text-gray-400">{stat.percentage}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Usuários Mais Ativos */}
                    {overviewData.userStats.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Usuários mais ativos</h3>
                        
                        {/* Gráfico de barras */}
                        <div className="flex gap-0.5 h-4 rounded overflow-hidden">
                          {overviewData.userStats.map((stat, index) => {
                            const maxPercentage = overviewData.userStats[0]?.percentage || 100;
                            const width = (stat.percentage / maxPercentage) * 100;
                            return (
                              <div
                                key={stat.name}
                                className="bg-blue-500"
                                style={{ width: `${width}%` }}
                                title={`${stat.name}: ${stat.count} (${stat.percentage}%)`}
                              />
                            );
                          })}
                        </div>

                        {/* Tabela de usuários */}
                        <table className="w-full text-xs">
                          <tbody>
                            {overviewData.userStats.map((stat) => (
                              <tr key={stat.name} className="border-b border-gray-200 dark:border-gray-700">
                                <td className="py-1 text-gray-700 dark:text-gray-300">{stat.name}</td>
                                <td className="py-1 text-right font-medium">{stat.count}</td>
                                <td className="py-1 text-right text-gray-500 dark:text-gray-400">{stat.percentage}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : cardData ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    Sem dados disponíveis
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    Carregando dados...
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Detalhes */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center justify-between w-full text-left font-medium text-sm py-2.5 px-3">
                <span>Detalhes</span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Status:</span>
                  <Badge className="ml-2">{cardData.status || 'aberto'}</Badge>
                </div>
                {contact && (
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Contato:</span>
                      <span className="ml-2">{contact.phone || contact.name || 'Sem contato'}</span>
                    </div>
                    {additionalContactInfo.length > 0 && (
                      <div className="space-y-1">
                        {additionalContactInfo.map((item, idx) => (
                          <div key={`${item.label}-${idx}`} className="flex items-start gap-1.5">
                            <span className="text-gray-500 dark:text-gray-400">{item.label}:</span>
                            <span className="text-gray-900 dark:text-gray-100 break-words">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        {/* Área Principal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <Tabs defaultValue="anotacoes" className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-gray-200 dark:border-gray-700 px-6">
              <TabsList className="bg-transparent gap-4">
                <TabsTrigger 
                  value="anotacoes" 
                  className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:text-gray-400 dark:data-[state=active]:text-white"
                >
                  <FileText className="h-4 w-4" />
                  <span>Anotações</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="atividade" 
                  className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:text-gray-400 dark:data-[state=active]:text-white"
                >
                  <CalendarIconLucide className="h-4 w-4" />
                  <span>Atividade</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="arquivos" 
                  className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:text-gray-400 dark:data-[state=active]:text-white"
                >
                  <File className="h-4 w-4" />
                  <span>Arquivos</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <TabsContent value="anotacoes" className="mt-0">
                <div className="space-y-4">
                  {/* Área de texto com fundo amarelo */}
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-none border border-gray-200 dark:border-gray-700 min-h-[300px] flex flex-col">
                    {/* Editor de texto */}
                    <div className="flex-1 relative">
                      {!noteContent && (
                        <div className="absolute top-4 left-4 text-gray-400 pointer-events-none text-sm">
                          Escreva uma anotação, @nome...
                        </div>
                      )}
                      <style>
                        {`
                          .note-editor ul { list-style-type: disc !important; margin-left: 1.5rem !important; margin-top: 0.5rem !important; margin-bottom: 0.5rem !important; }
                          .note-editor ol { list-style-type: decimal !important; margin-left: 1.5rem !important; margin-top: 0.5rem !important; margin-bottom: 0.5rem !important; }
                          .note-editor li { display: list-item !important; margin-bottom: 0.25rem !important; }
                          .note-editor b, .note-editor strong { font-weight: 700 !important; }
                          .note-editor i, .note-editor em { font-style: italic !important; }
                          .note-editor u { text-decoration: underline !important; }
                        `}
                      </style>
                      <div
                        ref={noteContentRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => {
                          const html = e.currentTarget.innerHTML || "";
                          setNoteContent(html);
                        }}
                        onFocus={(e) => {
                          if (!e.currentTarget.innerHTML) {
                            e.currentTarget.innerHTML = "";
                          }
                        }}
                        className="flex-1 p-4 outline-none text-sm min-h-[200px] relative z-10 text-gray-900 dark:text-gray-100 note-editor prose prose-sm dark:prose-invert max-w-none"
                      />
                    </div>
                    
                    {/* Toolbar de formatação */}
                    <div className="border-t border-gray-200 dark:border-gray-700 p-2 flex items-center gap-1 flex-wrap">
                      <TooltipProvider delayDuration={700}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                      <button
                        type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                executeEditorCommand('bold');
                              }}
                              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                      >
                        <Bold className="h-4 w-4" />
                      </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md">
                            <p>Negrito</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                      <button
                        type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                executeEditorCommand('italic');
                              }}
                              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                      >
                        <Italic className="h-4 w-4" />
                      </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md">
                            <p>Itálico</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                      <button
                        type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                executeEditorCommand('underline');
                              }}
                              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                      >
                        <Underline className="h-4 w-4" />
                      </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md">
                            <p>Sublinhado</p>
                          </TooltipContent>
                        </Tooltip>

                      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

                        <Tooltip>
                          <TooltipTrigger asChild>
                      <button
                        type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                executeEditorCommand('insertUnorderedList');
                              }}
                              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                            >
                              <List className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md">
                            <p>Lista de marcadores</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                executeEditorCommand('insertOrderedList');
                              }}
                              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                      >
                        <ListOrdered className="h-4 w-4" />
                      </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md">
                            <p>Lista numerada</p>
                          </TooltipContent>
                        </Tooltip>

                      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

                        <Tooltip>
                          <TooltipTrigger asChild>
                      <button
                        type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                executeEditorCommand('outdent');
                              }}
                              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                      >
                        <AlignLeft className="h-4 w-4" />
                      </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md">
                            <p>Diminuir indentação</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                      <button
                        type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                executeEditorCommand('indent');
                              }}
                              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                      >
                        <AlignRight className="h-4 w-4" />
                      </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md">
                            <p>Aumentar indentação</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                      <button
                        type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                executeEditorCommand('removeFormat');
                              }}
                              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md">
                            <p>Remover formatação</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      {/* Botões de ação */}
                      <div className="flex items-center gap-2 ml-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setNoteContent("");
                            if (noteContentRef.current) {
                              noteContentRef.current.innerHTML = "";
                            }
                          }}
                          className="h-8 dark:bg-transparent dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={async () => {
                            if (!noteContent.trim() || !cardId || !effectiveWorkspaceId) {
                              toast({
                                title: "Erro",
                                description: "Por favor, escreva uma anotação antes de salvar.",
                                variant: "destructive"
                              });
                              return;
                            }

                            try {
                              // Obter usuário atual do system_users
                              const currentUserStr = localStorage.getItem('currentUser');
                              if (!currentUserStr) {
                                throw new Error('Usuário não autenticado');
                              }
                              const currentUser = JSON.parse(currentUserStr);
                              
                              if (!currentUser.id) {
                                throw new Error('ID do usuário não encontrado');
                              }

                              // Salvar anotação na tabela pipeline_card_notes
                              // O trigger automaticamente registra no pipeline_card_history
                              const { error } = await supabase
                                .from('pipeline_card_notes')
                                .insert({
                                  card_id: cardId,
                                  content: noteContent.trim(),
                                  created_by: currentUser.id,
                                  workspace_id: effectiveWorkspaceId
                                });

                              if (error) throw error;

                              // Limpar campo de anotação
                              setNoteContent("");
                              if (noteContentRef.current) {
                                noteContentRef.current.innerHTML = "";
                              }

                              toast({
                                title: "Anotação salva",
                                description: "A anotação foi salva com sucesso e aparecerá no histórico.",
                              });

                              // Invalidar query do histórico para atualizar
                              const queryKey = ['card-history', cardId];
                              queryClient.invalidateQueries({ queryKey });
                            } catch (error: any) {
                              console.error('Erro ao salvar anotação:', error);
                              toast({
                                title: "Erro",
                                description: error.message || "Não foi possível salvar a anotação.",
                                variant: "destructive"
                              });
                            }
                          }}
                          disabled={!noteContent.trim()}
                          className="bg-green-600 hover:bg-green-700 text-white h-8 disabled:opacity-50 dark:bg-green-600 dark:hover:bg-green-700 dark:text-white"
                        >
                          Salvar
                        </Button>
                      </div>
                    </div>
                    
                    {/* Contador de caracteres */}
                    <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{noteContent.length}/100 notes</span>
                    </div>
                  </div>

                  {/* Seção de Histórico na aba de Anotações */}
                  <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
                    <div className="space-y-4">
                      {/* Cabeçalho do Histórico */}
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Histórico</h3>
                      </div>
                      
                      {/* Filtros */}
                      <div className="flex items-center gap-2 flex-wrap mb-6">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryFilter("all")}
                          className={cn(
                            "text-xs h-8 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-none transition-colors",
                            historyFilter === "all" && "bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-black dark:text-white font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                          )}
                        >
                          Todos
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryFilter("notes")}
                          className={cn(
                            "text-xs h-8 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-none transition-colors",
                            historyFilter === "notes" && "bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-black dark:text-white font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                          )}
                        >
                          Anotações ({historyEvents.filter(e => e.type === "notes").length})
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryFilter("activities")}
                          className={cn(
                            "text-xs h-8 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-none transition-colors",
                            historyFilter === "activities" && "bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-black dark:text-white font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                          )}
                        >
                          Atividades ({historyEvents.filter(e => e.type?.startsWith("activity_")).length})
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryFilter("activities_done")}
                          className={cn(
                            "text-xs h-8 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-none transition-colors",
                            historyFilter === "activities_done" && "bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-black dark:text-white font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                          )}
                        >
                          Atividades Realizadas ({historyEvents.filter(e => e.type?.startsWith("activity_") && e.metadata?.status === 'completed').length})
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryFilter("activities_future")}
                          className={cn(
                            "text-xs h-8 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-none transition-colors",
                            historyFilter === "activities_future" && "bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-black dark:text-white font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                          )}
                        >
                          Atividades Futuras ({historyEvents.filter(e => e.type?.startsWith("activity_") && e.metadata?.status !== 'completed').length})
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryFilter("files")}
                          className={cn(
                            "text-xs h-8 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-none transition-colors",
                            historyFilter === "files" && "bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-black dark:text-white font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                          )}
                        >
                          Arquivos ({historyEvents.filter(e => (e.type as any) === "files").length})
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryFilter("changelog")}
                          className={cn(
                            "text-xs h-8 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-none transition-colors",
                            historyFilter === "changelog" && "bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-black dark:text-white font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                          )}
                        >
                          Registro de alterações ({historyEvents.filter(e => ["column_transfer", "pipeline_transfer", "tag", "user_assigned", "queue_transfer", "agent_activity"].includes(e.type)).length})
                        </Button>
                      </div>

                      {/* Timeline */}
                      {isLoadingHistory ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          Carregando histórico...
                        </div>
                      ) : (
                        <div className="space-y-0">
                          {getFilteredHistoryEvents(historyEvents, historyFilter).map((event, index) => (
                            <HistoryTimelineItem
                              key={event.id}
                              event={event}
                              isLast={index === getFilteredHistoryEvents(historyEvents, historyFilter).length - 1}
                              contact={contact}
                              onEdit={handleHistoryEdit}
                              onDelete={handleHistoryDelete}
                              editingNoteId={editingNoteId}
                              editingNoteContent={editingNoteContent}
                              setEditingNoteContent={setEditingNoteContent}
                              onSaveNote={handleUpdateNote}
                              onCancelNote={cancelNoteEdit}
                              setSelectedFileForPreview={setSelectedFileForPreview}
                            />
                          ))}
                          {getFilteredHistoryEvents(historyEvents, historyFilter).length === 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                              Nenhum evento encontrado
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="atividade" className="mt-0">
                <div className="flex gap-6 h-full">
                  {/* Área Principal - Formulário de Atividade */}
                  <div className="flex-1 space-y-6 p-6">
                    {/* Título da Atividade */}
                    <div>
                      <Input
                        placeholder={activityForm.type}
                        value={activityForm.subject}
                        onChange={(e) => setActivityForm({...activityForm, subject: e.target.value})}
                        className="text-lg font-semibold border-0 border-b-2 border-gray-300 dark:border-gray-600 rounded-none pl-2 pr-0 focus-visible:ring-0 focus-visible:border-primary bg-transparent"
                      />
                    </div>

                    {/* Opções de Tipo de Atividade */}
                    <TooltipProvider>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[
                          { label: "Mensagem", type: "Mensagem", icon: MessageSquareIcon },
                          { label: "Ligação não atendida", type: "Ligação não atendida", icon: Phone },
                          { label: "Ligação atendida", type: "Ligação atendida", icon: Phone },
                          { label: "Ligação abordada", type: "Ligação abordada", icon: Phone },
                          { label: "Ligação de follow up", type: "Ligação de follow up", icon: Phone },
                          { label: "Reunião agendada", type: "Reunião agendada", icon: CalendarIconLucide },
                          { label: "Reunião realizada", type: "Reunião realizada", icon: CalendarIconLucide },
                          { label: "Reunião não realizada", type: "Reunião não realizada", icon: CalendarIconLucide },
                          { label: "Reunião reagendada", type: "Reunião reagendada", icon: CalendarIconLucide },
                          { label: "WhatsApp enviado", type: "WhatsApp enviado", icon: MessageSquareIcon },
                        ].map((option) => {
                          const Icon = option.icon;
                          return (
                            <Tooltip key={option.type}>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setActivityForm({...activityForm, type: option.type})}
                                  className={cn(
                                    "p-2 rounded-md transition-colors",
                                    activityForm.type === option.type
                                      ? "bg-[#eab308] text-black"
                                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                                  )}
                                >
                                  <Icon className="h-5 w-5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 shadow-md">
                                <p>{option.label}</p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </TooltipProvider>

                    {/* Data e Hora - Estilo Unificado */}
                    <div className="flex items-center gap-2">
                      <div className="shrink-0">
                        <Clock className="h-5 w-5 text-gray-400" />
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 flex-wrap md:flex-nowrap">
                        {/* Data Início */}
                        <Popover open={showStartDatePicker} onOpenChange={setShowStartDatePicker}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="h-9 px-3 py-1 text-sm font-normal border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-[#1b1b1b] min-w-[140px]"
                            >
                              {format(activityForm.startDate, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-white dark:bg-[#1b1b1b] border border-gray-200 dark:border-gray-700 shadow-md" align="start">
                            <Calendar
                              mode="single"
                              selected={activityForm.startDate}
                              onSelect={(date) => {
                                if (date) {
                                  setActivityForm({
                                    ...activityForm,
                                    startDate: date,
                                    endDate: date,
                                  });
                                  setShowStartDatePicker(false);
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>

                        {/* Hora Início */}
                        <Popover open={showStartTimePicker} onOpenChange={setShowStartTimePicker}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="h-9 px-3 py-1 text-sm font-normal border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-[#1b1b1b] min-w-[70px]"
                            >
                              {activityForm.startTime || "HH:mm"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-32 p-0 bg-white dark:bg-[#1b1b1b] border border-gray-200 dark:border-gray-700 shadow-md" align="start">
                            <ScrollArea className="h-60">
                              <div className="p-1">
                                {timeOptions.map((time) => (
                                  <button
                                    key={time}
                                    className={cn(
                                      "w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
                                      activityForm.startTime === time && "bg-primary text-primary-foreground font-semibold"
                                    )}
                                    onClick={() => {
                                      const [hour, minute] = time.split(':').map(Number);
                                      setSelectedStartHour(hour);
                                      setSelectedStartMinute(minute);
                                      
                                      // Calcular hora fim (5 minutos depois)
                                      let endHour = hour;
                                      let endMinute = minute + 5;
                                      if (endMinute >= 60) {
                                        endMinute -= 60;
                                        endHour = (endHour + 1) % 24;
                                      }
                                      const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
                                      
                                      setActivityForm({ 
                                        ...activityForm, 
                                        startTime: time,
                                        endTime: endTime 
                                      });
                                      setSelectedEndHour(endHour);
                                      setSelectedEndMinute(endMinute);
                                      setShowStartTimePicker(false);
                                    }}
                                  >
                                    {time}
                                  </button>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>

                        <span className="text-gray-400 mx-0.5">–</span>

                        {/* Hora Fim */}
                        <Popover open={showEndTimePicker} onOpenChange={setShowEndTimePicker}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="h-9 px-3 py-1 text-sm font-normal border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-[#1b1b1b] min-w-[70px]"
                            >
                              {activityForm.endTime || "HH:mm"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-32 p-0 bg-white dark:bg-[#1b1b1b] border border-gray-200 dark:border-gray-700 shadow-md" align="start">
                            <ScrollArea className="h-60">
                              <div className="p-1">
                                {timeOptions.map((time) => (
                                  <button
                                    key={time}
                                    className={cn(
                                      "w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
                                      activityForm.endTime === time && "bg-primary text-primary-foreground font-semibold"
                                    )}
                                    onClick={() => {
                                      const [hour, minute] = time.split(':').map(Number);
                                      setSelectedEndHour(hour);
                                      setSelectedEndMinute(minute);
                                      setActivityForm({ ...activityForm, endTime: time });
                                      setShowEndTimePicker(false);
                                    }}
                                  >
                                    {time}
                                  </button>
                                ))}
                      </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>

                        {/* Data Fim */}
                        <Popover open={showEndDatePicker} onOpenChange={setShowEndDatePicker}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="h-9 px-3 py-1 text-sm font-normal border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-[#1b1b1b] min-w-[140px]"
                            >
                              {format(activityForm.endDate, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-white dark:bg-[#1b1b1b] border border-gray-200 dark:border-gray-700 shadow-md" align="start">
                            <Calendar
                              mode="single"
                              selected={activityForm.endDate}
                              onSelect={(date) => {
                                if (date) {
                                  setActivityForm({...activityForm, endDate: date});
                                  setShowEndDatePicker(false);
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Prioridade */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Prioridade</label>
                      <Select
                        value={activityForm.priority}
                        onValueChange={(value) => setActivityForm({...activityForm, priority: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="baixa">Baixa</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Disponibilidade */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Disponibilidade</label>
                        <Select 
                          value={activityForm.availability}
                          onValueChange={(value) => setActivityForm({...activityForm, availability: value})}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="livre">Livre</SelectItem>
                            <SelectItem value="ocupado">Ocupado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Descrição */}
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Descrição da atividade..."
                        value={activityForm.description}
                        onChange={(e) => setActivityForm({...activityForm, description: e.target.value})}
                        className="min-h-[150px] bg-yellow-50 dark:bg-yellow-900/20 border-gray-300 dark:border-gray-600"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        As anotações ficam visíveis no sistema, exceto para convidados do evento
                      </p>
                    </div>

                    {/* Responsável */}
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <Select
                        value={activityForm.responsibleId}
                        onValueChange={(value) => setActivityForm({...activityForm, responsibleId: value})}
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Selecione o responsável" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Botões de ação */}
                    <div className="flex items-center justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={activityForm.markAsDone}
                            onChange={(e) => setActivityForm({...activityForm, markAsDone: e.target.checked})}
                            className="rounded"
                          />
                          <label className="text-sm text-gray-700 dark:text-gray-300">Marcar como feito</label>
                        </div>
                        <Button variant="outline" onClick={() => {
                          setActivityForm({
                            type: "Ligação abordada",
                            subject: "",
                            description: "",
                            priority: "normal",
                            availability: "livre",
                            startDate: new Date(),
                            startTime: "13:00",
                            endDate: new Date(),
                            endTime: "13:30",
                            responsibleId: "",
                            location: "",
                            videoCall: false,
                            markAsDone: false
                          });
                        }}>Cancelar</Button>
                        <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleSaveActivity}>Salvar</Button>
                        <Button variant="ghost" size="icon">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Sidebar Direita - Calendário */}
                  <div className="w-80 shrink-0 border-l border-gray-200 dark:border-gray-700 p-4 flex flex-col h-full overflow-hidden">
                    {/* Header do Calendário */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {format(selectedCalendarDate, "EEEE, 'de' MMMM", { locale: ptBR })}
                        </h3>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {format(selectedCalendarDate, "dd", { locale: ptBR })}°
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            const prevDay = new Date(selectedCalendarDate);
                            prevDay.setDate(prevDay.getDate() - 1);
                            setSelectedCalendarDate(prevDay);
                          }}
                        >
                          <ChevronRight className="h-4 w-4 rotate-180" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            const nextDay = new Date(selectedCalendarDate);
                            nextDay.setDate(nextDay.getDate() + 1);
                            setSelectedCalendarDate(nextDay);
                          }}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Timeline do Calendário */}
                    <div className="flex-1 overflow-y-auto relative" style={{ minHeight: '600px', maxHeight: '800px' }}>
                      <div className="relative" style={{ minHeight: '2400px' }}>
                        {/* Horas e linhas - de 00:00 a 23:00 */}
                        {Array.from({ length: 24 }, (_, i) => {
                          const hour = i;
                          const hourPosition = (hour / 23) * 100;
                          
                          return (
                            <div
                              key={hour}
                              className="absolute left-0 right-0 flex items-start"
                              style={{ top: `${hourPosition}%` }}
                            >
                              <div className="w-14 text-xs text-gray-400 dark:text-gray-500 mr-2 mt-0.5 font-normal">
                                {hour.toString().padStart(2, '0')}:00
                              </div>
                              <div className="flex-1 border-t border-gray-200 dark:border-gray-700"></div>
                            </div>
                          );
                        })}

                        {/* Linha do tempo atual (se for hoje) */}
                        {format(selectedCalendarDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") && (() => {
                          const now = new Date();
                          const currentHour = now.getHours();
                          const currentMinute = now.getMinutes();
                          const currentTimeInMinutes = currentHour * 60 + currentMinute;
                          const totalMinutesInDay = 24 * 60;
                          const topPosition = (currentTimeInMinutes / totalMinutesInDay) * 100;
                          
                          return (
                            <div
                              className="absolute left-0 right-0 z-10 flex items-center"
                              style={{ top: `${topPosition}%` }}
                            >
                              <div className="flex items-center w-full">
                                <span className="w-14 text-xs font-medium text-red-600 dark:text-red-400 mr-2 whitespace-nowrap">
                                  {format(now, "HH:mm")}
                                </span>
                                <div className="flex-1 h-0.5 bg-red-600 dark:bg-red-400"></div>
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Container para posicionar atividades - altura total da timeline */}
                        <div className="absolute left-14 right-0" style={{ top: 0, bottom: 0 }}>

                        {/* Atividades do dia */}
                        {activities
                          .filter(activity => {
                            if (!activity.scheduled_for) return false;
                            try {
                              const activityDate = new Date(activity.scheduled_for);
                              const selectedDateStr = format(selectedCalendarDate, "yyyy-MM-dd");
                              const activityDateStr = format(activityDate, "yyyy-MM-dd");
                              return activityDateStr === selectedDateStr;
                            } catch (error) {
                              console.error('Erro ao processar data da atividade:', error, activity);
                              return false;
                            }
                          })
                          .map(activity => {
                            const activityDate = new Date(activity.scheduled_for);
                            const startHour = activityDate.getHours();
                            const startMinute = activityDate.getMinutes();
                            const startTimeInMinutes = startHour * 60 + startMinute;
                            const durationMinutes = activity.duration_minutes || 30;
                            const endTimeInMinutes = startTimeInMinutes + durationMinutes;
                            
                            // Timeline completa de 00:00 a 23:59
                            const totalMinutesInDay = 24 * 60;
                            
                            // Calcular posição e altura baseado no dia completo
                            const topPercent = (startTimeInMinutes / totalMinutesInDay) * 100;
                            const heightPercent = (durationMinutes / totalMinutesInDay) * 100;

                            // Cor baseada no tipo ou prioridade
                            const getActivityColor = () => {
                              if (activity.type?.toLowerCase().includes('almoço') || activity.subject?.toLowerCase().includes('almoço')) {
                                return 'bg-gray-200 dark:bg-gray-700';
                              }
                              if (activity.priority === 'alta') {
                                return 'bg-red-500 dark:bg-red-600';
                              }
                              if (activity.priority === 'baixa') {
                                return 'bg-green-500 dark:bg-green-600';
                              }
                              return 'bg-blue-500 dark:bg-blue-600';
                            };

                            const getActivityTextColor = () => {
                              if (activity.type?.toLowerCase().includes('almoço') || activity.subject?.toLowerCase().includes('almoço')) {
                                return 'text-gray-800 dark:text-gray-200';
                              }
                              return 'text-white';
                            };

                            return (
                              <div
                                key={activity.id}
                                className={`absolute left-14 right-0 ${getActivityColor()} ${getActivityTextColor()} rounded px-2 py-1 text-xs shadow-sm z-20 cursor-pointer hover:opacity-90 transition-opacity`}
                                style={{
                                  top: `${topPercent}%`,
                                  height: `${Math.max(heightPercent, 1.5)}%`,
                                  minHeight: '32px'
                                }}
                              >
                                <div className="flex items-center gap-1 mb-0.5">
                                  <Phone className="h-3 w-3 flex-shrink-0" />
                                  <span className="font-medium truncate">{activity.subject || activity.type}</span>
                                </div>
                                {durationMinutes > 0 && (
                                  <div className="text-[10px] opacity-90">
                                    {format(activityDate, "HH:mm")} → {format(new Date(activityDate.getTime() + durationMinutes * 60000), "HH:mm")}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção de Histórico */}
                <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
                  <div className="space-y-4">
                    {/* Cabeçalho do Histórico */}
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Histórico</h3>
                    </div>
                        {/* Filtros */}
                        <div className="flex items-center gap-2 flex-wrap mb-6">
                          <Button
                            variant={historyFilter === "all" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setHistoryFilter("all")}
                            className={cn(
                              "text-xs h-8",
                              historyFilter === "all" && "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                            )}
                          >
                            Todos
                          </Button>
                          <Button
                            variant={historyFilter === "notes" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setHistoryFilter("notes")}
                            className={cn(
                              "text-xs h-8 hover:bg-gray-100 dark:hover:bg-gray-800",
                              historyFilter === "notes" && "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                            )}
                          >
                            Anotações ({historyEvents.filter(e => e.type === "notes").length})
                          </Button>
                          <Button
                            variant={historyFilter === "activities" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setHistoryFilter("activities")}
                            className={cn(
                              "text-xs h-8",
                              historyFilter === "activities" && "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                            )}
                          >
                            Atividades ({historyEvents.filter(e => e.type?.startsWith("activity_")).length})
                          </Button>
                          <Button
                            variant={historyFilter === "activities_done" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setHistoryFilter("activities_done")}
                            className={cn(
                              "text-xs h-8 hover:bg-gray-100 dark:hover:bg-gray-800",
                              historyFilter === "activities_done" && "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                            )}
                          >
                            Atividades Realizadas ({historyEvents.filter(e => e.type?.startsWith("activity_") && e.metadata?.status === 'completed').length})
                          </Button>
                          <Button
                            variant={historyFilter === "activities_future" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setHistoryFilter("activities_future")}
                            className={cn(
                              "text-xs h-8 hover:bg-gray-100 dark:hover:bg-gray-800",
                              historyFilter === "activities_future" && "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                            )}
                          >
                            Atividades Futuras ({historyEvents.filter(e => e.type?.startsWith("activity_") && e.metadata?.status !== 'completed').length})
                          </Button>
                          <Button
                            variant={historyFilter === "files" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setHistoryFilter("files")}
                            className={cn(
                              "text-xs h-8",
                              historyFilter === "files" && "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                            )}
                          >
                            Arquivos ({historyEvents.filter(e => (e.type as any) === "files").length})
                          </Button>
                          <Button
                            variant={historyFilter === "changelog" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setHistoryFilter("changelog")}
                            className={cn(
                              "text-xs h-8",
                              historyFilter === "changelog" && "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                            )}
                          >
                            Registro de alterações ({historyEvents.filter(e => ["column_transfer", "pipeline_transfer", "tag", "user_assigned", "queue_transfer", "agent_activity"].includes(e.type)).length})
                          </Button>
                        </div>

                        {/* Timeline */}
                        {isLoadingHistory ? (
                          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            Carregando histórico...
                          </div>
                        ) : (
                          <div className="space-y-0">
                            {getFilteredHistoryEvents(historyEvents, historyFilter).map((event, index) => (
                              <HistoryTimelineItem
                                key={event.id}
                                event={event}
                                isLast={index === getFilteredHistoryEvents(historyEvents, historyFilter).length - 1}
                                contact={contact}
                                onEdit={handleHistoryEdit}
                                onDelete={handleHistoryDelete}
                                editingNoteId={editingNoteId}
                                editingNoteContent={editingNoteContent}
                                setEditingNoteContent={setEditingNoteContent}
                                onSaveNote={handleUpdateNote}
                                onCancelNote={cancelNoteEdit}
                                setSelectedFileForPreview={setSelectedFileForPreview}
                              />
                            ))}
                            {getFilteredHistoryEvents(historyEvents, historyFilter).length === 0 && (
                              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                Nenhum evento encontrado
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                </div>
              </TabsContent>

              <TabsContent value="arquivos" className="mt-0">
                <div className="space-y-6">
                  {/* Área de Upload */}
                  <div className="bg-gray-50 dark:bg-gray-900/20 border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center rounded-none">
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploadingFile}
                    />
                    <label 
                      htmlFor="file-upload" 
                      className={cn(
                        "flex flex-col items-center gap-3 cursor-pointer",
                        isUploadingFile && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Upload className="h-6 w-6 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {isUploadingFile ? "Enviando arquivo..." : "Clique para selecionar um arquivo"}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          PDF, DOC, XLS, PNG, JPG (máx. 10MB)
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Lista de Arquivos */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <File className="h-4 w-4" />
                      Arquivos anexados
                    </h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activities
                        .filter(a => a.attachment_url)
                        .map(file => (
                            <div 
                              key={file.id} 
                              className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1b1b1b] shadow-sm group hover:border-primary transition-colors cursor-pointer"
                              onClick={() => {
                                const ext = file.attachment_name?.split('.').pop()?.toLowerCase();
                                setSelectedFileForPreview({
                                  url: file.attachment_url,
                                  name: file.attachment_name,
                                  type: ext
                                });
                              }}
                            >
                            <div className="shrink-0">
                              {getFileIconComponent(file.attachment_name || "")}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate" title={file.attachment_name}>
                                {file.attachment_name}
                              </p>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                {format(new Date(file.created_at), "dd/MM/yyyy HH:mm")}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleDownloadFile(file.attachment_url, file.attachment_name || "arquivo")}
                                title="Baixar arquivo"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={async () => {
                                  if (!confirm('Deseja realmente excluir este arquivo?')) return;
                                  try {
                                    const { error } = await supabase
                                      .from('activities')
                                      .delete()
                                      .eq('id', file.id);
                                    if (error) throw error;
                                    await fetchActivities();
                                    toast({ title: "Sucesso", description: "Arquivo removido." });
                                  } catch (error) {
                                    console.error('Erro ao excluir arquivo:', error);
                                  }
                                }}
                                title="Excluir arquivo"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      
                      {activities.filter(a => a.attachment_url).length === 0 && (
                        <div className="col-span-full py-8 text-center text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 text-xs">
                          Nenhum arquivo anexado a esta oportunidade.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
      
      {/* Modal de edição de atividade */}
      <Dialog open={isActivityEditModalOpen} onOpenChange={setIsActivityEditModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-[#0f0f0f] border-gray-800">
          <div className="flex flex-col h-full max-h-[90vh]">
            <DialogHeader className="px-6 py-4 border-b border-gray-800 bg-[#1a1a1a] shrink-0">
              <DialogTitle className="text-xl font-semibold text-white">Editar atividade</DialogTitle>
          </DialogHeader>

            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Assunto/Título */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-200">Assunto</label>
            <Input
                  placeholder={activityEditForm.type}
              value={activityEditForm.subject}
              onChange={(e) => setActivityEditForm({ ...activityEditForm, subject: e.target.value })}
                  className="bg-[#1a1a1a] border-gray-700 h-11 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
            />
              </div>

              {/* Ícones de tipo */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-200">Tipo de atividade</label>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: "Mensagem", type: "Mensagem", icon: MessageSquareIcon },
                { label: "Ligação não atendida", type: "Ligação não atendida", icon: Phone },
                { label: "Ligação atendida", type: "Ligação atendida", icon: Phone },
                { label: "Ligação abordada", type: "Ligação abordada", icon: Phone },
                { label: "Ligação de follow up", type: "Ligação de follow up", icon: Phone },
                { label: "Reunião agendada", type: "Reunião agendada", icon: CalendarIconLucide },
                { label: "Reunião realizada", type: "Reunião realizada", icon: CalendarIconLucide },
                { label: "Reunião não realizada", type: "Reunião não realizada", icon: CalendarIconLucide },
                { label: "Reunião reagendada", type: "Reunião reagendada", icon: CalendarIconLucide },
                { label: "WhatsApp enviado", type: "WhatsApp enviado", icon: MessageSquareIcon },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <Tooltip key={option.type}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActivityEditForm({ ...activityEditForm, type: option.type })}
                        className={cn(
                          "p-2 rounded-md transition-colors",
                          activityEditForm.type === option.type
                                ? "bg-[#eab308] text-black"
                                : "bg-[#1a1a1a] border border-gray-700 text-gray-400 hover:bg-[#252525] hover:text-gray-100"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                        <TooltipContent className="bg-[#1b1b1b] border-gray-700 text-gray-100 shadow-md">
                      <p>{option.label}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
              </div>

              {/* Grid para Datas e Horas */}
              <div className="grid grid-cols-2 gap-6">
                {/* Data de início */}
              <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-200">Data de início</label>
                <Popover open={showEditStartDatePicker} onOpenChange={setShowEditStartDatePicker}>
                  <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal bg-[#1a1a1a] border-gray-700 h-11 hover:bg-[#252525] rounded-md text-gray-100">
                        <CalendarIconLucide className="mr-3 h-4 w-4 text-gray-400" />
                      {format(activityEditForm.startDate, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-[#1b1b1b] border-gray-700" align="start">
                      <Calendar mode="single" selected={activityEditForm.startDate} onSelect={(date) => { if (date) { setActivityEditForm({ ...activityEditForm, startDate: date, endDate: date }); setShowEditStartDatePicker(false); } }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
                {/* Hora de início */}
              <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-200">Hora de início</label>
                <Popover open={showEditStartTimePicker} onOpenChange={setShowEditStartTimePicker}>
                  <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal bg-[#1a1a1a] border-gray-700 h-11 hover:bg-[#252525] rounded-md text-gray-100">
                        <Clock className="mr-3 h-4 w-4 text-gray-400" />
                      {activityEditForm.startTime}
                    </Button>
                  </PopoverTrigger>
                    <PopoverContent className="w-32 p-0 bg-[#1b1b1b] border-gray-700" align="start">
                      <ScrollArea className="h-60">
                        <div className="p-1">
                          {timeOptions.map((time) => (
                            <button 
                              key={time} 
                              className={cn(
                                "w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-gray-800 transition-colors text-gray-100", 
                                activityEditForm.startTime === time && "bg-primary text-primary-foreground font-semibold"
                              )} 
                              onClick={() => { 
                                const [hour, minute] = time.split(':').map(Number);
                                
                                // Calcular hora fim (5 minutos depois)
                                let endHour = hour;
                                let endMinute = minute + 5;
                                if (endMinute >= 60) {
                                  endMinute -= 60;
                                  endHour = (endHour + 1) % 24;
                                }
                                const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;

                                setActivityEditForm({ 
                                  ...activityEditForm, 
                                  startTime: time,
                                  endTime: endTime 
                                }); 
                                setShowEditStartTimePicker(false); 
                              }}
                            >
                              {time}
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                  </PopoverContent>
                </Popover>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Data de fim */}
              <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-200">Data de fim</label>
                <Popover open={showEditEndDatePicker} onOpenChange={setShowEditEndDatePicker}>
                  <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal bg-[#1a1a1a] border-gray-700 h-11 hover:bg-[#252525] rounded-md text-gray-100">
                        <CalendarIconLucide className="mr-3 h-4 w-4 text-gray-400" />
                      {format(activityEditForm.endDate, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-[#1b1b1b] border-gray-700" align="start">
                      <Calendar mode="single" selected={activityEditForm.endDate} onSelect={(date) => { if (date) { setActivityEditForm({ ...activityEditForm, endDate: date }); setShowEditEndDatePicker(false); } }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
                {/* Hora de fim */}
              <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-200">Hora de fim</label>
                <Popover open={showEditEndTimePicker} onOpenChange={setShowEditEndTimePicker}>
                  <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal bg-[#1a1a1a] border-gray-700 h-11 hover:bg-[#252525] rounded-md text-gray-100">
                        <Clock className="mr-3 h-4 w-4 text-gray-400" />
                      {activityEditForm.endTime}
                    </Button>
                  </PopoverTrigger>
                    <PopoverContent className="w-32 p-0 bg-[#1b1b1b] border-gray-700" align="start">
                      <ScrollArea className="h-60">
                        <div className="p-1">
                          {timeOptions.map((time) => (
                            <button key={time} className={cn("w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-gray-800 transition-colors text-gray-100", activityEditForm.endTime === time && "bg-primary text-primary-foreground font-semibold")} onClick={() => { setActivityEditForm({ ...activityEditForm, endTime: time }); setShowEditEndTimePicker(false); }}>
                              {time}
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                  </PopoverContent>
                </Popover>
                </div>
              </div>

              {/* Responsável e Prioridade */}
              <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-200">Responsável</label>
                <Select
                  value={activityEditForm.responsibleId}
                  onValueChange={(v) => setActivityEditForm({ ...activityEditForm, responsibleId: v })}
                >
                    <SelectTrigger className="bg-[#1a1a1a] border-gray-700 h-11 text-gray-100">
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                    <SelectContent className="bg-[#1b1b1b] border-gray-700 text-gray-100">
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-200">Prioridade</label>
                <Select
                  value={activityEditForm.priority}
                  onValueChange={(v) => setActivityEditForm({ ...activityEditForm, priority: v })}
                >
                    <SelectTrigger className="bg-[#1a1a1a] border-gray-700 h-11 text-gray-100">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                    <SelectContent className="bg-[#1b1b1b] border-gray-700 text-gray-100">
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
                </div>
              </div>

              {/* Disponibilidade */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-200">Disponibilidade</label>
                <Select
                  value={activityEditForm.availability}
                  onValueChange={(v) => setActivityEditForm({ ...activityEditForm, availability: v })}
                >
                  <SelectTrigger className="bg-[#1a1a1a] border-gray-700 h-11 text-gray-100">
                    <SelectValue placeholder="Disponibilidade" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1b1b1b] border-gray-700 text-gray-100">
                    <SelectItem value="livre">Livre</SelectItem>
                    <SelectItem value="ocupado">Ocupado</SelectItem>
                  </SelectContent>
                </Select>
            </div>

              {/* Descrição */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-200">Descrição</label>
            <Textarea
                  placeholder="Adicione detalhes sobre a atividade..."
              value={activityEditForm.description}
              onChange={(e) => setActivityEditForm({ ...activityEditForm, description: e.target.value })}
                  className="min-h-[120px] bg-[#1a1a1a] border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
                />
              </div>

              {/* Checkbox de conclusão */}
              <div className="flex items-center gap-3 pt-2">
                <Checkbox
                  id="activity-edit-done"
                  checked={activityEditForm.markAsDone}
                  onCheckedChange={(checked) => setActivityEditForm({ ...activityEditForm, markAsDone: checked === true })}
                  className="border-gray-700 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <label htmlFor="activity-edit-done" className="text-sm font-medium text-gray-200 cursor-pointer">
                  Marcar como concluída
                </label>
              </div>
              </div>

            <DialogFooter className="mt-0 mx-0 mb-0 border-t border-gray-800 bg-[#1a1a1a] flex items-center justify-end gap-4 shrink-0 px-6 py-4">
              <Button 
                variant="outline" 
                onClick={() => setIsActivityEditModalOpen(false)}
                className="bg-[#1a1a1a] border-gray-700 text-gray-300 hover:bg-[#252525] hover:text-white h-10"
              >
              Cancelar
            </Button>
              <Button 
                variant="ghost" 
                onClick={handleDeleteActivity}
                className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-10 px-2 flex items-center gap-2"
              >
                <X className="h-4 w-4" />
              Excluir
            </Button>
              <Button 
                onClick={handleUpdateActivity}
                className="bg-[#eab308] hover:bg-[#ca8a04] text-black font-semibold h-10 px-8 rounded-md"
              >
                Salvar Alterações
              </Button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Produtos */}
      <Dialog open={isProductModalOpen} onOpenChange={(open) => {
        setIsProductModalOpen(open);
        if (!open) {
          setSelectedProductId("");
          setManualValue("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader className="bg-gray-100 text-gray-900 px-4 py-3 border-b border-gray-200 dark:bg-[#1a1a1a] dark:text-gray-100 dark:border-gray-700">
            <DialogTitle>Adicionar produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Produto</label>
              <Select value={selectedProductId} onValueChange={(v) => {
                setSelectedProductId(v);
                // Preencher o preço automaticamente ao selecionar um produto
                const product = availableProducts.find(p => p.id === v);
                if (product && product.value) {
                  setManualValue(product.value.toFixed(2).replace('.', ','));
                } else {
                  setManualValue("");
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um produto (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Preço</label>
              <Input
                type="text"
                placeholder="R$ 0,00"
                value={manualValue}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^\d,]/g, '').replace(',', '.');
                  setManualValue(value);
                  setSelectedProductId(""); // Limpar produto quando digita valor
                }}
                onBlur={(e) => {
                  const value = e.target.value.replace(',', '.');
                  if (value && !isNaN(parseFloat(value))) {
                    setManualValue(parseFloat(value).toFixed(2).replace('.', ','));
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter className="mt-0 mx-0 mb-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] px-6 py-4">
            <Button variant="outline" onClick={() => {
              setIsProductModalOpen(false);
              setSelectedProductId("");
              setManualValue("");
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAddProductToCard} 
              disabled={!selectedProductId && !manualValue}
              className="bg-[#eab308] hover:bg-[#ca8a04] text-black font-semibold"
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MarkAsLostModal
        open={isMarkAsLostModalOpen}
        onOpenChange={(open) => {
          setIsMarkAsLostModalOpen(open);
          if (!open) {
            setConfirmLossAction(null);
          }
        }}
        onConfirm={handleMarkAsLost}
        workspaceId={effectiveWorkspaceId || ""}
        isLoading={isMarkingAsLost}
      />

      <AttachmentPreviewModal
        isOpen={Boolean(selectedFileForPreview)}
        onClose={() => setSelectedFileForPreview(null)}
        attachment={selectedFileForPreview}
      />

    </div>
  );
}

// Função auxiliar para obter ícone (precisa estar fora do componente)
function getEventIcon(eventType: string, action?: string) {
  if (eventType?.startsWith("activity_")) {
    if (action === "completed") return CheckCircle;
    if (eventType === "activity_ligacao") return Phone;
    if (eventType === "activity_reuniao") return Video;
    if (eventType === "activity_mensagem") return MessageSquareIcon;
    if (eventType === "activity_lembrete") return Clock;
    return Lock;
  }
  if (eventType === "column_transfer" || eventType === "pipeline_transfer") return ChevronRight;
  if (eventType === "tag") return FileTextIcon;
  if (eventType === "user_assigned" || eventType === "queue_transfer") return User;
  if (eventType === "agent_activity") return Lock;
  return Info;
}

// Componente para item da timeline do histórico
function HistoryTimelineItem({ 
  event, 
  isLast, 
  contact,
  onEdit,
  onDelete,
  editingNoteId,
  editingNoteContent,
  setEditingNoteContent,
  onSaveNote,
  onCancelNote,
  setSelectedFileForPreview
}: { 
  event: any; 
  isLast: boolean; 
  contact: any;
  onEdit: (event: any) => void;
  onDelete: (event: any) => void;
  editingNoteId: string | null;
  editingNoteContent: string;
  setEditingNoteContent: (value: string) => void;
  onSaveNote: () => void;
  onCancelNote: () => void;
  setSelectedFileForPreview: (file: any) => void;
}) {
  const EventIcon = getEventIcon(event.type, event.action);
  const isActivity = event.type?.startsWith("activity_");
  const isCompleted = event.action === "completed";
  const eventDate = event.timestamp ? new Date(event.timestamp) : new Date();
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const isNote = event.type === "notes";
  const isEditingNote = isNote && editingNoteId === event.metadata?.note_id;
  const descriptionHtml = event.metadata?.description;
  const looksLikeHtml = typeof descriptionHtml === "string" && /<\/?[a-z][\s\S]*>/i.test(descriptionHtml);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const hasDescription = Boolean(descriptionHtml);
  const descIsLong =
    typeof descriptionHtml === "string" &&
    (descriptionHtml.length > 180 || descriptionHtml.includes("\n"));
  const cleanNoteText = (text?: string) =>
    (text || "")
      .replace(/^Anotação adicionada:\s*/i, "")
      .replace(/^Anotação adicionada\s*/i, "")
      .trim();
  
  return (
    <div className="flex gap-4 relative">
      {/* Linha vertical e ícone */}
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center border-2",
          isActivity && isCompleted 
            ? "bg-green-100 dark:bg-green-900 border-green-500 dark:border-green-600 text-green-600 dark:text-green-400"
            : "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
        )}>
          <EventIcon className="h-4 w-4" />
        </div>
        {!isLast && (
          <div className="w-0.5 h-full min-h-[60px] bg-gray-200 dark:bg-gray-700 mt-2" />
        )}
      </div>

      {/* Conteúdo do evento */}
      <div className="flex-1 pb-6">
        <div
          className={cn(
            "border rounded-md p-4",
            isNote
              ? "bg-amber-50 border-amber-100 text-gray-800 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-200"
              : "bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700"
          )}
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              {isNote ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      Anotação
                    </span>
                    {event.metadata?.subject && (
                      <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                        {event.metadata.subject}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <span>{format(eventDate, "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}</span>
                    {event.user_name && (
                      <>
                        <span className="text-gray-400">•</span>
                        <span className="font-medium text-gray-700 dark:text-gray-200">{event.user_name}</span>
                      </>
                    )}
                  </div>
                </div>
              ) : isActivity ? (
                <div className="space-y-2">
                  {/* Linha superior: tipo + assunto */}
                <div className="flex items-center gap-2">
                    {event.metadata?.activity_type && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        {event.metadata.activity_type}
                      </span>
                    )}
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                    {event.metadata?.subject || event.description}
                  </span>
                  </div>
                  {/* Info da atividade: data, responsável e contato */}
                  {!isNote && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap mt-1 mb-2">
                      <span>
                        {format(eventDate, "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </span>
                      {event.user_name && (
                        <>
                          <span>•</span>
                          <span>{event.user_name}</span>
                        </>
                      )}
                      {contact && isActivity && (
                        <>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>{contact.name || contact.phone}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Descrição abaixo com estilo colado e cor diferenciada */}
                  {hasDescription && (
                    <div className="relative -mx-4 -mb-4 border-t border-amber-100 dark:border-amber-900/30">
                      <div
                        className={cn(
                          "text-xs text-gray-900 dark:text-white font-sans p-3 bg-[#fffde7] dark:bg-amber-950/20 transition-all duration-200 prose dark:prose-invert prose-sm max-w-none note-editor cursor-pointer",
                          !isDescExpanded && "max-h-[40px] overflow-hidden pr-10"
                        )}
                        onClick={() => {
                          if (event.metadata?.attachment_url) {
                            const ext = event.metadata.attachment_name?.split('.').pop()?.toLowerCase();
                            setSelectedFileForPreview({
                              url: event.metadata.attachment_url,
                              name: event.metadata.attachment_name,
                              type: ext
                            });
                          }
                        }}
                      >
                        {looksLikeHtml ? (
                          <div dangerouslySetInnerHTML={{ __html: cleanNoteText(descriptionHtml as string) }} />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans">
                            {cleanNoteText(descriptionHtml as string)}
                          </pre>
                        )}
                      </div>
                      
                      {/* Botão de expansão (ícone à direita) */}
                      <button
                        type="button"
                        className="absolute right-2 top-2 p-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-[#1b1b1b]/50 hover:bg-white dark:hover:bg-[#1b1b1b] text-gray-500 transition-colors"
                        onClick={() => setIsDescExpanded((v) => !v)}
                      >
                        {isDescExpanded ? (
                          <X className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                      {event.metadata?.event_title || 'Registro de Alteração'}
                  </div>
                    <div className="space-y-1">
                      <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-sans">
                        {event.metadata?.description || event.description}
                      </pre>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500">
                        {format(eventDate, "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </div>
                    </div>
                </div>
              )}
            </div>
            <Popover open={isActionsOpen} onOpenChange={setIsActionsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1 bg-white dark:bg-[#1b1b1b] border-gray-200 dark:border-gray-700 shadow-md" align="end" side="bottom" sideOffset={4}>
                <div className="space-y-1">
                  {(isNote || isActivity) && (
                  <Button
                    variant="ghost"
                    className="w-full justify-start h-8"
                    onClick={() => {
                      setIsActionsOpen(false);
                      onEdit(event);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="w-full justify-start h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setIsActionsOpen(false);
                      onDelete(event);
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Excluir
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Conteúdo */}
          {isNote && (
            <div className="mt-2">
              {!isEditingNote && (
                <div 
                  className="text-sm leading-relaxed break-words prose dark:prose-invert max-w-none note-editor text-gray-900 dark:text-white"
                  dangerouslySetInnerHTML={{ 
                    __html: event.metadata?.description || event.metadata?.content || event.description || "" 
                  }}
                />
              )}
              {isEditingNote && (
                <div className="space-y-2">
                  <textarea
                    className="w-full min-h-[140px] rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-200 dark:focus:ring-amber-800"
                    value={editingNoteContent}
                    onChange={(e) => setEditingNoteContent(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={onCancelNote}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={onSaveNote} disabled={!editingNoteContent.trim()}>
                      Salvar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
                  </div>
      </div>
    </div>
  );
}
