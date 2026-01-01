// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { Workspace, useWorkspace } from '@/contexts/WorkspaceContext';
import { usePipelinesContext } from '@/contexts/PipelinesContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip as ReTooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Filter, Users, Download, Loader2, Check, X, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QueryBuilderSidebar } from './QueryBuilderSidebar';
import { useReportIndicatorFunnelPresets } from '@/hooks/useReportIndicatorFunnelPresets';
import { useWorkspaceHeaders } from '@/lib/workspaceHeaders';

type PeriodPreset = 'all' | 'today' | 'last7' | 'last30' | 'custom';

interface RelatoriosAvancadosProps {
  workspaces?: Workspace[];
}

interface ContactRecord {
  id: string;
  created_at: string;
  responsible_id?: string | null;
  status?: string | null;
}

interface ActivityRecord {
  id: string;
  contact_id?: string | null;
  responsible_id?: string | null;
  type?: string | null;
  created_at: string;
  status?: string | null;
}

type TeamWorkRankingRow = {
  responsible_id: string | null;
  mensagem: number | null;
  ligacao_nao_atendida: number | null;
  ligacao_atendida: number | null;
  ligacao_abordada: number | null;
  ligacao_agendada: number | null;
  ligacao_follow_up: number | null;
  reuniao_agendada: number | null;
  reuniao_realizada: number | null;
  reuniao_nao_realizada: number | null;
  reuniao_reagendada: number | null;
  whatsapp_enviado: number | null;
};

interface PipelineCardRecord {
  id: string;
  contact_id?: string | null;
  value?: number | null;
  status?: string | null;
  pipeline_id?: string | null;
  responsible_user_id?: string | null;
  products?: { product_id: string | null }[];
}

interface TagRecord {
  contact_id: string;
  tag_id: string;
  tag?: { name?: string | null };
}

const pieColors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#6366F1'];

interface CustomConversion {
  id: string;
  name: string;
  pipelineA: string;
  columnA: string;
  pipelineB: string;
  columnB: string;
  isEditing?: boolean;
}

type TeamMetricKey = 'leads' | `activity:${string}`;

interface TeamConversion {
  id: string;
  name: string;
  metricA: TeamMetricKey;
  metricB: TeamMetricKey;
  isEditing?: boolean;
}

export function RelatoriosAvancados({ workspaces = [] }: RelatoriosAvancadosProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { selectedWorkspace, workspaces: ctxWorkspaces } = useWorkspace();
  const { user, userRole } = useAuth();
  const { pipelines: ctxPipelines, fetchPipelines: fetchCtxPipelines } = usePipelinesContext();
  const { getHeaders } = useWorkspaceHeaders();

  const [customConversions, setCustomConversions] = useState<CustomConversion[]>([]);
  const [pipelineColumnsMap, setPipelineColumnsMap] = useState<Record<string, { id: string, name: string }[]>>({});
  const [loadingColumnsMap, setLoadingColumnsMap] = useState<Record<string, boolean>>({});
  const [teamConversions, setTeamConversions] = useState<TeamConversion[]>([]);

  // ✅ Por padrão: sem recorte (carrega tudo). Só filtra por período quando o usuário escolher.
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    selectedWorkspace?.workspace_id ||
      workspaces?.[0]?.workspace_id ||
      ctxWorkspaces?.[0]?.workspace_id ||
      ''
  ); // mantido para compatibilidade mas sem seletor
  const [selectedFunnel, setSelectedFunnel] = useState<string>('all');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string }[]>([]);
  const [availableProducts, setAvailableProducts] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [teamWorkRankingData, setTeamWorkRankingData] = useState<TeamWorkRankingRow[]>([]);
  const [cards, setCards] = useState<PipelineCardRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'bi' | 'kpis' | 'funnel'>('funnel');
  // Preset/draft: Funis (múltiplos) do bloco "Funil – Indicadores"
  const { savedFunnels, canEdit: canEditIndicatorFunnels, loading: loadingFunnelsPreset, savePreset } =
    useReportIndicatorFunnelPresets(selectedWorkspaceId);
  const [draftFunnels, setDraftFunnels] = useState<any[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<any[]>([]);
  const [funnelsDirty, setFunnelsDirty] = useState(false);
  const [rehydrateNonce, setRehydrateNonce] = useState(0);
  const canSaveFilters = true;

  const applyPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    switch (preset) {
      case 'all':
        setStartDate(null);
        setEndDate(null);
        break;
      case 'today':
        setStartDate(startOfDay(new Date()));
        setEndDate(endOfDay(new Date()));
        break;
      case 'last7':
        setStartDate(startOfDay(subDays(new Date(), 6)));
        setEndDate(endOfDay(new Date()));
        break;
      case 'last30':
        setStartDate(startOfDay(subDays(new Date(), 29)));
        setEndDate(endOfDay(new Date()));
        break;
      case 'custom':
      default:
        break;
    }
  };

  const fetchAgents = async (workspaceId?: string | null) => {
    // Sempre filtra pelo workspace atual para respeitar o escopo
    if (!workspaceId) {
      setAgents([]);
      return;
    }
    const { data, error } = await supabase
      .from('workspace_members')
      .select('user_id, role, system_users(id, name, profile)')
      .eq('workspace_id', workspaceId);
    if (error) {
      console.error('Erro ao buscar usuários do workspace:', error);
      setAgents([]);
      return;
    }
    const agentsList = (data || [])
      .filter((wm: any) => {
        // NUNCA incluir usuários masters (seja no role do workspace ou no perfil global)
        const isMasterRole = wm.role === 'master';
        const isMasterProfile = wm.system_users?.profile === 'master';
        return !isMasterRole && !isMasterProfile;
      })
      .map((wm: any) => wm.system_users)
      .filter(Boolean)
      .map((su: any) => ({ id: su.id, name: su.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setAgents(agentsList);
  };

  const fetchPipelines = async (workspaceId: string | null) => {
    if (!workspaceId) {
      setPipelines([]);
      return;
    }
    const { data, error } = await supabase.from('pipelines').select('id, name').eq('workspace_id', workspaceId).order('name');
    if (error) {
      console.error('Erro ao buscar pipelines:', error);
      setPipelines([]);
      return;
    }
    console.log('📊 Pipelines carregados:', data?.length || 0, data);
    setPipelines(data || []);
  };

  const fetchTags = async (workspaceId: string | null) => {
    if (!workspaceId) {
      setAvailableTags([]);
      return;
    }
    try {
      // 1. Busca todas as tags do workspace
      const { data: tagsData, error: tagsError } = await supabase
        .from('tags')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name');
      
      if (tagsError) throw tagsError;

      // 2. Busca associações para contar contatos únicos (sem filtro de data para bater com a lista)
      const { data: ctData, error: ctError } = await supabase
        .from('contact_tags')
        .select('tag_id, contact_id');
      
      if (ctError) throw ctError;

      // 3. Processa contagem
      const countsMap = new Map<string, Set<string>>();
      (ctData || []).forEach(ct => {
        if (!countsMap.has(ct.tag_id)) countsMap.set(ct.tag_id, new Set());
        countsMap.get(ct.tag_id)?.add(ct.contact_id);
      });

      const processed = (tagsData || []).map(t => ({
        ...t,
        contact_count: countsMap.get(t.id)?.size || 0
      }));

      console.log('📊 Tags com contagem real:', processed);
      setAvailableTags(processed);
    } catch (err) {
      console.error('Erro ao buscar tags com contagem real:', err);
      setAvailableTags([]);
    }
  };

  const fetchProducts = async (workspaceId: string | null) => {
    if (!workspaceId) {
      setAvailableProducts([]);
      return;
    }
    try {
      // 1. Busca todos os produtos do workspace
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name');
      
      if (productsError) throw productsError;

      if (!productsData || productsData.length === 0) {
        setAvailableProducts([]);
        return;
      }

      // 2. Busca contagem de associações para estes produtos
      const productIds = productsData.map(p => p.id);
      const { data: pcpData, error: pcpError } = await supabase
        .from('pipeline_cards_products')
        .select('product_id, pipeline_card_id')
        .in('product_id', productIds);
      
      if (pcpError) throw pcpError;

      // 3. Processa contagem de cards únicos por produto
      // (Aproximação: cada card geralmente é um contato no funil)
      const countsMap = new Map<string, Set<string>>();
      (pcpData || []).forEach(pcp => {
        if (pcp.product_id && pcp.pipeline_card_id) {
          if (!countsMap.has(pcp.product_id)) countsMap.set(pcp.product_id, new Set());
          countsMap.get(pcp.product_id)?.add(pcp.pipeline_card_id);
        }
      });

      const processed = productsData.map(p => ({
        ...p,
        contact_count: countsMap.get(p.id)?.size || 0
      }));

      console.log('📊 Produtos processados (all-time):', processed);
      setAvailableProducts(processed);
    } catch (err) {
      console.error('Erro ao buscar produtos:', err);
      setAvailableProducts([]);
    }
  };

  const normalizeFunnelGroups = (funnelFilters: any): any[] => {
    if (!Array.isArray(funnelFilters)) return [];
    // Novo formato: array de grupos
    if (funnelFilters[0]?.pipeline !== undefined) {
      return funnelFilters.map((g: any) => ({
        pipeline: g.pipeline ?? 'all',
        column: g.column ?? 'all',
        team: g.team ?? 'all',
        tags: Array.isArray(g.tags) ? g.tags.filter(Boolean) : [],
        products: Array.isArray(g.products) ? g.products.filter(Boolean) : [],
        dateRange: g.dateRange
          ? {
              from: g.dateRange.from ? new Date(g.dateRange.from) : undefined,
              to: g.dateRange.to ? new Date(g.dateRange.to) : undefined,
            }
          : {},
        status: g.status ?? 'all',
        value: g.value ? { value: g.value.value, operator: g.value.operator } : null,
      }));
    }
    // Legado: FilterItem[]
    const byType = new Map<string, any[]>();
    funnelFilters.forEach((f) => {
      const arr = byType.get(f.type) || [];
      arr.push(f);
      byType.set(f.type, arr);
    });
    const pipeline = byType.get('pipeline')?.[0]?.value || 'all';
    const column = byType.get('column')?.[0]?.value || 'all';
    const team = byType.get('team')?.[0]?.value || 'all';
    const status = byType.get('status')?.[0]?.value || 'all';
    const tagsArr = (byType.get('tags') || []).map((t) => t.value).filter(Boolean);
    const productsArr = (byType.get('products') || []).map((t) => t.value).filter(Boolean);
    const valueItem = byType.get('value')?.[0];
    const date = byType.get('date')?.[0];
    let parsedRange: { from?: Date; to?: Date } = {};
    if (date?.value && date.operator === 'between') {
      const [from, to] = String(date.value).split('|');
      const dFrom = from ? new Date(from) : null;
      const dTo = to ? new Date(to) : null;
      if (dFrom && !Number.isNaN(dFrom.getTime()) && dTo && !Number.isNaN(dTo.getTime())) {
        parsedRange = { from: dFrom, to: dTo };
      }
    }
    return [{
      pipeline,
      column,
      team,
      tags: tagsArr,
      products: productsArr,
      dateRange: parsedRange,
      status,
      value: valueItem ? { value: valueItem.value, operator: valueItem.operator } : null,
    }];
  };

  const sanitizeGroupsForPersist = (groups: any[]) =>
    (groups || []).map((g) => ({
      pipeline: g.pipeline ?? 'all',
      column: g.column ?? 'all',
      team: g.team ?? 'all',
      tags: Array.isArray(g.tags) ? g.tags.filter(Boolean) : [],
      products: Array.isArray(g.products) ? g.products.filter(Boolean) : [],
      dateRange: g.dateRange
        ? {
            from: g.dateRange.from ? new Date(g.dateRange.from).toISOString() : undefined,
            to: g.dateRange.to ? new Date(g.dateRange.to).toISOString() : undefined,
          }
        : {},
      status: g.status ?? 'all',
      value: g.value ? { value: g.value.value ?? '', operator: g.value.operator } : null,
    }));

  const serializeGroups = (groups: any[]) => JSON.stringify(groups || []);

  useEffect(() => {
    const userKey = user?.id ? `relatorios:conversoes:${user.id}` : null;
    if (userKey) {
      const raw = localStorage.getItem(userKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setCustomConversions(parsed);
            // Busca as colunas para cada pipeline salvo
            parsed.forEach((conv: CustomConversion) => {
              if (conv.pipelineA && conv.pipelineA !== 'all') fetchColumnsForPipeline(conv.pipelineA);
              if (conv.pipelineB && conv.pipelineB !== 'all') fetchColumnsForPipeline(conv.pipelineB);
            });
          }
        } catch (e) {
          console.error("Erro ao carregar conversões customizadas:", e);
        }
      }
    }
  }, [user?.id]);

  useEffect(() => {
    const userKey = user?.id ? `relatorios:equipe_conversoes:${user.id}` : null;
    if (!userKey) return;
    const raw = localStorage.getItem(userKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setTeamConversions(parsed);
    } catch (e) {
      console.error('Erro ao carregar conversões (equipe):', e);
    }
  }, [user?.id]);

  const saveCustomConversions = (conversions: CustomConversion[]) => {
    const userKey = user?.id ? `relatorios:conversoes:${user.id}` : null;
    if (userKey) {
      localStorage.setItem(userKey, JSON.stringify(conversions.map(c => ({ ...c, isEditing: false }))));
    }
  };

  const saveTeamConversions = (conversions: TeamConversion[]) => {
    const userKey = user?.id ? `relatorios:equipe_conversoes:${user.id}` : null;
    if (!userKey) return;
    localStorage.setItem(
      userKey,
      JSON.stringify((conversions || []).map((c) => ({ ...c, isEditing: false })))
    );
  };

  const addCustomConversion = () => {
    const newConv: CustomConversion = {
      id: crypto.randomUUID(),
      name: '',
      pipelineA: 'all',
      columnA: 'all',
      pipelineB: 'all',
      columnB: 'all',
      isEditing: true,
    };
    setCustomConversions(prev => [...prev, newConv]);
  };

  const addTeamConversion = () => {
    const newConv: TeamConversion = {
      id: crypto.randomUUID(),
      name: '',
      metricA: 'leads',
      metricB: 'leads',
      isEditing: true,
    };
    setTeamConversions((prev) => [...prev, newConv]);
  };

  const removeCustomConversion = (id: string) => {
    const next = customConversions.filter(c => c.id !== id);
    setCustomConversions(next);
    saveCustomConversions(next);
  };

  const removeTeamConversion = (id: string) => {
    const next = teamConversions.filter((c) => c.id !== id);
    setTeamConversions(next);
    saveTeamConversions(next);
  };

  const normalizeText = (s?: string | null) =>
    (s || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const fetchColumnsForPipeline = async (pipelineId: string) => {
    if (!pipelineId || pipelineId === 'all' || (pipelineColumnsMap[pipelineId] && pipelineColumnsMap[pipelineId].length > 0)) return;
    
    setLoadingColumnsMap(prev => ({ ...prev, [pipelineId]: true }));
    try {
      console.log(`🔍 Buscando colunas para o pipeline: ${pipelineId}`);
      const { data, error } = await supabase
        .from('pipeline_columns')
        .select('id, name')
        .eq('pipeline_id', pipelineId)
        // `order_position`/`position` variam entre schemas; `name` é o mais consistente
        .order('name', { ascending: true });
      
      if (error) {
        console.error(`❌ Erro ao buscar colunas para ${pipelineId}:`, error);
        throw error;
      }
      
      console.log(`✅ ${data?.length || 0} colunas encontradas para ${pipelineId}`);
      setPipelineColumnsMap(prev => ({ ...prev, [pipelineId]: data || [] }));
    } catch (e) {
      console.error(`❌ Falha na busca de colunas:`, e);
    } finally {
      setLoadingColumnsMap(prev => ({ ...prev, [pipelineId]: false }));
    }
  };

  // Efeito para garantir que as colunas sejam carregadas ao editar ou carregar conversões
  useEffect(() => {
    customConversions.forEach(conv => {
      if (conv.pipelineA && conv.pipelineA !== 'all' && !pipelineColumnsMap[conv.pipelineA]) {
        fetchColumnsForPipeline(conv.pipelineA);
      }
      if (conv.pipelineB && conv.pipelineB !== 'all' && !pipelineColumnsMap[conv.pipelineB]) {
        fetchColumnsForPipeline(conv.pipelineB);
      }
    });
  }, [customConversions, pipelineColumnsMap]);

  const fetchData = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const hasDateRange = !!(startDate && endDate);
      const from = hasDateRange ? startDate!.toISOString() : null;
      const to = hasDateRange ? endDate!.toISOString() : null;

      // ✅ Cards (pipeline_cards) via Edge Function LITE (bypass RLS) — evita payload gigante e garante filtros
      let cardsLite: any[] = [];
      try {
        if (selectedWorkspaceId) {
          const headers = getHeaders(selectedWorkspaceId);
          const { data, error } = await supabase.functions.invoke("report-indicator-cards-lite", {
            method: "POST",
            headers,
            body: { workspaceId: selectedWorkspaceId },
          });
          if (error) throw error;
          cardsLite = Array.isArray(data?.cards) ? data.cards : [];
          // debug removed: keep console clean in production
        }
      } catch (e) {
        console.error("Erro ao buscar cards via report-indicator-cards-lite:", e);
        cardsLite = [];
      }

      // Contacts (leads)
      // @ts-ignore simplificando tipagem dinâmica para evitar profundidade de generics
      // Seleciona tudo para evitar erro 42703 em ambientes sem colunas opcionais
      let contactsQuery = supabase
        .from('contacts')
        .select('*');
      if (hasDateRange && from && to) {
        contactsQuery = contactsQuery.gte('created_at', from).lte('created_at', to);
      }

      // Activities (ligações/mensagens/reuniões)
      // @ts-ignore simplificando tipagem dinâmica
      // Seleciona tudo para evitar erro 42703 em ambientes sem colunas opcionais
      let activitiesQuery = supabase
        .from('activities')
        .select('*');
      if (hasDateRange && from && to) {
        activitiesQuery = activitiesQuery.gte('created_at', from).lte('created_at', to);
      }

      // Conversations (assumidas)
      let conversationsQuery = supabase
        .from('conversations')
        .select('id, contact_id, assigned_user_id, created_at, workspace_id');
      if (hasDateRange && from && to) {
        conversationsQuery = conversationsQuery.gte('created_at', from).lte('created_at', to);
      }

      // Ranking de Trabalho (agregado por responsável e tipo) — tipos oficiais do sistema
      // Obs: para usuários comuns, restringe ao próprio responsável (mantém mesma regra de permissão do relatório)
      const teamWorkRankingQuery = supabase.rpc('report_team_work_ranking', {
        // Ignora filtros: a função agora conta tudo no banco
        p_workspace_id: null,
        p_from: null,
        p_to: null,
        p_responsible_id: null,
      });

      // Workspace filter
      if (selectedWorkspaceId) {
        contactsQuery = contactsQuery.eq('workspace_id', selectedWorkspaceId);
        activitiesQuery = activitiesQuery.eq('workspace_id', selectedWorkspaceId);
        conversationsQuery = conversationsQuery.eq('workspace_id', selectedWorkspaceId);
      }

      // Permissões (somente para usuários comuns). Admin/Master enxergam tudo do workspace.
      // Os filtros "Equipe/Tags/Pipeline/Coluna/Produtos" agora são aplicados apenas dentro de cada funil de indicadores.
      if (userRole === 'user') {
        contactsQuery = contactsQuery.eq('responsible_id', user.id);
        activitiesQuery = activitiesQuery.eq('responsible_id', user.id);
        conversationsQuery = conversationsQuery.eq('assigned_user_id', user.id);
      }

      const [
        { data: contactsData, error: contactsError },
        { data: activitiesData, error: activitiesError },
        { data: conversationsData, error: conversationsError },
        { data: workRankingData, error: workRankingError },
      ] = await Promise.all([contactsQuery, activitiesQuery, conversationsQuery, teamWorkRankingQuery]);

      if (contactsError) {
        console.error('❌ Erro ao buscar contacts:', contactsError);
      }
      if (activitiesError) {
        console.error('❌ Erro ao buscar activities:', activitiesError);
      }
      if (conversationsError) {
        console.error('❌ Erro ao buscar conversations:', conversationsError);
      }
      if (workRankingError) {
        console.error('❌ Erro ao buscar report_team_work_ranking:', workRankingError);
      }

      const contactsFiltered = (((contactsData as unknown) as ContactRecord[]) || []);

      // Normaliza cards vindos da Edge Function LITE para o shape usado nos indicadores
      let cardsFiltered = (cardsLite || []).map((c: any) => ({
        id: c.id,
        contact_id: c.contact_id || null,
        value: null,
        status: c.status ?? null,
        qualification: c.qualification ?? null,
        pipeline_id: c.pipeline_id ?? null,
        column_id: c.column_id ?? null,
        responsible_user_id: c.responsible_user_id ?? null,
        created_at: c.created_at ?? null,
        products: Array.isArray(c.product_ids) ? c.product_ids.map((pid: string) => ({ product_id: pid })) : [],
      }));

      const finalContacts = contactsFiltered;

      const activitiesFiltered = (((activitiesData as unknown) as ActivityRecord[]) || []);

      const conversationsFiltered = (conversationsData || []);

      console.log('📊 RPC report_team_work_ranking rows:', Array.isArray(workRankingData) ? workRankingData.length : 'n/a', workRankingData);

      setContacts(finalContacts);
      setActivities(activitiesFiltered);
      setCards(cardsFiltered);
      setConversations(conversationsFiltered);
      setTeamWorkRankingData(((workRankingData as unknown) as TeamWorkRankingRow[]) || []);
      // Tags para gráficos: derivadas dos cards LITE (tag_ids)
      const tagRows: any[] = [];
      (cardsLite || []).forEach((card: any) => {
        const contactId = card.contact_id;
        const tagIds = Array.isArray(card.tag_ids) ? card.tag_ids : [];
        if (!contactId) return;
        tagIds.forEach((tagId: string) => {
          if (!tagId) return;
          tagRows.push({ contact_id: contactId, tag_id: tagId });
        });
      });
      setTags(tagRows);
    } catch (error) {
      console.error('Erro ao carregar relatórios:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Prioriza o workspace do contexto; se faltar, usa o primeiro disponível das props ou contexto.
    const fallbackWs =
      selectedWorkspace?.workspace_id ||
      workspaces?.[0]?.workspace_id ||
      ctxWorkspaces?.[0]?.workspace_id ||
      '';
    if (fallbackWs && fallbackWs !== selectedWorkspaceId) {
      setSelectedWorkspaceId(fallbackWs);
    }
  }, [selectedWorkspace, workspaces, ctxWorkspaces, selectedWorkspaceId]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      // Pipelines: usar contexto se já carregado; caso contrário, buscar direto.
      if (ctxPipelines && ctxPipelines.length > 0) {
        setPipelines(ctxPipelines);
      } else {
        fetchPipelines(selectedWorkspaceId);
        fetchCtxPipelines?.(); // dispara fetch global do contexto
      }
      fetchTags(selectedWorkspaceId);
      fetchProducts(selectedWorkspaceId);
      fetchAgents(selectedWorkspaceId);
      // Reset filtros quando workspace mudar
      setSelectedFunnel('all');
      setSelectedTags([]);
      setSelectedAgent('all');
    } else {
      setPipelines([]);
      setAvailableTags([]);
      setAgents([]);
    }
  }, [selectedWorkspaceId]);

  // Inicializa o draft a partir do preset salvo
  // carregar presets salvos por usuário (prioriza localStorage do usuário)
  useEffect(() => {
    const userKey = user?.id ? `relatorios:filtros:${user.id}` : null;
    let fromUser: any[] | null = null;
    if (userKey) {
      const raw = localStorage.getItem(userKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) fromUser = parsed;
        } catch {
          fromUser = null;
        }
      }
    }

    // se existir localStorage (mesmo vazio), ele prevalece; senão usa savedFunnels
    const hasUserStorage = fromUser !== null;
    const source = hasUserStorage ? (fromUser as any[] | null) || [] : (savedFunnels || []);
    const normalized = (source || []).map((f: any, idx: number) => ({
      id: String(f.id || `funnel-${idx + 1}`),
      name: String(f.name || `Funil ${idx + 1}`),
      filters: normalizeFunnelGroups(Array.isArray(f.filters) ? f.filters : []),
    }));
    setDraftFunnels(normalized);
    setSavedSnapshot(normalized);
    setFunnelsDirty(false);
    setRehydrateNonce((n) => n + 1);
  }, [savedFunnels, user?.id]);

  useEffect(() => {
    fetchData();
  }, [periodPreset, startDate, endDate, selectedAgent, userRole, selectedFunnel, selectedTags, selectedWorkspaceId, pipelines.length]);

  const contactsScoped = useMemo(() => {
    if (userRole === 'user' && user?.id) {
      return contacts.filter((c) => c.responsible_id === user.id);
    }
    return contacts;
  }, [contacts, userRole, user?.id]);

  const conversationsScoped = useMemo(() => {
    if (userRole === 'user' && user?.id) {
      return conversations.filter((c) => c.assigned_user_id === user.id);
    }
    return conversations;
  }, [conversations, userRole, user?.id]);

  const activitiesScoped = useMemo(() => {
    if (userRole === 'user' && user?.id) {
      return activities.filter((a) => a.responsible_id === user.id);
    }
    return activities;
  }, [activities, userRole, user?.id]);

  const cardsScoped = useMemo(() => {
    if (userRole === 'user' && user?.id) {
      return cards.filter((c) => c.responsible_user_id === user.id);
    }
    return cards;
  }, [cards, userRole, user?.id]);

  const leadsReceived = conversationsScoped.length;
  const leadsQualified = contactsScoped.filter((c) => (c.status || '').toLowerCase() === 'qualified').length;
  const leadsOffer = contactsScoped.filter((c) => (c.status || '').toLowerCase() === 'offer').length;
  const leadsWon = cardsScoped.filter((c) => {
    const s = (c.status || '').toLowerCase();
    return s === 'won' || s === 'ganho' || s === 'venda' || s === 'success' || s === 'sucesso';
  }).length;
  const leadsLost1 = contactsScoped.filter((c) => (c.status || '').toLowerCase() === 'lost_offer').length;
  const leadsLost2 = contactsScoped.filter((c) => (c.status || '').toLowerCase() === 'lost_no_offer').length;
  const leadsLost3 = contactsScoped.filter((c) => (c.status || '').toLowerCase() === 'lost_not_fit').length;
  const leadsLostTotal = leadsLost1 + leadsLost2 + leadsLost3;

  // Indicadores por funil (múltiplos) — aplicam somente no bloco "Funil – Indicadores"
  const indicatorFunnels = useMemo(() => {
    const nameByTagId = new Map((availableTags || []).map((t: any) => [t.id, t.name]));
    const nameByProductId = new Map((availableProducts || []).map((p: any) => [p.id, p.name]));

    const apply = (funnel: any) => {
      const groups = normalizeFunnelGroups(Array.isArray(funnel?.filters) ? funnel.filters : []);

      const agg = {
        leadsReceived: 0,
        leadsQualified: 0,
        leadsOffer: 0,
        leadsWon: 0,
        leadsLost1: 0,
        leadsLost2: 0,
        leadsLost3: 0,
        leadsByTag: new Map<string, number>(),
        leadsByProduct: new Map<string, number>(),
        series: new Map<string, { received: number; qualified: number }>(),
      };

      const addToMap = (map: Map<string, number>, name: string, value: number) => {
        map.set(name, (map.get(name) || 0) + value);
      };
      const addSeries = (dateKey: string, incReceived: number, incQualified: number) => {
        const curr = agg.series.get(dateKey) || { received: 0, qualified: 0 };
        curr.received += incReceived;
        curr.qualified += incQualified;
        agg.series.set(dateKey, curr);
      };

      groups.forEach((g: any) => {
        const pipeline = g.pipeline || 'all';
        const column = g.column || 'all';
        const team = g.team || 'all';
        const status = g.status || 'all';
        const tagFilters = Array.isArray(g.tags) ? g.tags : [];
        const productFilters = Array.isArray(g.products) ? g.products : [];
        const dateRange = g.dateRange
          ? {
              from: g.dateRange.from ? new Date(g.dateRange.from).getTime() : undefined,
              to: g.dateRange.to ? new Date(g.dateRange.to).getTime() : undefined,
            }
          : null;
        const valueFilter = g.value;

        const withinDate = (iso?: string) => {
          if (!dateRange || (!dateRange.from && !dateRange.to)) return true;
          if (!iso) return false;
          const t = new Date(iso).getTime();
          if (Number.isNaN(t)) return false;
          if (dateRange.from && t < dateRange.from) return false;
          if (dateRange.to && t > dateRange.to) return false;
          return true;
        };

        let cardsF = [...(cardsScoped || [])] as any[];
        if (pipeline !== 'all') cardsF = cardsF.filter((c) => c.pipeline_id === pipeline);
        if (column !== 'all') cardsF = cardsF.filter((c) => c.column_id === column);
        if (team !== 'all') {
          if (team === 'ia') cardsF = cardsF.filter((c) => !c.responsible_user_id);
          else cardsF = cardsF.filter((c) => c.responsible_user_id === team);
        }
        if (status && status !== 'all') {
          cardsF = cardsF.filter((c) => (c.status || '').toLowerCase() === String(status).toLowerCase());
        }
        if (valueFilter?.value) {
          const valueNum = parseFloat(valueFilter.value);
          if (!Number.isNaN(valueNum)) {
            switch (valueFilter.operator) {
              case 'greater':
                cardsF = cardsF.filter((c) => (c.value || 0) > valueNum);
                break;
              case 'less':
                cardsF = cardsF.filter((c) => (c.value || 0) < valueNum);
                break;
              default:
                cardsF = cardsF.filter((c) => c.value === valueNum);
            }
          }
        }
        if (productFilters.length > 0) {
          cardsF = cardsF.filter((c) => (c.products || []).some((p: any) => p?.product_id && productFilters.includes(p.product_id)));
        }

        // data em cards (entrada/registro)
        if (dateRange && (dateRange.from || dateRange.to)) {
          cardsF = cardsF.filter((c: any) => {
            // se não tiver created_at, mantém para evitar quedas bruscas
            if (!c.created_at) return true;
            return withinDate(c.created_at);
          });
        }

        if (tagFilters.length > 0) {
          const allowed = new Set<string>();
          (tags || []).forEach((t: any) => {
            if (t?.contact_id && t?.tag_id && tagFilters.includes(t.tag_id)) allowed.add(t.contact_id);
          });
          cardsF = cardsF.filter((c) => c.contact_id && allowed.has(c.contact_id));
        }

        const contactIdsFromCards = new Set<string>(cardsF.map((c) => c.contact_id).filter(Boolean));
        let contactsF = (contactsScoped || []).filter((c: any) => contactIdsFromCards.has(c.id));
        let conversationsF = (conversationsScoped || []).filter((c: any) => contactIdsFromCards.has(c.contact_id));
        let activitiesF = (activitiesScoped || []).filter((a: any) => a.contact_id && contactIdsFromCards.has(a.contact_id));

        if (team && team !== 'all') {
          if (team === 'ia') {
            contactsF = contactsF.filter((c: any) => !c.responsible_id);
            conversationsF = conversationsF.filter((c: any) => !c.assigned_user_id);
            activitiesF = activitiesF.filter((a: any) => !a.responsible_id);
          } else {
            contactsF = contactsF.filter((c: any) => c.responsible_id === team);
            conversationsF = conversationsF.filter((c: any) => c.assigned_user_id === team);
            activitiesF = activitiesF.filter((a: any) => a.responsible_id === team);
          }
        }

        if (dateRange && (dateRange.from || dateRange.to)) {
          contactsF = contactsF.filter((c: any) => withinDate(c.created_at));
          conversationsF = conversationsF.filter((c: any) => withinDate(c.created_at));
          activitiesF = activitiesF.filter((a: any) => withinDate(a.created_at));
        }

        const leadsReceivedF = cardsF.length;
        const leadsQualifiedF = contactsF.filter((c: any) => (c.status || '').toLowerCase() === 'qualified').length;
        const leadsOfferF = contactsF.filter((c: any) => (c.status || '').toLowerCase() === 'offer').length;
        const leadsWonF = cardsF.filter((c: any) => {
          const s = (c.status || '').toLowerCase();
          return s === 'won' || s === 'ganho' || s === 'venda' || s === 'success' || s === 'sucesso';
        }).length;
        const leadsQualifiedCardsF = cardsF.filter((c: any) => String(c.qualification || '').toLowerCase() === 'qualified').length;
        const leadsLost1F = contactsF.filter((c: any) => (c.status || '').toLowerCase() === 'lost_offer').length;
        const leadsLost2F = contactsF.filter((c: any) => (c.status || '').toLowerCase() === 'lost_no_offer').length;
        const leadsLost3F = contactsF.filter((c: any) => (c.status || '').toLowerCase() === 'lost_not_fit').length;

        agg.leadsReceived += leadsReceivedF;
        agg.leadsQualified += leadsQualifiedCardsF;
        agg.leadsOffer += leadsOfferF;
        agg.leadsWon += leadsWonF;
        agg.leadsLost1 += leadsLost1F;
        agg.leadsLost2 += leadsLost2F;
        agg.leadsLost3 += leadsLost3F;

        // Séries diárias (usamos created_at dos cards para recebidos; contatos qualificados para qualified)
        cardsF.forEach((c: any) => {
          if (!c?.created_at) return;
          const key = format(new Date(c.created_at), 'yyyy-MM-dd');
          addSeries(key, 1, 0);
        });
        contactsF
          .filter((c: any) => (c.status || '').toLowerCase() === 'qualified')
          .forEach((c: any) => {
            if (!c?.created_at) return;
            const key = format(new Date(c.created_at), 'yyyy-MM-dd');
            addSeries(key, 0, 1);
          });

        const byTag = new Map<string, number>();
        (tags || []).forEach((t: any) => {
          if (!t?.contact_id || !t?.tag_id) return;
          if (!contactIdsFromCards.has(t.contact_id)) return;
          if (tagFilters.length > 0 && !tagFilters.includes(t.tag_id)) return;
          const name = nameByTagId.get(t.tag_id) || t.tag_id || 'Etiqueta';
          byTag.set(name, (byTag.get(name) || 0) + 1);
        });
        byTag.forEach((v, k) => addToMap(agg.leadsByTag, k, v));

        const byProduct = new Map<string, number>();
        cardsF.forEach((c: any) => {
          if (!c?.contact_id) return;
          (c.products || []).forEach((p: any) => {
            const pid = p?.product_id;
            if (!pid) return;
            if (productFilters.length > 0 && !productFilters.includes(pid)) return;
            const name = nameByProductId.get(pid) || pid || 'Produto';
            byProduct.set(name, (byProduct.get(name) || 0) + 1);
          });
        });
        byProduct.forEach((v, k) => addToMap(agg.leadsByProduct, k, v));
      });

      return {
        id: funnel.id,
        name: funnel.name,
        leadsReceived: agg.leadsReceived,
        leadsQualified: agg.leadsQualified,
        leadsOffer: agg.leadsOffer,
        leadsWon: agg.leadsWon,
        leadsLost1: agg.leadsLost1,
        leadsLost2: agg.leadsLost2,
        leadsLost3: agg.leadsLost3,
        leadsByTag: Array.from(agg.leadsByTag.entries()).map(([name, value]) => ({ name, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value),
        leadsByProduct: Array.from(agg.leadsByProduct.entries()).map(([name, value]) => ({ name, value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value),
        leadsSeries: Array.from(agg.series.entries())
          .map(([date, obj]) => ({ date, received: obj.received, qualified: obj.qualified }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    };

    return (draftFunnels || []).map(apply);
  }, [availableProducts, availableTags, activities, cards, contacts, conversations, draftFunnels, tags]);

  const leadsSeriesGlobal = useMemo(() => {
    const m = new Map<string, { received: number; qualified: number }>();
    (indicatorFunnels || []).forEach((f: any) => {
      (f?.leadsSeries || []).forEach((p: any) => {
        const key = p.date;
        const curr = m.get(key) || { received: 0, qualified: 0 };
        curr.received += Number(p.received || 0);
        curr.qualified += Number(p.qualified || 0);
        m.set(key, curr);
      });
    });
    return Array.from(m.entries())
      .map(([date, obj]) => ({ date, received: obj.received, qualified: obj.qualified }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [indicatorFunnels]);

  const leadsByTag = useMemo(() => {
    const nameById = new Map((availableTags || []).map((t) => [t.id, t.name]));
    const map = new Map<string, number>();

    // 1. Processa os contatos únicos por etiqueta no período filtrado
    if (tags && tags.length > 0) {
      const tagContacts = new Map<string, Set<string>>();
      
      tags.forEach((t) => {
        const contactId = t.contact_id;
        const tagId = t.tag_id;
        if (!contactId || !tagId) return;

        const includeTag = selectedTags.length === 0 || selectedTags.includes(tagId);
        if (!includeTag) return;

        if (!tagContacts.has(tagId)) tagContacts.set(tagId, new Set());
        tagContacts.get(tagId)?.add(contactId);
      });

      tagContacts.forEach((contacts, tagId) => {
        const name = nameById.get(tagId) || tagId || 'Etiqueta';
        map.set(name, contacts.size);
      });
    }

    // 2. Complementa com o contact_count real (all-time) se o filtro de período não trouxe dados para aquela etiqueta
    if (availableTags && availableTags.length > 0) {
      availableTags.forEach((t) => {
        const includeTag = selectedTags.length === 0 || selectedTags.includes(t.id);
        if (!includeTag) return;

        const existing = map.get(t.name) || 0;
        const aggregated = typeof t.contact_count === 'number' ? t.contact_count : 0;

        if (existing === 0 && aggregated > 0) {
          map.set(t.name, aggregated);
        }
      });
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [tags, availableTags, selectedTags]);

  const leadsByProduct = useMemo(() => {
    const nameById = new Map((availableProducts || []).map((p) => [p.id, p.name]));
    const map = new Map<string, number>();

    // 1. Processa os contatos únicos por produto no período filtrado
    if (cards && cards.length > 0) {
      const productContacts = new Map<string, Set<string>>();
      
      cards.forEach((c) => {
        const contactId = c.contact_id;
        if (!contactId) return;

        (c.products || []).forEach((p) => {
          const productId = p.product_id;
          if (!productId) return;
          
          if (!productContacts.has(productId)) productContacts.set(productId, new Set());
          productContacts.get(productId)?.add(contactId);
        });
      });

      productContacts.forEach((contacts, productId) => {
        const name = nameById.get(productId) || productId || 'Produto';
        map.set(name, contacts.size);
      });
    }

    // 2. Complementa com o contact_count real (all-time) se o filtro de período não trouxe dados
    // (Ou se o mapa ainda está vazio)
    if (availableProducts && availableProducts.length > 0) {
      availableProducts.forEach((p) => {
        const name = p.name || 'Produto';
        const existing = map.get(name) || 0;
        const aggregated = typeof p.contact_count === 'number' ? p.contact_count : 0;

        // Se não temos dados do período para este produto, usamos o acumulado real
        if (existing === 0 && aggregated > 0) {
          map.set(name, aggregated);
        }
      });
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [cards, availableProducts]);

  // Atividades: tudo do Ranking de Trabalho vem de public.activities (como você explicou)
  const norm = (v?: string | null) => (v || '').toLowerCase().trim();
  const calls = activities.filter((a) => norm(a.type).includes('ligação') || norm(a.type).includes('ligacao') || norm(a.type).includes('chamada'));
  const callsAttended = activities.filter((a) => norm(a.type).includes('ligação atendida') || norm(a.type).includes('ligacao atendida'));
  const callsNotAttended = activities.filter((a) => norm(a.type).includes('ligação não atendida') || norm(a.type).includes('ligacao nao atendida') || norm(a.type).includes('ligacao não atendida'));
  const callsApproached = activities.filter((a) => norm(a.type).includes('ligação abordada') || norm(a.type).includes('ligacao abordada') || norm(a.status).includes('abordada'));
  const callsFollowUp = activities.filter((a) => norm(a.type).includes('follow') || norm(a.status).includes('follow'));
  const messages = activities.filter((a) => norm(a.type).includes('mensagem'));
  const whatsappSent = activities.filter((a) => norm(a.type).includes('whatsapp') || norm(a.status).includes('whatsapp'));
  const meetings = activities.filter((a) => norm(a.type).includes('reunião') || norm(a.type).includes('reuniao'));
  const meetingsDone = activities.filter((a) => norm(a.type).includes('realizada') || norm(a.status).includes('realizada'));
  const meetingsNotDone = activities.filter((a) => norm(a.type).includes('não realizada') || norm(a.type).includes('nao realizada') || norm(a.status).includes('não realizada') || norm(a.status).includes('nao realizada'));
  const meetingsRescheduled = activities.filter((a) => norm(a.type).includes('reagendada') || norm(a.type).includes('reagenda') || norm(a.status).includes('reagendada'));
  const proposals = activities.filter((a) => norm(a.type).includes('proposta'));
  const activeConversations = messages.reduce((set, m) => {
    if (m.contact_id) set.add(m.contact_id);
    return set;
  }, new Set<string>()).size;

  const conversion = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(1)) : 0);

  // Opções para conversões dinâmicas de Equipe – Conversão
  const teamMetricOptions = useMemo(() => {
    const activityLabels = [
      'Mensagem',
      'Ligação Não Atendida',
      'Ligação Atendida',
      'Ligação Abordada',
      'Ligação Agendada',
      'Ligação de Follow up',
      'Reunião Agendada',
      'Reunião Realizada',
      'Reunião Não Realizada',
      'Reunião Reagendada',
      'WhatsApp Enviado',
    ];
    return [
      { key: 'leads' as TeamMetricKey, label: 'Leads' },
      ...activityLabels.map((l) => ({ key: `activity:${l}` as TeamMetricKey, label: l })),
    ];
  }, []);

  const teamMetricCounts = useMemo(() => {
    const counts = new Map<TeamMetricKey, number>();
    // Leads = cards no recorte atual
    counts.set('leads', (cardsScoped || []).length);

    // Atividades por type (normalizado)
    const byType = new Map<string, number>();
    (activitiesScoped || []).forEach((a: any) => {
      const key = normalizeText(a?.type);
      if (!key) return;
      byType.set(key, (byType.get(key) || 0) + 1);
    });

    teamMetricOptions.forEach((opt) => {
      if (opt.key === 'leads') return;
      const rawLabel = opt.key.replace(/^activity:/, '');
      const k = normalizeText(rawLabel);
      counts.set(opt.key, byType.get(k) || 0);
    });

    return counts;
  }, [activitiesScoped, cardsScoped, teamMetricOptions]);

  // Agrupamentos por responsável para rankings
  const agentMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    agents.forEach((a) => map.set(a.id, { name: a.name }));
    return map;
  }, [agents]);

  const teamAggregates = useMemo<any[]>(() => {
    const agg: Record<string, any> = {};
    
    // 1. Inicializar com TODOS os agentes do workspace
    agents.forEach((a) => {
      agg[a.id] = {
        id: a.id,
        name: a.name,
        leads: 0,
        calls: 0,
        callsAttended: 0,
        callsNotAttended: 0,
        callsApproached: 0,
        callsFollowUp: 0,
        messages: 0,
        whatsappSent: 0,
        meetings: 0,
        meetingsDone: 0,
        meetingsNotDone: 0,
        meetingsRescheduled: 0,
        proposals: 0,
        sales: 0,
        revenue: 0,
        products: 0,
      };
    });

    // Entrada para "Agente IA" se houver dados atribuídos a IA (null)
    const ensure = (id: string | null | undefined) => {
      const key = id || 'ia';
      if (!agg[key]) {
        agg[key] = {
          id: key,
          name: key === 'ia' ? 'Agente IA' : 'Sem responsável',
          leads: 0,
          calls: 0,
          callsAttended: 0,
          callsNotAttended: 0,
          callsApproached: 0,
          callsFollowUp: 0,
          messages: 0,
          whatsappSent: 0,
          meetings: 0,
          meetingsDone: 0,
          meetingsNotDone: 0,
          meetingsRescheduled: 0,
          proposals: 0,
          sales: 0,
          revenue: 0,
          products: 0,
        };
      }
      return agg[key];
    };

    contacts.forEach((c) => {
      ensure(c.responsible_id).leads += 1;
    });

    activities.forEach((act) => {
      const target = ensure(act.responsible_id);
      const t = norm(act.type);

      // Mensagens
      if (t.includes('mensagem')) {
        target.messages += 1;
      }

      // Ligações
      if (t.includes('ligação') || t.includes('ligacao') || t.includes('chamada')) {
        target.calls += 1;
        if (t.includes('atendida')) target.callsAttended += 1;
        if (t.includes('não atendida') || t.includes('nao atendida')) target.callsNotAttended += 1;
        if (t.includes('abordada') || norm(act.status).includes('abordada')) target.callsApproached += 1;
        if (t.includes('follow') || norm(act.status).includes('follow')) target.callsFollowUp += 1;
      }

      // WhatsApp (atividade)
      if (t.includes('whatsapp') || norm(act.status).includes('whatsapp')) {
        target.whatsappSent += 1;
      }

      // Reuniões
      if (t.includes('reunião') || t.includes('reuniao')) {
        target.meetings += 1;
        if (t.includes('realizada') || norm(act.status).includes('realizada')) target.meetingsDone += 1;
        if (t.includes('não realizada') || t.includes('nao realizada') || norm(act.status).includes('não realizada') || norm(act.status).includes('nao realizada')) target.meetingsNotDone += 1;
        if (t.includes('reagendada') || t.includes('reagenda') || norm(act.status).includes('reagendada')) target.meetingsRescheduled += 1;
      }

      // Propostas (atividades)
      if (t.includes('proposta')) {
        target.proposals += 1;
      }
    });

    // Propostas provenientes da coleção dedicada (compatibilidade)
    proposals.forEach((p) => {
      ensure(p.responsible_id).proposals += 1;
    });

    const parseNumber = (v: any) => {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
      const parsed = Number(String(v).replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    cardsScoped.forEach((c) => {
      const s = (c.status || '').toLowerCase();
      const isWon = s === 'won' || s === 'ganho' || s === 'venda' || s === 'success' || s === 'sucesso';
      if (!isWon) return;

      const cardProducts = Array.isArray(c.products) ? c.products : [];
      const hasProducts = cardProducts.length > 0;
      if (!hasProducts) return; // considerar somente cartões ganhos com produto vinculado

      const target = ensure(c.responsible_user_id);
      if (!target) return;

      const revenueFromProducts = cardProducts.reduce((sum, pcp: any) => {
        const total = parseNumber(pcp.total_value ?? pcp.total ?? pcp.total_price);
        const unit = parseNumber(
          pcp.unit_value ??
          pcp.price ??
          pcp.value ??
          pcp.amount ??
          pcp.product_value ??
          pcp.product?.value ??
          pcp.unitPrice ??
          pcp.unit_price
        );
        const qty = parseNumber(pcp.quantity || 1);
        const base = total > 0 ? total : unit * (qty || 1);
        return sum + base;
      }, 0);

      // Se produtos não carregarem valor, use fallback do card.value
      const revenue = revenueFromProducts > 0 ? revenueFromProducts : Number(c.value || 0);

      const totalProductsQuantity = cardProducts.reduce((sum, pcp: any) => sum + Number(pcp.quantity || 1), 0);

      target.sales += 1;
      target.revenue += revenue;
      target.products += totalProductsQuantity;
    });

    return Object.values(agg);
  }, [agents, contacts, activities, proposals, cards]);

  const rankingVendas = useMemo<any[]>(() => {
    const list = [...teamAggregates].sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
    return list.map((row) => ({
      ...row,
      pa: row.sales > 0 ? Number(((row.products || 0) / row.sales).toFixed(2)) : 0,
      ticket: row.sales > 0 ? Number(((row.revenue || 0) / row.sales).toFixed(2)) : 0,
    }));
  }, [teamAggregates]);

  const rankingTrabalho = useMemo<any[]>(() => {
    // Base: todos os agentes do workspace com contagem 0 (para aparecerem mesmo sem atividades)
    const agg: Record<string, any> = {};
    agents.forEach((a) => {
      agg[a.id] = {
        id: a.id,
        name: a.name,
        mensagem: 0,
        ligacao_nao_atendida: 0,
        ligacao_atendida: 0,
        ligacao_abordada: 0,
        ligacao_agendada: 0,
        ligacao_follow_up: 0,
        reuniao_agendada: 0,
        reuniao_realizada: 0,
        reuniao_nao_realizada: 0,
        reuniao_reagendada: 0,
        whatsapp_enviado: 0,
      };
    });

    const ensure = (id: string | null | undefined) => {
      if (!id) return null; // não lista dados sem responsável
      const key = id;
      if (!agg[key]) {
        agg[key] = {
          id: key,
          name: key === 'ia' ? 'Agente IA' : 'Sem responsável',
          mensagem: 0,
          ligacao_nao_atendida: 0,
          ligacao_atendida: 0,
          ligacao_abordada: 0,
          ligacao_agendada: 0,
          ligacao_follow_up: 0,
          reuniao_agendada: 0,
          reuniao_realizada: 0,
          reuniao_nao_realizada: 0,
          reuniao_reagendada: 0,
          whatsapp_enviado: 0,
        };
      }
      return agg[key];
    };

    (teamWorkRankingData || []).forEach((r) => {
      const t = ensure(r.responsible_id);
      if (!t) return;
      t.mensagem = Number(r.mensagem || 0);
      t.ligacao_nao_atendida = Number(r.ligacao_nao_atendida || 0);
      t.ligacao_atendida = Number(r.ligacao_atendida || 0);
      t.ligacao_abordada = Number(r.ligacao_abordada || 0);
      t.ligacao_agendada = Number(r.ligacao_agendada || 0);
      t.ligacao_follow_up = Number(r.ligacao_follow_up || 0);
      t.reuniao_agendada = Number(r.reuniao_agendada || 0);
      t.reuniao_realizada = Number(r.reuniao_realizada || 0);
      t.reuniao_nao_realizada = Number(r.reuniao_nao_realizada || 0);
      t.reuniao_reagendada = Number(r.reuniao_reagendada || 0);
      t.whatsapp_enviado = Number(r.whatsapp_enviado || 0);
    });

    const list = Object.values(agg).map((row: any) => {
      const total =
        (row.mensagem || 0) +
        (row.ligacao_nao_atendida || 0) +
        (row.ligacao_atendida || 0) +
        (row.ligacao_abordada || 0) +
        (row.ligacao_agendada || 0) +
        (row.ligacao_follow_up || 0) +
        (row.reuniao_agendada || 0) +
        (row.reuniao_realizada || 0) +
        (row.reuniao_nao_realizada || 0) +
        (row.reuniao_reagendada || 0) +
        (row.whatsapp_enviado || 0);
      return { ...row, total };
    });

    return list.sort((a: any, b: any) => (b.total || 0) - (a.total || 0));
  }, [agents, teamWorkRankingData]);

  const hasDateRange = !!(startDate && endDate);
  const periodLabel = !hasDateRange
    ? 'Todos os períodos'
    : periodPreset !== 'custom'
      ? {
          all: 'Todos os períodos',
          today: 'Hoje',
          last7: 'Últimos 7 dias',
          last30: 'Últimos 30 dias',
        }[periodPreset]
      : `${format(startDate!, "dd/MM/yyyy", { locale: ptBR })} - ${format(endDate!, "dd/MM/yyyy", { locale: ptBR })}`;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="flex flex-col h-full bg-white border border-gray-300 m-2 shadow-sm font-sans text-xs dark:bg-[#0e0e0e] dark:border-gray-700 dark:text-gray-100">
        {/* Header */}
        <div className="flex flex-col border-b border-gray-300 bg-[#f8f9fa] dark:border-gray-700 dark:bg-[#141414]">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 h-auto" style={{ fontSize: '15px' }}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-gray-100" style={{ fontSize: '1.5rem' }}>Relatórios</span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 pb-3">
            <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">Filtros avançados</span>
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#e6e6e6] dark:bg-[#050505] relative">
          <div className="block w-full align-middle bg-white dark:bg-[#111111]">
            <div className="p-4 space-y-4">
              {/* Área Principal */}
              <div className="flex flex-col overflow-hidden border border-[#d4d4d4] dark:border-gray-800 bg-white dark:bg-[#0f0f0f] shadow-sm p-4 space-y-6 min-h-0">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando dados...
          </div>
        )}

        {/* Funil – Indicadores */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Filter className="h-4 w-4" />
              Funil – Indicadores
            </div>

            <div className="flex items-center gap-2">
              {canSaveFilters && (
                <Button
                  className="h-8 px-3 text-xs rounded-none"
                  onClick={async () => {
                    const ok = await savePreset(draftFunnels);
                    if (ok) {
                      setSavedSnapshot(draftFunnels);
                      setFunnelsDirty(false);
                      const userKey = user?.id ? `relatorios:filtros:${user.id}` : null;
                      if (userKey) {
                        localStorage.setItem(userKey, JSON.stringify(draftFunnels));
                      }
                    }
                  }}
                  disabled={!funnelsDirty || loadingFunnelsPreset}
                >
                  Salvar
                </Button>
              )}
            </div>
          </div>

          {/* Builder: múltiplos funis */}
          <div className="space-y-3">
            {draftFunnels.map((f: any, idx: number) => (
              <div key={f.id} className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0f0f0f]">
                <QueryBuilderSidebar
                  pipelines={pipelines || []}
                  tags={availableTags || []}
                  products={availableProducts || []}
                  agents={agents || []}
                  selectedWorkspaceId={selectedWorkspaceId || workspaces?.[0]?.workspace_id || ''}
                  onFiltersChange={(filters) => {
                    const cleaned = sanitizeGroupsForPersist(filters || []);
                    const sig = serializeGroups(cleaned);
                    setDraftFunnels((prev: any[]) => {
                      const current = prev.find((x) => x.id === f.id);
                      if (serializeGroups(current?.filters || []) === sig) return prev;
                      const next = prev.map((x) => (x.id === f.id ? { ...x, filters: cleaned } : x));
                      const userKey = user?.id ? `relatorios:filtros:${user.id}` : null;
                      if (userKey) {
                        localStorage.setItem(userKey, JSON.stringify(next));
                      }
                      return next;
                    });
                    setFunnelsDirty(true);
                  }}
                  initialFilters={f.filters}
                  rehydrateNonce={rehydrateNonce}
                  showHeader={false}
                  disabled={!canEditIndicatorFunnels}
                />
              </div>
            ))}

          </div>

          {/* Gráfico global (agora acima dos cards de indicadores) */}
          {leadsSeriesGlobal.length > 0 && (
            <Card className="rounded-none border-gray-200 dark:border-gray-700 dark:bg-[#1b1b1b]">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-gray-700 dark:text-gray-200">
                  Evolução de Leads — Geral
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={leadsSeriesGlobal}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1f2937' : '#e5e7eb'} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: isDark ? '#e5e7eb' : '#4b5563' }}
                        stroke={isDark ? '#e5e7eb' : '#4b5563'}
                        tickFormatter={(val: string) => format(new Date(val), 'dd/MM')}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: isDark ? '#e5e7eb' : '#4b5563' }}
                        stroke={isDark ? '#e5e7eb' : '#4b5563'}
                        allowDecimals={false}
                      />
                      <ReTooltip
                        formatter={(value: number, name: string) => [value, (name === 'received' || name === 'Recebidos') ? 'Recebidos' : 'Qualificados']}
                        labelFormatter={(label: string) => `Data: ${format(new Date(label), 'dd/MM/yyyy')}`}
                        contentStyle={{
                          backgroundColor: isDark ? '#1b1b1b' : '#fff',
                          borderColor: isDark ? '#374151' : '#d4d4d4',
                          color: isDark ? '#fff' : '#000',
                          fontSize: '10px',
                          borderRadius: '0px',
                        }}
                        itemStyle={{ color: isDark ? '#e2e8f0' : '#374151' }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={24}
                        iconType="circle"
                        wrapperStyle={{
                          fontSize: '10px',
                          color: isDark ? '#ffffff' : '#4b5563',
                          paddingBottom: '4px',
                        }}
                        formatter={(value: string) => (value === 'received' || value === 'Recebidos' ? 'Recebidos' : 'Qualificados')}
                      />
                      <Line type="monotone" dataKey="received" name="Recebidos" stroke="#3B82F6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="qualified" name="Qualificados" stroke="#F59E0B" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Render: indicadores por funil */}
          <div className="space-y-3">
            {indicatorFunnels.map((f: any) => (
              <div key={f.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                <Card className="rounded-none border-gray-200 dark:border-gray-700 md:col-span-3 h-fit dark:bg-[#1b1b1b]">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs text-gray-700 dark:text-gray-200">
                      Leads — {f.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="grid grid-cols-1 gap-1 text-[11px] text-gray-900 dark:text-gray-100">
                      {[
                        { label: 'Leads recebidos', value: f.leadsReceived },
                        { label: 'Leads qualificados', value: f.leadsQualified },
                        { label: 'Vendas realizadas', value: f.leadsWon },
                        { label: 'Leads perdidos 1', value: f.leadsLost1 },
                        { label: 'Leads perdidos 2', value: f.leadsLost2 },
                        { label: 'Leads perdidos 3', value: f.leadsLost3 },
                      ].map((item, idx) => (
                        <div
                          key={item.label}
                          className={`flex items-center justify-between ${idx < 5 ? 'border-b border-gray-50 dark:border-gray-800 pb-1' : ''}`}
                        >
                          <span className="truncate pr-2">{item.label}</span>
                          <strong className="text-xs whitespace-nowrap min-w-[32px] text-right">{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-none border-gray-200 dark:border-gray-700 md:col-span-9 dark:bg-[#1b1b1b]">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs text-gray-700 dark:text-gray-200">
                      Leads por Etiqueta / Produto — {f.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-64 flex gap-3">
                      <div className="w-36 text-[11px] text-gray-700 dark:text-gray-200 flex flex-col gap-1 overflow-y-auto">
                        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Etiquetas</p>
                        {f.leadsByTag.length === 0 ? (
                          <span className="text-gray-500 dark:text-gray-400">Sem dados</span>
                        ) : (
                          f.leadsByTag.map((item: any, i: number) => (
                            <div key={item.name} className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full inline-block"
                                style={{ backgroundColor: pieColors[i % pieColors.length] }}
                              />
                              <span className="truncate" title={item.name}>{item.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex-1">
                        {f.leadsByTag.length === 0 ? (
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 h-full flex items-center justify-center border border-dashed border-gray-200 dark:border-gray-800">Sem dados de etiquetas</div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={f.leadsByTag}
                                dataKey="value"
                                nameKey="name"
                                outerRadius={85}
                                label={({ cx, cy, midAngle, outerRadius, percent }) => {
                                  const radius = outerRadius * 1.1;
                                  const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
                                  const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
                                  return (
                                    <text x={x} y={y} fill={isDark ? '#ffffff' : '#4b5563'} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="10">
                                      {`${(percent * 100).toFixed(1)}%`}
                                    </text>
                                  );
                                }}
                                labelLine={{ stroke: isDark ? '#4b5563' : '#d1d5db' }}
                              >
                                {f.leadsByTag.map((_: any, i: number) => (
                                  <Cell key={i} fill={pieColors[i % pieColors.length]} />
                                ))}
                              </Pie>
                              <ReTooltip
                                formatter={(value: number, _: any, entry: any) => [`${value}`, entry?.name]}
                                contentStyle={{
                                  backgroundColor: isDark ? '#1b1b1b' : '#fff',
                                  borderColor: isDark ? '#374151' : '#d4d4d4',
                                  color: isDark ? '#fff' : '#000',
                                  fontSize: '10px',
                                  borderRadius: '0px',
                                }}
                                itemStyle={{ color: isDark ? '#e2e8f0' : '#374151' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    <div className="h-64 flex gap-3 border-l border-gray-100 dark:border-gray-800 pl-4">
                      <div className="w-36 text-[11px] text-gray-700 dark:text-gray-200 flex flex-col gap-1 overflow-y-auto">
                        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Produtos</p>
                        {f.leadsByProduct.length === 0 ? (
                          <span className="text-gray-500 dark:text-gray-400">Sem dados</span>
                        ) : (
                          f.leadsByProduct.map((item: any, i: number) => (
                            <div key={item.name} className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full inline-block"
                                style={{ backgroundColor: pieColors[(i + 3) % pieColors.length] }}
                              />
                              <span className="truncate" title={item.name}>{item.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex-1">
                        {f.leadsByProduct.length === 0 ? (
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 h-full flex items-center justify-center border border-dashed border-gray-200 dark:border-gray-800">Sem dados de produtos</div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={f.leadsByProduct}
                                dataKey="value"
                                nameKey="name"
                                outerRadius={85}
                                label={({ cx, cy, midAngle, outerRadius, percent }) => {
                                  const radius = outerRadius * 1.1;
                                  const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
                                  const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
                                  return (
                                    <text x={x} y={y} fill={isDark ? '#ffffff' : '#4b5563'} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="10">
                                      {`${(percent * 100).toFixed(1)}%`}
                                    </text>
                                  );
                                }}
                                labelLine={{ stroke: isDark ? '#4b5563' : '#d1d5db' }}
                              >
                                {f.leadsByProduct.map((_: any, i: number) => (
                                  <Cell key={i} fill={pieColors[(i + 3) % pieColors.length]} />
                                ))}
                              </Pie>
                              <ReTooltip
                                formatter={(value: number, _: any, entry: any) => [`${value}`, entry?.name]}
                                contentStyle={{
                                  backgroundColor: isDark ? '#1b1b1b' : '#fff',
                                  borderColor: isDark ? '#374151' : '#d4d4d4',
                                  color: isDark ? '#fff' : '#000',
                                  fontSize: '10px',
                                  borderRadius: '0px',
                                }}
                                itemStyle={{ color: isDark ? '#e2e8f0' : '#374151' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>
            ))}
          </div>
        </section>

        {/* Funil – Conversão */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Filter className="h-4 w-4" />
              Funil – Conversão
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 px-2 text-[10px] rounded-none border-dashed border-[#d4d4d4] dark:border-gray-700"
              onClick={addCustomConversion}
            >
              <Plus className="h-3 w-3 mr-1" />
              Nova Conversão
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Conversões Customizadas */}
            {customConversions.map((conv) => {
              const countA = cardsScoped.filter(c => 
                (conv.pipelineA === 'all' || c.pipeline_id === conv.pipelineA) && 
                (conv.columnA === 'all' || c.column_id === conv.columnA)
              ).length;
              const countB = cardsScoped.filter(c => 
                (conv.pipelineB === 'all' || c.pipeline_id === conv.pipelineB) && 
                (conv.columnB === 'all' || c.column_id === conv.columnB)
              ).length;
              const result = conversion(countA, countB);

              if (conv.isEditing) {
                return (
                  <Card key={conv.id} className="rounded-none border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/10">
                    <CardContent className="p-2 space-y-2">
                      <Input
                        placeholder="Título da conversão (ex: Leads / Vendas)"
                        value={conv.name}
                        onChange={(e) => setCustomConversions(prev => prev.map(c => c.id === conv.id ? { ...c, name: e.target.value } : c))}
                        className="h-7 text-[10px] rounded-none border-[#d4d4d4] dark:border-gray-700"
                      />
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1">
                          <Select 
                            value={conv.pipelineA} 
                            onValueChange={(v) => {
                              setCustomConversions(prev => prev.map(c => c.id === conv.id ? { ...c, pipelineA: v, columnA: 'all' } : c));
                              fetchColumnsForPipeline(v);
                            }}
                          >
                            <SelectTrigger className="h-7 text-[10px] min-w-[80px] rounded-none border-[#d4d4d4] dark:border-gray-700">
                              <SelectValue placeholder="Pipeline A" />
                            </SelectTrigger>
                            <SelectContent className="text-[10px]">
                              <SelectItem value="all">Todos os Pipelines</SelectItem>
                              {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <span className="text-[10px] text-gray-400">/</span>
                          <Select 
                            value={conv.columnA} 
                            onValueChange={(v) => setCustomConversions(prev => prev.map(c => c.id === conv.id ? { ...c, columnA: v } : c))}
                            disabled={conv.pipelineA === 'all'}
                          >
                            <SelectTrigger className="h-7 text-[10px] min-w-[80px] rounded-none border-[#d4d4d4] dark:border-gray-700">
                              <SelectValue placeholder={loadingColumnsMap[conv.pipelineA] ? "..." : "Etapas"} />
                            </SelectTrigger>
                            <SelectContent className="text-[10px]">
                              <SelectItem value="all">Todas as Etapas</SelectItem>
                              {(pipelineColumnsMap[conv.pipelineA] || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-1">
                          <Select 
                            value={conv.pipelineB} 
                            onValueChange={(v) => {
                              setCustomConversions(prev => prev.map(c => c.id === conv.id ? { ...c, pipelineB: v, columnB: 'all' } : c));
                              fetchColumnsForPipeline(v);
                            }}
                          >
                            <SelectTrigger className="h-7 text-[10px] min-w-[80px] rounded-none border-[#d4d4d4] dark:border-gray-700">
                              <SelectValue placeholder="Pipeline B" />
                            </SelectTrigger>
                            <SelectContent className="text-[10px]">
                              <SelectItem value="all">Todos os Pipelines</SelectItem>
                              {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <span className="text-[10px] text-gray-400">/</span>
                          <Select 
                            value={conv.columnB} 
                            onValueChange={(v) => setCustomConversions(prev => prev.map(c => c.id === conv.id ? { ...c, columnB: v } : c))}
                            disabled={conv.pipelineB === 'all'}
                          >
                            <SelectTrigger className="h-7 text-[10px] min-w-[80px] rounded-none border-[#d4d4d4] dark:border-gray-700">
                              <SelectValue placeholder={loadingColumnsMap[conv.pipelineB] ? "..." : "Etapas"} />
                            </SelectTrigger>
                            <SelectContent className="text-[10px]">
                              <SelectItem value="all">Todas as Etapas</SelectItem>
                              {(pipelineColumnsMap[conv.pipelineB] || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-1 pt-1">
                        <Button 
                          size="icon" variant="ghost" className="h-6 w-6 text-green-600"
                          onClick={() => {
                            const next = customConversions.map(c => c.id === conv.id ? { ...c, isEditing: false } : c);
                            setCustomConversions(next);
                            saveCustomConversions(next);
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600" onClick={() => removeCustomConversion(conv.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <Card key={conv.id} className="rounded-none border-gray-200 dark:border-gray-700 dark:bg-[#1b1b1b] relative group">
                  <CardContent className="p-3">
                    <div className="flex flex-col gap-0.5 mb-1">
                      <div className="text-[11px] font-medium text-gray-700 dark:text-gray-200 truncate">{conv.name || 'Conversão'}</div>
                    </div>
                    <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{result}%</div>
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                      <Button 
                        size="icon" variant="ghost" className="h-5 w-5" 
                        onClick={() => {
                          setCustomConversions(prev => prev.map(c => c.id === conv.id ? { ...c, isEditing: true } : c));
                          fetchColumnsForPipeline(conv.pipelineA);
                          fetchColumnsForPipeline(conv.pipelineB);
                        }}
                      >
                        <Plus className="h-3 w-3 rotate-45" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-red-400" onClick={() => removeCustomConversion(conv.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {customConversions.length === 0 && (
              <Card className="rounded-none border-gray-200 dark:border-gray-700 dark:bg-[#1b1b1b]">
                <CardContent className="p-3">
                  <div className="text-[11px] text-gray-600 dark:text-gray-300">
                    Nenhuma conversão criada. Clique em <span className="font-medium">Nova Conversão</span>.
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* Equipe – Indicadores */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Users className="h-4 w-4" />
            Equipe – Indicadores
          </div>
          <div className="overflow-auto border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-xs table-auto">
              <thead className="bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left">Indicador</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { k: 'Leads recebidos', v: leadsReceived },
                  { k: 'Ligações realizadas', v: calls.length },
                  { k: 'Ligações atendidas', v: callsAttended.length },
                  { k: 'Ligações não atendidas', v: callsNotAttended.length },
                  { k: 'Ligações abordadas', v: callsApproached.length },
                  { k: 'Mensagens enviadas', v: messages.length },
                  { k: 'Reuniões agendadas', v: meetings.length },
                  { k: 'Reuniões realizadas', v: meetings.filter((m) => m.status === 'realizada').length },
                  { k: 'Propostas enviadas', v: proposals.length },
                  { k: 'Vendas realizadas', v: leadsWon },
                ].map((row) => (
                  <tr key={row.k} className="border-t border-gray-200 dark:border-gray-800">
                    <td className="px-3 py-2">{row.k}</td>
                    <td className="px-3 py-2 text-right font-semibold">{row.v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Equipe – Conversão (dinâmica) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Users className="h-4 w-4" />
              Equipe – Conversão
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[10px] rounded-none border-dashed border-[#d4d4d4] dark:border-gray-700"
              onClick={addTeamConversion}
            >
              <Plus className="h-3 w-3 mr-1" />
              Nova Conversão
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {teamConversions.map((conv) => {
              const countA = teamMetricCounts.get(conv.metricA) || 0;
              const countB = teamMetricCounts.get(conv.metricB) || 0;
              const result = conversion(countA, countB);

              const labelA = teamMetricOptions.find((o) => o.key === conv.metricA)?.label || 'A';
              const labelB = teamMetricOptions.find((o) => o.key === conv.metricB)?.label || 'B';

              if (conv.isEditing) {
                return (
                  <Card key={conv.id} className="rounded-none border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/10">
                    <CardContent className="p-2 space-y-2">
                      <Input
                        placeholder="Título da conversão"
                        value={conv.name}
                        onChange={(e) =>
                          setTeamConversions((prev) => prev.map((c) => (c.id === conv.id ? { ...c, name: e.target.value } : c)))
                        }
                        className="h-7 text-[10px] rounded-none border-[#d4d4d4] dark:border-gray-700"
                      />

                      <div className="flex items-center gap-1">
                        <Select
                          value={conv.metricA}
                          onValueChange={(v) =>
                            setTeamConversions((prev) => prev.map((c) => (c.id === conv.id ? { ...c, metricA: v as TeamMetricKey } : c)))
                          }
                        >
                          <SelectTrigger className="h-7 text-[10px] min-w-[110px] rounded-none border-[#d4d4d4] dark:border-gray-700">
                            <SelectValue placeholder="Métrica A" />
                          </SelectTrigger>
                          <SelectContent className="text-[10px]">
                            {teamMetricOptions.map((o) => (
                              <SelectItem key={o.key} value={o.key}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <span className="text-[10px] text-gray-400">/</span>

                        <Select
                          value={conv.metricB}
                          onValueChange={(v) =>
                            setTeamConversions((prev) => prev.map((c) => (c.id === conv.id ? { ...c, metricB: v as TeamMetricKey } : c)))
                          }
                        >
                          <SelectTrigger className="h-7 text-[10px] min-w-[110px] rounded-none border-[#d4d4d4] dark:border-gray-700">
                            <SelectValue placeholder="Métrica B" />
                          </SelectTrigger>
                          <SelectContent className="text-[10px]">
                            {teamMetricOptions.map((o) => (
                              <SelectItem key={o.key} value={o.key}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-end gap-1 pt-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-green-600"
                          onClick={() => {
                            const next = teamConversions.map((c) => (c.id === conv.id ? { ...c, isEditing: false } : c));
                            setTeamConversions(next);
                            saveTeamConversions(next);
                          }}
                          title="Salvar"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-600"
                          onClick={() => removeTeamConversion(conv.id)}
                          title="Remover"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <Card key={conv.id} className="rounded-none border-gray-200 dark:border-gray-700 dark:bg-[#1b1b1b] relative group">
                  <CardContent className="p-3">
                    <div className="flex flex-col gap-0.5 mb-1">
                      <div className="text-[11px] font-medium text-gray-700 dark:text-gray-200 truncate">{conv.name || 'Conversão'}</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {labelA} / {labelB}
                      </div>
                    </div>
                    <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{result}%</div>
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => setTeamConversions((prev) => prev.map((c) => (c.id === conv.id ? { ...c, isEditing: true } : c)))}
                        title="Editar"
                      >
                        <Plus className="h-3 w-3 rotate-45" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 text-red-400"
                        onClick={() => removeTeamConversion(conv.id)}
                        title="Remover"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {teamConversions.length === 0 && (
              <Card className="rounded-none border-gray-200 dark:border-gray-700 dark:bg-[#1b1b1b]">
                <CardContent className="p-3">
                  <div className="text-[11px] text-gray-600 dark:text-gray-300">
                    Nenhuma conversão criada. Clique em <span className="font-medium">Nova Conversão</span>.
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* Ranking – Vendas */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Users className="h-4 w-4" />
            Equipe – Ranking de Vendas
          </div>
          <div className="overflow-auto border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-xs table-auto">
              <thead className="bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left">Usuário</th>
                  <th className="px-3 py-2 text-right">Faturamento</th>
                  <th className="px-3 py-2 text-right">Vendas</th>
                  <th className="px-3 py-2 text-right">Produtos</th>
                  <th className="px-3 py-2 text-right">PA</th>
                  <th className="px-3 py-2 text-right">Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {rankingVendas.map((row) => (
                  <tr key={row.id} className="border-t border-gray-200 dark:border-gray-800">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 text-right">{row.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="px-3 py-2 text-right">{row.sales}</td>
                    <td className="px-3 py-2 text-right">{row.products}</td>
                    <td className="px-3 py-2 text-right">{row.pa}</td>
                    <td className="px-3 py-2 text-right">{row.ticket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Ranking – Trabalho */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Users className="h-4 w-4" />
            Equipe – Ranking de Trabalho
          </div>
          <div className="overflow-auto border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left">Usuário</th>
                  <th className="px-3 py-2 text-right">Mensagem</th>
                  <th className="px-3 py-2 text-right">Ligação não atendida</th>
                  <th className="px-3 py-2 text-right">Ligação atendida</th>
                  <th className="px-3 py-2 text-right">Ligação abordada</th>
                  <th className="px-3 py-2 text-right">Ligação agendada</th>
                  <th className="px-3 py-2 text-right">Ligação de follow up</th>
                  <th className="px-3 py-2 text-right">Reunião agendada</th>
                  <th className="px-3 py-2 text-right">Reunião realizada</th>
                  <th className="px-3 py-2 text-right">Reunião não realizada</th>
                  <th className="px-3 py-2 text-right">Reunião reagendada</th>
                  <th className="px-3 py-2 text-right">WhatsApp enviado</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rankingTrabalho.map((row) => (
                  <tr key={row.id} className="border-t border-gray-200 dark:border-gray-800">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 text-right">{row.mensagem}</td>
                    <td className="px-3 py-2 text-right">{row.ligacao_nao_atendida}</td>
                    <td className="px-3 py-2 text-right">{row.ligacao_atendida}</td>
                    <td className="px-3 py-2 text-right">{row.ligacao_abordada}</td>
                    <td className="px-3 py-2 text-right">{row.ligacao_agendada}</td>
                    <td className="px-3 py-2 text-right">{row.ligacao_follow_up}</td>
                    <td className="px-3 py-2 text-right">{row.reuniao_agendada}</td>
                    <td className="px-3 py-2 text-right">{row.reuniao_realizada}</td>
                    <td className="px-3 py-2 text-right">{row.reuniao_nao_realizada}</td>
                    <td className="px-3 py-2 text-right">{row.reuniao_reagendada}</td>
                    <td className="px-3 py-2 text-right">{row.whatsapp_enviado}</td>
                    <td className="px-3 py-2 text-right font-semibold">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

