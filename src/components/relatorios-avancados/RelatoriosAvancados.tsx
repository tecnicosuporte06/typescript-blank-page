// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { Workspace, useWorkspace } from '@/contexts/WorkspaceContext';
import { usePipelinesContext } from '@/contexts/PipelinesContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip as ReTooltip, Legend } from 'recharts';
import { Filter, Users, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QueryBuilderSidebar } from './QueryBuilderSidebar';

type PeriodPreset = 'today' | 'last7' | 'last30' | 'custom';

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

export function RelatoriosAvancados({ workspaces = [] }: RelatoriosAvancadosProps) {
  const { selectedWorkspace, workspaces: ctxWorkspaces } = useWorkspace();
  const { user, userRole } = useAuth();
  const { pipelines: ctxPipelines, fetchPipelines: fetchCtxPipelines } = usePipelinesContext();

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('last30');
  const [startDate, setStartDate] = useState<Date | null>(startOfDay(subDays(new Date(), 29)));
  const [endDate, setEndDate] = useState<Date | null>(endOfDay(new Date()));
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
  const [cards, setCards] = useState<PipelineCardRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'bi' | 'kpis' | 'funnel'>('funnel');
  const [sidebarFilters, setSidebarFilters] = useState<Array<{ type: 'pipeline' | 'team' | 'tags' | 'date' | 'status' | 'value'; value: string; operator?: string }>>([]);

  const applyPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    switch (preset) {
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
      .select('user_id, system_users(id, name)')
      .eq('workspace_id', workspaceId);
    if (error) {
      console.error('Erro ao buscar usuários do workspace:', error);
      setAgents([]);
      return;
    }
    const agentsList = (data || [])
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

  const fetchData = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const hasDateRange = !!(startDate && endDate);
      const from = hasDateRange ? startDate!.toISOString() : null;
      const to = hasDateRange ? endDate!.toISOString() : null;

      // Contacts (leads)
      // @ts-ignore simplificando tipagem dinâmica para evitar profundidade de generics
      let contactsQuery = supabase
        .from('contacts')
        .select('id, created_at, responsible_id, status, workspace_id');
      if (hasDateRange && from && to) {
        contactsQuery = contactsQuery.gte('created_at', from).lte('created_at', to);
      }

      // Activities (ligações/mensagens/reuniões)
      // @ts-ignore simplificando tipagem dinâmica
      let activitiesQuery = supabase
        .from('activities')
        .select('id, contact_id, responsible_id, type, status, created_at, workspace_id');
      if (hasDateRange && from && to) {
        activitiesQuery = activitiesQuery.gte('created_at', from).lte('created_at', to);
      }

      // Pipeline cards para produtos e status de venda/perda
      // @ts-ignore simplificando tipagem dinâmica
      let cardsQuery = supabase
        .from('pipeline_cards')
        .select('id, contact_id, value, status, workspace_id, pipeline_id, responsible_user_id, created_at, pipeline_cards_products(product_id)');
      // Removido filtro de data para cards para garantir que negócios ganhos apareçam independente da data de criação,
      // pois o status de "ganho" reflete o estado atual do negócio no funil.

      // Tags
      // @ts-ignore simplificando tipagem dinâmica
      let tagsQuery = supabase
        .from('contact_tags')
        .select('contact_id, tag_id, tags(name), contacts!inner(id, workspace_id)');
      if (hasDateRange && from && to) {
        tagsQuery = tagsQuery.gte('contacts.created_at', from).lte('contacts.created_at', to);
      }

      // Conversations (assumidas)
      let conversationsQuery = supabase
        .from('conversations')
        .select('id, contact_id, assigned_user_id, created_at, workspace_id');
      if (hasDateRange && from && to) {
        conversationsQuery = conversationsQuery.gte('created_at', from).lte('created_at', to);
      }

      // Workspace filter
      if (selectedWorkspaceId) {
        contactsQuery = contactsQuery.eq('workspace_id', selectedWorkspaceId);
        activitiesQuery = activitiesQuery.eq('workspace_id', selectedWorkspaceId);
        cardsQuery = cardsQuery.eq('workspace_id', selectedWorkspaceId);
        tagsQuery = tagsQuery.eq('contacts.workspace_id', selectedWorkspaceId);
        conversationsQuery = conversationsQuery.eq('workspace_id', selectedWorkspaceId);
      }

      // Permissões
      if (userRole === 'user') {
        contactsQuery = contactsQuery.eq('responsible_id', user.id);
        activitiesQuery = activitiesQuery.eq('responsible_id', user.id);
        cardsQuery = cardsQuery.eq('responsible_user_id', user.id);
        conversationsQuery = conversationsQuery.eq('assigned_user_id', user.id);
      } else if (selectedAgent !== 'all' && selectedAgent !== 'ia') {
        contactsQuery = contactsQuery.eq('responsible_id', selectedAgent);
        activitiesQuery = activitiesQuery.eq('responsible_id', selectedAgent);
        cardsQuery = cardsQuery.eq('responsible_user_id', selectedAgent);
        conversationsQuery = conversationsQuery.eq('assigned_user_id', selectedAgent);
      } else if (selectedAgent === 'ia') {
        // Filtrar interações do agente de IA (responsável nulo)
        contactsQuery = contactsQuery.is('responsible_id', null);
        activitiesQuery = activitiesQuery.is('responsible_id', null);
        cardsQuery = cardsQuery.is('responsible_user_id', null);
        conversationsQuery = conversationsQuery.is('assigned_user_id', null);
      }

      const [
        { data: contactsData, error: contactsError },
        { data: activitiesData, error: activitiesError },
        { data: cardsData, error: cardsError },
        { data: tagsData, error: tagsError },
        { data: conversationsData, error: conversationsError }
      ] = await Promise.all([contactsQuery, activitiesQuery, cardsQuery, tagsQuery, conversationsQuery]);

      if (contactsError) throw contactsError;
      if (activitiesError) throw activitiesError;
      if (cardsError) throw cardsError;
      if (tagsError) throw tagsError;
      if (conversationsError) throw conversationsError;

      const contactsFiltered = (((contactsData as unknown) as ContactRecord[]) || []).filter((c) => {
        if (selectedTags.length > 0) {
          const hasTag = ((tagsData || []) as any[]).some(
            (t: any) => t.contact_id === c.id && selectedTags.includes(t.tag_id || (t.tags as any)?.id)
          );
          if (!hasTag) return false;
        }
        return true;
      });

      let cardsFiltered = (((cardsData as unknown) as PipelineCardRecord[]) || []).map((c) => ({
        id: c.id,
        contact_id: (c as any).contact_id,
        value: (c as any).value,
        status: (c as any).status,
        pipeline_id: (c as any).pipeline_id,
        responsible_user_id: (c as any).responsible_user_id,
        created_at: (c as any).created_at,
        products: (c as any).pipeline_cards_products || [],
      }));

      // Aplicar filtros da sidebar
      const statusFilter = sidebarFilters.find(f => f.type === 'status');
      const valueFilter = sidebarFilters.find(f => f.type === 'value');

      if (selectedFunnel !== 'all') {
        cardsFiltered = cardsFiltered.filter((c) => c.pipeline_id === selectedFunnel);
      }

      if (statusFilter?.value) {
        cardsFiltered = cardsFiltered.filter((c) => (c.status || '').toLowerCase() === statusFilter.value.toLowerCase());
      }

      if (valueFilter?.value) {
        const valueNum = parseFloat(valueFilter.value);
        if (!isNaN(valueNum)) {
          switch (valueFilter.operator) {
            case 'equals':
              cardsFiltered = cardsFiltered.filter((c) => c.value === valueNum);
              break;
            case 'greater':
              cardsFiltered = cardsFiltered.filter((c) => (c.value || 0) > valueNum);
              break;
            case 'less':
              cardsFiltered = cardsFiltered.filter((c) => (c.value || 0) < valueNum);
              break;
          }
        }
      }

      // Atividades: só recorta por tag se houver filtro de tag; funil não limita para manter dados gerais.
      const allowedContactIds = new Set<string>();
      if (selectedTags.length > 0) {
        ((tagsData || []) as any[]).forEach((t: any) => {
          if (t.contact_id && selectedTags.includes(t.tag_id)) {
            allowedContactIds.add(t.contact_id);
          }
        });
      }

      // Aplicar filtro de tags nos cards também
      if (selectedTags.length > 0) {
        cardsFiltered = cardsFiltered.filter(c => c.contact_id && allowedContactIds.has(c.contact_id));
      }

      // Não restringe por funil (funnel) para garantir visão geral; somente tags filtram contatos.
      const finalContacts = contactsFiltered;

      const activitiesFiltered = (((activitiesData as unknown) as ActivityRecord[]) || []).filter((a) => {
        if (allowedContactIds.size === 0) return true;
        return a.contact_id ? allowedContactIds.has(a.contact_id) : false;
      });

      const conversationsFiltered = (conversationsData || []).filter((conv: any) => {
        if (selectedTags.length > 0) {
          const hasTag = ((tagsData || []) as any[]).some(
            (t: any) => t.contact_id === conv.contact_id && selectedTags.includes(t.tag_id || (t.tags as any)?.id)
          );
          if (!hasTag) return false;
        }
        return true;
      });

      setContacts(finalContacts);
      setActivities(activitiesFiltered);
      setCards(cardsFiltered);
      setConversations(conversationsFiltered);
      // Sempre carregamos todas as tags do workspace para o gráfico, mesmo sem filtro
      setTags(
        ((tagsData || []) as any[]).map((t) => ({
          contact_id: (t as any).contact_id,
          tag_id: (t as any).tag_id,
          tag: (t as any).tags,
        }))
      );
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
      setSidebarFilters([]); // Reset filtros da sidebar também
    } else {
      setPipelines([]);
      setAvailableTags([]);
      setAgents([]);
      setSidebarFilters([]);
    }
  }, [selectedWorkspaceId]);

  // Aplicar filtros da sidebar
  useEffect(() => {
    const pipelineFilter = sidebarFilters.find(f => f.type === 'pipeline');
    const teamFilter = sidebarFilters.find(f => f.type === 'team');
    const tagFilters = sidebarFilters.filter(f => f.type === 'tags');
    
    setSelectedFunnel(pipelineFilter?.value || 'all');
    setSelectedAgent(teamFilter?.value || 'all');
    setSelectedTags(tagFilters.map(f => f.value));
    
    // Os filtros de data, status e valor serão aplicados diretamente na query fetchData
  }, [sidebarFilters]);

  useEffect(() => {
    fetchData();
  }, [periodPreset, startDate, endDate, selectedAgent, userRole, selectedFunnel, selectedTags, selectedWorkspaceId, sidebarFilters]);

  const leadsReceived = conversations.length;
  const leadsQualified = contacts.filter((c) => (c.status || '').toLowerCase() === 'qualified').length;
  const leadsOffer = contacts.filter((c) => (c.status || '').toLowerCase() === 'offer').length;
  const leadsWon = cards.filter((c) => {
    const s = (c.status || '').toLowerCase();
    return s === 'won' || s === 'ganho' || s === 'venda' || s === 'success' || s === 'sucesso';
  }).length;
  const leadsLost1 = contacts.filter((c) => (c.status || '').toLowerCase() === 'lost_offer').length;
  const leadsLost2 = contacts.filter((c) => (c.status || '').toLowerCase() === 'lost_no_offer').length;
  const leadsLost3 = contacts.filter((c) => (c.status || '').toLowerCase() === 'lost_not_fit').length;
  const leadsLostTotal = leadsLost1 + leadsLost2 + leadsLost3;

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

  const calls = activities.filter((a) => (a.type || '').toLowerCase().includes('ligação') || (a.type || '').toLowerCase().includes('chamada'));
  const callsAttended = calls.filter((a) => (a.status || '').toLowerCase().includes('atendida'));
  const callsNotAttended = calls.filter((a) => (a.status || '').toLowerCase().includes('não atendida') || (a.status || '').toLowerCase().includes('nao atendida'));
  const callsApproached = calls.filter((a) => (a.status || '').toLowerCase().includes('abordada'));
  const callsFollowUp = calls.filter((a) => (a.status || '').toLowerCase().includes('follow') || (a.type || '').toLowerCase().includes('follow'));
  const messages = activities.filter((a) => (a.type || '').toLowerCase().includes('mensagem') || (a.type || '').toLowerCase().includes('whatsapp'));
  const whatsappSent = activities.filter((a) => (a.type || '').toLowerCase().includes('whatsapp'));
  const meetings = activities.filter((a) => (a.type || '').toLowerCase().includes('reunião') || (a.type || '').toLowerCase().includes('reuniao'));
  const meetingsDone = meetings.filter((a) => (a.status || '').toLowerCase().includes('realizada'));
  const meetingsNotDone = meetings.filter((a) => (a.status || '').toLowerCase().includes('não realizada') || (a.status || '').toLowerCase().includes('nao realizada'));
  const meetingsRescheduled = meetings.filter((a) => (a.status || '').toLowerCase().includes('reagendada') || (a.type || '').toLowerCase().includes('reagenda'));
  const proposals = activities.filter((a) => (a.type || '').toLowerCase().includes('proposta'));
  const activeConversations = messages.reduce((set, m) => {
    if (m.contact_id) set.add(m.contact_id);
    return set;
  }, new Set<string>()).size;

  const conversion = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(1)) : 0);

  // Agrupamentos por responsável para rankings
  const agentMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    agents.forEach((a) => map.set(a.id, { name: a.name }));
    return map;
  }, [agents]);

  const teamAggregates = useMemo<any[]>(() => {
    const agg: Record<string, any> = {};
    const ensure = (id: string | null | undefined) => {
      const key = id || 'ia';
      if (!agg[key]) {
        agg[key] = {
          id: key,
          name: agentMap.get(key || '')?.name || (key === 'ia' ? 'Agente IA' : 'Sem responsável'),
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
      const t = (act.type || '').toLowerCase();
      const s = (act.status || '').toLowerCase();

      // Mensagens / WhatsApp
      if (t.includes('mensagem') || t.includes('whatsapp')) {
        target.messages += 1;
        if (t.includes('whatsapp') || s.includes('whatsapp')) target.whatsappSent += 1;
      }

      // Ligações
      if (t.includes('ligação') || t.includes('chamada')) {
        target.calls += 1;
        if (s.includes('atendida')) target.callsAttended += 1;
        if (s.includes('não atendida') || s.includes('nao atendida')) target.callsNotAttended += 1;
        if (s.includes('abordada') || t.includes('abordada')) target.callsApproached += 1;
        if (s.includes('follow') || t.includes('follow')) target.callsFollowUp += 1;
      }

      // Reuniões
      if (t.includes('reunião') || t.includes('reuniao')) {
        target.meetings += 1;
        if (s.includes('realizada')) target.meetingsDone += 1;
        if (s.includes('não realizada') || s.includes('nao realizada')) target.meetingsNotDone += 1;
        if (s.includes('reagendada') || t.includes('reagenda')) target.meetingsRescheduled += 1;
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

    cards.forEach((c) => {
      const s = (c.status || '').toLowerCase();
      if (s === 'won' || s === 'ganho' || s === 'venda' || s === 'success' || s === 'sucesso') {
        const target = ensure(c.responsible_user_id);
        target.sales += 1;
        target.revenue += c.value || 0;
        target.products += (c.products || []).length;
      }
    });

    return Object.values(agg);
  }, [agents, agentMap, contacts, calls, callsApproached, callsAttended, callsNotAttended, messages, meetings, proposals, cards]);

  const rankingVendas = useMemo<any[]>(() => {
    const list = [...teamAggregates].sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
    return list.map((row) => ({
      ...row,
      pa: row.sales > 0 ? Number(((row.products || 0) / row.sales).toFixed(2)) : 0,
      ticket: row.sales > 0 ? Number(((row.revenue || 0) / row.sales).toFixed(2)) : 0,
    }));
  }, [teamAggregates]);

  const rankingTrabalho = useMemo<any[]>(() => {
    const list = [...teamAggregates].map((row) => {
      const total =
        (row.calls || 0) +
        (row.callsAttended || 0) +
        (row.callsNotAttended || 0) +
        (row.callsApproached || 0) +
        (row.callsFollowUp || 0) +
        (row.messages || 0) +
        (row.whatsappSent || 0) +
        (row.meetings || 0) +
        (row.meetingsDone || 0) +
        (row.meetingsNotDone || 0) +
        (row.meetingsRescheduled || 0) +
        (row.proposals || 0);
      return { ...row, total };
    });
    return list.sort((a, b) => (b.total || 0) - (a.total || 0));
  }, [teamAggregates]);

  const hasDateRange = !!(startDate && endDate);
  const periodLabel = !hasDateRange
    ? 'Todos os períodos'
    : periodPreset !== 'custom'
      ? {
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
        <div className="flex-1 overflow-auto bg-[#e6e6e6] dark:bg-[#050505] relative">
          <div className="inline-block min-w-full align-middle bg-white dark:bg-[#111111]">
            <div className="p-4 space-y-4">
              {/* Filtros avançados no topo */}
              <div className="border border-[#d4d4d4] dark:border-gray-800 bg-white dark:bg-[#0f0f0f] shadow-sm">
                <QueryBuilderSidebar
                  pipelines={pipelines || []}
                  tags={availableTags || []}
                  agents={agents || []}
                  selectedWorkspaceId={selectedWorkspaceId || workspaces?.[0]?.workspace_id || ''}
                  onFiltersChange={setSidebarFilters}
                />
              </div>

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
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Filter className="h-4 w-4" />
            Funil – Indicadores
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <Card className="rounded-none border-gray-200 dark:border-gray-700 md:col-span-4">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-gray-700 dark:text-gray-200">Leads</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid grid-cols-1 gap-1 text-[11px]">
                  <div className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-1"><span>Leads recebidos</span><strong>{leadsReceived}</strong></div>
                  <div className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-1"><span>Conversas ativas</span><strong>{activeConversations}</strong></div>
                  <div className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-1"><span>Leads qualificados</span><strong>{leadsQualified}</strong></div>
                  <div className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-1"><span>Leads com oferta</span><strong>{leadsOffer}</strong></div>
                  <div className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-1"><span>Vendas realizadas</span><strong>{leadsWon}</strong></div>
                  <div className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-1"><span>Leads perdidos 1</span><strong>{leadsLost1}</strong></div>
                  <div className="flex justify-between border-b border-gray-50 dark:border-gray-800 pb-1"><span>Leads perdidos 2</span><strong>{leadsLost2}</strong></div>
                  <div className="flex justify-between"><span>Leads perdidos 3</span><strong>{leadsLost3}</strong></div>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-none border-gray-200 dark:border-gray-700 md:col-span-8">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-gray-700 dark:text-gray-200">Leads por Etiqueta / Produto</CardTitle>
              </CardHeader>
              <CardContent className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-64">
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mb-1 font-medium">Etiquetas (%)</p>
                  {leadsByTag.length === 0 ? (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 h-full flex items-center justify-center border border-dashed border-gray-200 dark:border-gray-800">Sem dados de etiquetas</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={leadsByTag}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={85}
                          label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
                          labelLine={true}
                        >
                          {leadsByTag.map((_, i) => (
                            <Cell key={i} fill={pieColors[i % pieColors.length]} />
                          ))}
                        </Pie>
                        <ReTooltip formatter={(value: number, _, entry: any) => [`${value}`, entry?.name]} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="h-64 border-l border-gray-100 dark:border-gray-800 pl-4">
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mb-1 font-medium">Produtos (%)</p>
                  {leadsByProduct.length === 0 ? (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 h-full flex items-center justify-center border border-dashed border-gray-200 dark:border-gray-800">Sem dados de produtos</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={leadsByProduct}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={85}
                          label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
                          labelLine={true}
                        >
                          {leadsByProduct.map((_, i) => (
                            <Cell key={i} fill={pieColors[(i + 3) % pieColors.length]} />
                          ))}
                        </Pie>
                        <ReTooltip formatter={(value: number, _, entry: any) => [`${value}`, entry?.name]} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Funil – Conversão */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Filter className="h-4 w-4" />
            Funil – Conversão
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label: '% Leads qualificados / recebidos', value: conversion(leadsQualified, leadsReceived) },
              { label: '% Leads com oferta / qualificados', value: conversion(leadsOffer, leadsQualified) },
              { label: '% Vendas / oferta', value: conversion(leadsWon, leadsOffer) },
                  { label: '% Leads por etiqueta', value: conversion(leadsByTag.reduce((a, b) => a + b.value, 0), leadsReceived) },
                  { label: '% Leads por produto', value: conversion(leadsByProduct.reduce((a, b) => a + b.value, 0), leadsReceived) },
              { label: '% Perdidos 1 / recebidos', value: conversion(leadsLost1, leadsReceived) },
              { label: '% Perdidos 2 / recebidos', value: conversion(leadsLost2, leadsReceived) },
              { label: '% Perdidos 3 / recebidos', value: conversion(leadsLost3, leadsReceived) },
              { label: '% Perdidos total / recebidos', value: conversion(leadsLostTotal, leadsReceived) },
            ].map((item) => (
              <Card key={item.label} className="rounded-none border-gray-200 dark:border-gray-700">
                <CardContent className="p-3">
                  <div className="text-[11px] text-gray-600 dark:text-gray-300">{item.label}</div>
                  <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{item.value}%</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Equipe – Indicadores */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Users className="h-4 w-4" />
            Equipe – Indicadores
          </div>
          <div className="overflow-auto border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-xs">
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

        {/* Equipe – Conversão */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Users className="h-4 w-4" />
            Equipe – Conversão
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label: '% Ligações realizadas / leads', value: conversion(calls.length, leadsReceived) },
              { label: '% Ligações atendidas / realizadas', value: conversion(callsAttended.length, calls.length) },
              { label: '% Ligações não atendidas / realizadas', value: conversion(callsNotAttended.length, calls.length) },
              { label: '% Ligações abordadas / atendidas', value: conversion(callsApproached.length, callsAttended.length) },
              { label: '% Ligações abordadas / realizadas', value: conversion(callsApproached.length, calls.length) },
              { label: '% Mensagens / leads', value: conversion(messages.length, leadsReceived) },
              { label: '% Reuniões agendadas / leads', value: conversion(meetings.length, leadsReceived) },
              { label: '% Reuniões agendadas / abordadas', value: conversion(meetings.length, callsApproached.length) },
              { label: '% Reuniões realizadas / agendadas', value: conversion(meetings.filter((m) => m.status === 'realizada').length, meetings.length) },
              { label: '% Propostas / reuniões realizadas', value: conversion(proposals.length, meetings.filter((m) => m.status === 'realizada').length) },
              { label: '% Vendas / propostas', value: conversion(leadsWon, proposals.length) },
            ].map((item) => (
              <Card key={item.label} className="rounded-none border-gray-200 dark:border-gray-700">
                <CardContent className="p-3">
                  <div className="text-[11px] text-gray-600 dark:text-gray-300">{item.label}</div>
                  <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{item.value}%</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Ranking – Vendas */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Users className="h-4 w-4" />
            Equipe – Ranking de Vendas
          </div>
          <div className="overflow-auto border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-xs">
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
                  <th className="px-3 py-2 text-right">Msgs</th>
                  <th className="px-3 py-2 text-right">WhatsApp</th>
                  <th className="px-3 py-2 text-right">Lig. realizadas</th>
                  <th className="px-3 py-2 text-right">Lig. atendidas</th>
                  <th className="px-3 py-2 text-right">Lig. não atendidas</th>
                  <th className="px-3 py-2 text-right">Lig. abordadas</th>
                  <th className="px-3 py-2 text-right">Lig. follow-up</th>
                  <th className="px-3 py-2 text-right">Reun. agendadas</th>
                  <th className="px-3 py-2 text-right">Reun. realizadas</th>
                  <th className="px-3 py-2 text-right">Reun. não realizadas</th>
                  <th className="px-3 py-2 text-right">Reun. reagendadas</th>
                  <th className="px-3 py-2 text-right">Propostas</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rankingTrabalho.length === 0 ? (
                  <tr className="border-t border-gray-200 dark:border-gray-800">
                    <td className="px-3 py-3 text-center text-gray-500 dark:text-gray-300" colSpan={14}>
                      Nenhum dado encontrado para os filtros/período selecionados.
                    </td>
                  </tr>
                ) : (
                  rankingTrabalho.map((row) => (
                    <tr key={row.id} className="border-t border-gray-200 dark:border-gray-800">
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2 text-right">{row.messages}</td>
                      <td className="px-3 py-2 text-right">{row.whatsappSent}</td>
                      <td className="px-3 py-2 text-right">{row.calls}</td>
                      <td className="px-3 py-2 text-right">{row.callsAttended}</td>
                      <td className="px-3 py-2 text-right">{row.callsNotAttended}</td>
                      <td className="px-3 py-2 text-right">{row.callsApproached}</td>
                      <td className="px-3 py-2 text-right">{row.callsFollowUp}</td>
                      <td className="px-3 py-2 text-right">{row.meetings}</td>
                      <td className="px-3 py-2 text-right">{row.meetingsDone}</td>
                      <td className="px-3 py-2 text-right">{row.meetingsNotDone}</td>
                      <td className="px-3 py-2 text-right">{row.meetingsRescheduled}</td>
                      <td className="px-3 py-2 text-right">{row.proposals}</td>
                      <td className="px-3 py-2 text-right font-semibold">{row.total}</td>
                    </tr>
                  ))
                )}
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

