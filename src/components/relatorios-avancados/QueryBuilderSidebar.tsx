import { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, Calendar as CalendarIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { usePipelineColumns } from '@/hooks/usePipelineColumns';

interface QueryBuilderSidebarProps {
  pipelines: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  products?: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  selectedWorkspaceId?: string;
  onFiltersChange?: (filters: FilterGroupPayload[]) => void;
  initialFilters?: FilterGroupPayload[] | LegacyFilterItem[];
  rehydrateNonce?: number;
  showHeader?: boolean;
  disabled?: boolean;
}

export interface LegacyFilterItem {
  type: 'pipeline' | 'column' | 'team' | 'tags' | 'products' | 'date' | 'status' | 'value';
  value: string;
  operator?: string;
}

export type FilterGroupPayload = {
  pipeline?: string;
  column?: string;
  team?: string;
  tags?: string[];
  products?: string[];
  dateRange?: { from?: Date; to?: Date } | null;
  status?: string;
  value?: { value?: string; operator?: string } | null;
};

export function QueryBuilderSidebar({
  pipelines,
  tags,
  products = [],
  agents,
  selectedWorkspaceId,
  onFiltersChange,
  initialFilters,
  rehydrateNonce,
  showHeader = true,
  disabled = false,
}: QueryBuilderSidebarProps) {
  type FilterGroup = {
    id: string;
    pipeline: string;
    column: string;
    team: string;
    tags: string[];
    products: string[];
    dateRange: { from?: Date; to?: Date };
    status: string;
    value?: { value?: string; operator?: string } | null;
  };

  const makeGroup = (): FilterGroup => ({
    id: `fg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    pipeline: 'all',
    column: 'all',
    team: 'all',
    tags: [],
    products: [],
    dateRange: {},
    status: 'all',
  });

  const [groups, setGroups] = useState<FilterGroup[]>([makeGroup()]);
  const [openTags, setOpenTags] = useState<Record<string, boolean>>({});
  const [openProducts, setOpenProducts] = useState<Record<string, boolean>>({});

  const { columns: pipelineColumns, isLoading: loadingColumns } = usePipelineColumns(
    groups[0]?.pipeline && groups[0]?.pipeline !== 'all' ? groups[0]?.pipeline : null,
    selectedWorkspaceId
  );

  const isHydratingRef = useRef(false);
  const userTouchedRef = useRef(false);
  const lastInitialSigRef = useRef<string | null>(null);
  const serializeGroups = (items: FilterGroupPayload[] | undefined) => JSON.stringify(items || []);

  const normalizeIncoming = (incoming?: FilterGroupPayload[] | LegacyFilterItem[]) => {
    if (!incoming || !Array.isArray(incoming)) return [makeGroup()];

    // Novo formato: array de grupos
    if ((incoming as FilterGroupPayload[])[0]?.pipeline !== undefined) {
      const typed = incoming as FilterGroupPayload[];
      return typed.map((g) => ({
        ...makeGroup(),
        pipeline: g.pipeline ?? 'all',
        column: g.column ?? 'all',
        team: g.team ?? 'all',
        tags: Array.isArray(g.tags) ? g.tags.filter(Boolean) : [],
        products: Array.isArray(g.products) ? g.products.filter(Boolean) : [],
        dateRange: g.dateRange || {},
        status: g.status ?? 'all',
        value: g.value ?? null,
      }));
    }

    // Formato legado: FilterItem[]
    const legacy = incoming as LegacyFilterItem[];
    const byType = new Map<string, LegacyFilterItem[]>();
    legacy.forEach((f) => {
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
      ...makeGroup(),
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

  const sanitizedGroups = useMemo(
    () =>
      (groups || []).map(({ id, ...rest }) => ({
        ...rest,
      })),
    [groups]
  );

  // Quando o pai quer forçar re-hidratação (ex.: Desfazer / carregar preset), libera novamente.
  useEffect(() => {
    userTouchedRef.current = false;
  }, [rehydrateNonce]);

  // Reset coluna quando pipeline do primeiro grupo mudar
  useEffect(() => {
    if (isHydratingRef.current) return;
    setGroups((prev) => {
      if (prev.length === 0) return prev;
      const [first, ...rest] = prev;
      return [{ ...first, column: 'all' }, ...rest];
    });
  }, [groups[0]?.pipeline]);

  useEffect(() => {
    if (isHydratingRef.current) return;
    onFiltersChange?.(sanitizedGroups);
  }, [sanitizedGroups, onFiltersChange]);

  // Init (presets / múltiplos funis)
  useEffect(() => {
    if (!initialFilters) return;
    // Evita "surto": depois que o usuário mexe manualmente, não re-hidrata automaticamente
    if (userTouchedRef.current) return;

    const normalizedGroups = normalizeIncoming(initialFilters);
    const incomingSig = serializeGroups(normalizedGroups.map(({ id, ...rest }) => rest));
    const currentSig = serializeGroups(sanitizedGroups);
    if (incomingSig === lastInitialSigRef.current || incomingSig === currentSig) {
      lastInitialSigRef.current = incomingSig;
      return;
    }

    isHydratingRef.current = true;
    lastInitialSigRef.current = incomingSig;
    setGroups(normalizedGroups);
    window.setTimeout(() => {
      isHydratingRef.current = false;
    }, 0);
  }, [initialFilters, sanitizedGroups]);

  const clearAll = () => {
    setGroups([makeGroup()]);
  };

  const updateGroup = (id: string, patch: Partial<FilterGroup>) => {
    userTouchedRef.current = true;
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const addGroup = () => {
    userTouchedRef.current = true;
    setGroups((prev) => [...prev, makeGroup()]);
  };

  const removeGroup = (id: string) => {
    setGroups((prev) => {
      if (prev.length === 1) return prev; // mantém pelo menos um
      return prev.filter((g) => g.id !== id);
    });
  };

  return (
    <div className={cn("w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 flex flex-col gap-2 p-3", disabled && "opacity-70 pointer-events-none")}>
      {showHeader && (
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 uppercase tracking-wide">
            <Filter className="h-3.5 w-3.5" />
            Filtros Avançados
          </h3>
          <Button
            variant="outline"
            className="h-8 px-3 text-xs rounded-none border-[#d4d4d4] dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-[#111111] dark:text-gray-100"
            onClick={clearAll}
            disabled={disabled}
          >
            Limpar Todos
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {groups.map((g, idx) => (
          <div key={g.id} className="flex flex-nowrap gap-2 items-center overflow-x-auto pb-1">
            {/* Pipeline */}
            <Select
              value={g.pipeline}
              onValueChange={(v) => {
                userTouchedRef.current = true;
                updateGroup(g.id, { pipeline: v, column: 'all' });
              }}
              disabled={(pipelines || []).length === 0}
            >
              <SelectTrigger className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[140px]">
                <SelectValue placeholder="Todos os Pipelines" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                <SelectItem value="all">Todos os Pipelines</SelectItem>
                {(pipelines || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Coluna / Etapa */}
            <Select
              value={g.column}
              onValueChange={(v) => {
                userTouchedRef.current = true;
                updateGroup(g.id, { column: v });
              }}
              disabled={!g.pipeline || g.pipeline === 'all' || loadingColumns || (pipelineColumns || []).length === 0}
            >
              <SelectTrigger className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[140px]">
                <SelectValue
                  placeholder={
                    g.pipeline === 'all'
                      ? 'Todas as Etapas'
                      : loadingColumns
                        ? 'Carregando...'
                        : (pipelineColumns || []).length === 0
                          ? 'Sem etapas'
                          : 'Etapa'
                  }
                />
              </SelectTrigger>
              <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                <SelectItem value="all">Todas as Etapas</SelectItem>
                {(pipelineColumns || []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Equipe */}
            <Select
              value={g.team}
              onValueChange={(v) => {
                userTouchedRef.current = true;
                updateGroup(g.id, { team: v });
              }}
            >
              <SelectTrigger className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[140px]">
                <SelectValue placeholder="Todos os Agentes" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="ia">Agente IA</SelectItem>
                {(agents || []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Etiquetas (multi select via popover) */}
            <Popover open={!!openTags[g.id]} onOpenChange={(o) => setOpenTags((prev) => ({ ...prev, [g.id]: o }))}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 px-3 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[160px] justify-between"
                  disabled={(tags || []).length === 0}
                >
                  <span className="flex items-center gap-1">
                    <Checkbox
                      checked={g.tags.length === (tags?.length || 0) && g.tags.length > 0}
                      className="h-3.5 w-3.5 pointer-events-none"
                    />
                    {g.tags.length > 0 ? `${g.tags.length} etiqueta(s)` : 'Todas as Etiquetas'}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#0f0f0f]" align="start">
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {(tags || []).map((t) => {
                    const checked = g.tags.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 px-1 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(state) => {
                            const next = state ? [...g.tags, t.id] : g.tags.filter((id) => id !== t.id);
                            updateGroup(g.id, { tags: next });
                          }}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate" title={t.name}>{t.name}</span>
                      </label>
                    );
                  })}
                  {(!tags || tags.length === 0) && <div className="text-[11px] text-gray-500">Nenhuma etiqueta disponível</div>}
                </div>
              </PopoverContent>
            </Popover>

            {/* Data (range) */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-9 px-3 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[180px] justify-start',
                    !g.dateRange.from && !g.dateRange.to && 'text-gray-500 dark:text-gray-400'
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {g.dateRange.from && g.dateRange.to
                    ? `${format(g.dateRange.from, 'dd/MM/yyyy')} - ${format(g.dateRange.to, 'dd/MM/yyyy')}`
                    : 'Período'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2 rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#0f0f0f]" align="start">
                <Calendar
                  mode="range"
                  selected={g.dateRange}
                  onSelect={(range) => {
                    updateGroup(g.id, { dateRange: range || {} });
                  }}
                  numberOfMonths={1}
                  locale={ptBR}
                />
                <div className="flex justify-end mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs rounded-none"
                    onClick={() => {
                      updateGroup(g.id, { dateRange: {} });
                    }}
                  >
                    Limpar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Status */}
            <Select
              value={g.status}
              onValueChange={(v) => {
                userTouchedRef.current = true;
                updateGroup(g.id, { status: v });
              }}
            >
              <SelectTrigger className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[140px]">
                <SelectValue placeholder="Todos os Status" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="won">Ganho</SelectItem>
                <SelectItem value="lost">Perdido</SelectItem>
                <SelectItem value="qualified">Qualificado</SelectItem>
                <SelectItem value="offer">Com Oferta</SelectItem>
              </SelectContent>
            </Select>

            {/* Produtos (multi select via popover) */}
            <Popover open={!!openProducts[g.id]} onOpenChange={(o) => setOpenProducts((prev) => ({ ...prev, [g.id]: o }))}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[160px] justify-between"
                  disabled={(products || []).length === 0}
                >
                  <span className="flex items-center gap-1">
                    <Checkbox
                      checked={g.products.length === (products?.length || 0) && g.products.length > 0}
                      className="h-3.5 w-3.5 pointer-events-none"
                    />
                    {g.products.length > 0 ? `${g.products.length} produto(s)` : 'Todos os Produtos'}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#0f0f0f]" align="start">
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {(products || []).map((p) => {
                    const checked = g.products.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 px-1 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(state) => {
                            const next = state ? [...g.products, p.id] : g.products.filter((id) => id !== p.id);
                            updateGroup(g.id, { products: next });
                          }}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate" title={p.name}>{p.name}</span>
                      </label>
                    );
                  })}
                  {(!products || products.length === 0) && <div className="text-[11px] text-gray-500">Nenhum produto disponível</div>}
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-1">
              {/* Remover grupo (se houver mais de um) */}
              {groups.length > 1 && (
                <Button
                  variant="outline"
                  className="h-9 px-2 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]"
                  onClick={() => removeGroup(g.id)}
                  disabled={disabled}
                  title="Remover filtro"
                >
                  ×
                </Button>
              )}

              {/* Adicionar novo grupo (só no último) */}
              {idx === groups.length - 1 && (
                <Button
                  variant="outline"
                  className="h-9 px-2 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]"
                  onClick={addGroup}
                  disabled={disabled}
                  title="Adicionar filtro"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

