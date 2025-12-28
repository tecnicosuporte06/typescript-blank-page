// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { Workspace } from '@/contexts/WorkspaceContext';
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
  const { user, userRole } = useAuth();

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('last30');
  const [startDate, setStartDate] = useState<Date>(startOfDay(subDays(new Date(), 29)));
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date()));
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [selectedFunnel, setSelectedFunnel] = useState<string>('all');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
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
    if (!workspaceId) {
      // Se não há workspace selecionado, busca todos os usuários (master admin)
      const { data } = await supabase.from('system_users').select('id, name').order('name');
      setAgents(data || []);
      return;
    }
    // Busca apenas usuários que pertencem ao workspace
    const { data } = await supabase
      .from('workspace_members')
      .select('user_id, system_users(id, name)')
      .eq('workspace_id', workspaceId);
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
    const { data } = await supabase.from('tags').select('id, name').eq('workspace_id', workspaceId).order('name');
    setAvailableTags(data || []);
  };

  const fetchData = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const from = startDate.toISOString();
      const to = endDate.toISOString();

      // Contacts (leads)
      // @ts-ignore simplificando tipagem dinâmica para evitar profundidade de generics
      let contactsQuery = supabase
        .from('contacts')
        .select('id, created_at, responsible_id, status, workspace_id')
        .gte('created_at', from)
        .lte('created_at', to);

      // Activities (ligações/mensagens/reuniões)
      // @ts-ignore simplificando tipagem dinâmica
      let activitiesQuery = supabase
        .from('activities')
        .select('id, contact_id, responsible_id, type, status, created_at, workspace_id')
        .gte('created_at', from)
        .lte('created_at', to);

      // Pipeline cards para produtos e status de venda/perda
      // @ts-ignore simplificando tipagem dinâmica
      let cardsQuery = supabase
        .from('pipeline_cards')
        .select('id, contact_id, value, status, workspace_id, pipeline_id, responsible_user_id, pipeline_cards_products(product_id)');

      // Tags
      // @ts-ignore simplificando tipagem dinâmica
      let tagsQuery = supabase
        .from('contact_tags')
        .select('contact_id, tag_id, tags(name), contacts!inner(id, workspace_id)');

      // Workspace filter
      if (selectedWorkspaceId) {
        contactsQuery = contactsQuery.eq('workspace_id', selectedWorkspaceId);
        activitiesQuery = activitiesQuery.eq('workspace_id', selectedWorkspaceId);
        cardsQuery = cardsQuery.eq('workspace_id', selectedWorkspaceId);
        tagsQuery = tagsQuery.eq('contacts.workspace_id', selectedWorkspaceId);
      }

      // Permissões
      if (userRole === 'user') {
        contactsQuery = contactsQuery.eq('responsible_id', user.id);
        activitiesQuery = activitiesQuery.eq('responsible_id', user.id);
        cardsQuery = cardsQuery.eq('responsible_user_id', user.id);
      } else if (selectedAgent !== 'all' && selectedAgent !== 'ia') {
        contactsQuery = contactsQuery.eq('responsible_id', selectedAgent);
        activitiesQuery = activitiesQuery.eq('responsible_id', selectedAgent);
        cardsQuery = cardsQuery.eq('responsible_user_id', selectedAgent);
      } else if (selectedAgent === 'ia') {
        // Filtrar interações do agente de IA (responsável nulo)
        contactsQuery = contactsQuery.is('responsible_id', null);
        activitiesQuery = activitiesQuery.is('responsible_id', null);
        cardsQuery = cardsQuery.is('responsible_user_id', null);
      }

      const [
        { data: contactsData, error: contactsError },
        { data: activitiesData, error: activitiesError },
        { data: cardsData, error: cardsError },
        { data: tagsData, error: tagsError }
      ] = await Promise.all([contactsQuery, activitiesQuery, cardsQuery, tagsQuery]);

      if (contactsError) throw contactsError;
      if (activitiesError) throw activitiesError;
      if (cardsError) throw cardsError;
      if (tagsError) throw tagsError;

      const contactsFiltered = (((contactsData as unknown) as ContactRecord[]) || []).filter((c) => {
        if (selectedTag !== 'all') {
          const hasTag = ((tagsData || []) as any[]).some(
            (t: any) => t.contact_id === c.id && (t.tag_id === selectedTag || (t.tags as any)?.id === selectedTag)
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
        products: (c as any).pipeline_cards_products || [],
      }));

      // Aplicar filtros da sidebar
      const statusFilter = sidebarFilters.find(f => f.type === 'status');
      const valueFilter = sidebarFilters.find(f => f.type === 'value');

      if (selectedFunnel !== 'all') {
        cardsFiltered = cardsFiltered.filter((c) => c.pipeline_id === selectedFunnel);
      }

      if (statusFilter?.value) {
        cardsFiltered = cardsFiltered.filter((c) => c.status === statusFilter.value);
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

      const contactIdsFromCards = new Set(cardsFiltered.map((c) => c.contact_id).filter(Boolean) as string[]);

      const finalContacts =
        selectedFunnel !== 'all'
          ? contactsFiltered.filter((c) => contactIdsFromCards.has(c.id))
          : contactsFiltered;

      setContacts(finalContacts);
      setActivities((((activitiesData as unknown) as ActivityRecord[]) || []).filter((a) => finalContacts.some((c) => c.id === a.contact_id)));
      setCards(cardsFiltered);
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
    const firstWs = workspaces?.[0]?.workspace_id || '';
    if (!selectedWorkspaceId && firstWs) {
      setSelectedWorkspaceId(firstWs);
    }
  }, [workspaces, selectedWorkspaceId]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      fetchPipelines(selectedWorkspaceId);
      fetchTags(selectedWorkspaceId);
      fetchAgents(selectedWorkspaceId);
      // Reset filtros quando workspace mudar
      setSelectedFunnel('all');
      setSelectedTag('all');
      setSelectedAgent('all');
      setSidebarFilters([]); // Reset filtros da sidebar também
    } else {
      setPipelines([]);
      setAvailableTags([]);
      fetchAgents(null); // Busca todos os usuários se não há workspace
      setSidebarFilters([]);
    }
  }, [selectedWorkspaceId]);

  // Aplicar filtros da sidebar
  useEffect(() => {
    const pipelineFilter = sidebarFilters.find(f => f.type === 'pipeline');
    const teamFilter = sidebarFilters.find(f => f.type === 'team');
    const tagFilter = sidebarFilters.find(f => f.type === 'tags');
    
    setSelectedFunnel(pipelineFilter?.value || 'all');
    setSelectedAgent(teamFilter?.value || 'all');
    setSelectedTag(tagFilter?.value || 'all');
    
    // Os filtros de data, status e valor serão aplicados diretamente na query fetchData
  }, [sidebarFilters]);

  useEffect(() => {
    fetchData();
  }, [periodPreset, startDate, endDate, selectedAgent, userRole, selectedFunnel, selectedTag, selectedWorkspaceId, sidebarFilters]);

  const leadsReceived = contacts.length;
  const leadsQualified = contacts.filter((c) => c.status === 'qualified').length;
  const leadsOffer = contacts.filter((c) => c.status === 'offer').length;
  const leadsWon = cards.filter((c) => c.status === 'won').length;
  const leadsLost1 = contacts.filter((c) => c.status === 'lost_offer').length;
  const leadsLost2 = contacts.filter((c) => c.status === 'lost_no_offer').length;
  const leadsLost3 = contacts.filter((c) => c.status === 'lost_not_fit').length;
  const leadsLostTotal = leadsLost1 + leadsLost2 + leadsLost3;

  const leadsByTag = useMemo(() => {
    const map = new Map<string, number>();
    tags.forEach((t) => {
      const name = t.tag?.name || t.tag_id;
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [tags]);

  const leadsByProduct = useMemo(() => {
    const map = new Map<string, number>();
    cards.forEach((c) => {
      (c.products || []).forEach((p) => {
        const name = p.product_id || 'Produto';
        map.set(name, (map.get(name) || 0) + 1);
      });
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [cards]);

  const calls = activities.filter((a) => (a.type || '').toLowerCase().includes('ligação'));
  const callsAttended = calls.filter((a) => (a.status || '').toLowerCase().includes('atendida'));
  const callsNotAttended = calls.filter((a) => (a.status || '').toLowerCase().includes('não atendida'));
  const callsApproached = calls.filter((a) => (a.status || '').toLowerCase().includes('abordada'));
  const messages = activities.filter((a) => (a.type || '').toLowerCase().includes('mensagem'));
  const meetings = activities.filter((a) => (a.type || '').toLowerCase().includes('reunião'));
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
          messages: 0,
          meetings: 0,
          meetingsDone: 0,
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

    calls.forEach((c) => {
      const target = ensure(c.responsible_id);
      target.calls += 1;
      if ((c.status || '').toLowerCase().includes('atendida')) target.callsAttended += 1;
      if ((c.status || '').toLowerCase().includes('não atendida')) target.callsNotAttended += 1;
      if ((c.status || '').toLowerCase().includes('abordada')) target.callsApproached += 1;
    });

    messages.forEach((m) => {
      ensure(m.responsible_id).messages += 1;
    });

    meetings.forEach((m) => {
      const target = ensure(m.responsible_id);
      target.meetings += 1;
      if ((m.status || '').toLowerCase().includes('realizada')) target.meetingsDone += 1;
    });

    proposals.forEach((p) => {
      ensure(p.responsible_id).proposals += 1;
    });

    cards.forEach((c) => {
      if (c.status === 'won') {
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
    return [...teamAggregates].sort((a, b) => (b.calls || 0) - (a.calls || 0));
  }, [teamAggregates]);

  const periodLabel =
    periodPreset !== 'custom'
      ? {
          today: 'Hoje',
          last7: 'Últimos 7 dias',
          last30: 'Últimos 30 dias',
        }[periodPreset]
      : `${format(startDate, "dd/MM/yyyy", { locale: ptBR })} - ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`;

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
            <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-3 p-4 min-h-0">
              {/* Filtros avançados (sidebar) */}
              <div className="border border-[#d4d4d4] dark:border-gray-800 bg-white dark:bg-[#0f0f0f] shadow-sm p-3 h-full min-h-0">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3">
            <Card className="rounded-none border-gray-200 dark:border-gray-700">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-gray-700 dark:text-gray-200">Leads</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between"><span>Leads recebidos</span><strong>{leadsReceived}</strong></div>
                  <div className="flex justify-between"><span>Conversas ativas</span><strong>{activeConversations}</strong></div>
                  <div className="flex justify-between"><span>Leads qualificados</span><strong>{leadsQualified}</strong></div>
                  <div className="flex justify-between"><span>Leads com oferta</span><strong>{leadsOffer}</strong></div>
                  <div className="flex justify-between"><span>Vendas realizadas</span><strong>{leadsWon}</strong></div>
                  <div className="flex justify-between"><span>Leads perdidos 1</span><strong>{leadsLost1}</strong></div>
                  <div className="flex justify-between"><span>Leads perdidos 2</span><strong>{leadsLost2}</strong></div>
                  <div className="flex justify-between"><span>Leads perdidos 3</span><strong>{leadsLost3}</strong></div>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-none border-gray-200 dark:border-gray-700">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-gray-700 dark:text-gray-200">Leads por Tag / Produto</CardTitle>
              </CardHeader>
              <CardContent className="p-3 grid grid-cols-2 gap-2">
                <div className="h-48">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={leadsByTag} dataKey="value" nameKey="name" outerRadius={70} label>
                        {leadsByTag.map((_, i) => (
                          <Cell key={i} fill={pieColors[i % pieColors.length]} />
                        ))}
                      </Pie>
                      <ReTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-48">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={leadsByProduct} dataKey="value" nameKey="name" outerRadius={70} label>
                        {leadsByProduct.map((_, i) => (
                          <Cell key={i} fill={pieColors[(i + 3) % pieColors.length]} />
                        ))}
                      </Pie>
                      <ReTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
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
                  { label: '% Leads por tag', value: conversion(leadsByTag.reduce((a, b) => a + b.value, 0), leadsReceived) },
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
                  <th className="px-3 py-2 text-right">Ligações realizadas</th>
                  <th className="px-3 py-2 text-right">Ligações atendidas</th>
                  <th className="px-3 py-2 text-right">Ligações abordadas</th>
                  <th className="px-3 py-2 text-right">Reuniões agendadas</th>
                  <th className="px-3 py-2 text-right">Reuniões realizadas</th>
                  <th className="px-3 py-2 text-right">Propostas enviadas</th>
                </tr>
              </thead>
              <tbody>
                {rankingTrabalho.map((row) => (
                  <tr key={row.id} className="border-t border-gray-200 dark:border-gray-800">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 text-right">{row.calls}</td>
                    <td className="px-3 py-2 text-right">{row.callsAttended}</td>
                    <td className="px-3 py-2 text-right">{row.callsApproached}</td>
                    <td className="px-3 py-2 text-right">{row.meetings}</td>
                    <td className="px-3 py-2 text-right">{row.meetingsDone}</td>
                    <td className="px-3 py-2 text-right">{row.proposals}</td>
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

