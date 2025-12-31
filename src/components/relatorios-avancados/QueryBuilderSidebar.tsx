import { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, Calendar as CalendarIcon, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
  onFiltersChange?: (filters: FilterItem[]) => void;
  initialFilters?: FilterItem[];
  rehydrateNonce?: number;
  showHeader?: boolean;
  disabled?: boolean;
}

export interface FilterItem {
  type: 'pipeline' | 'column' | 'team' | 'tags' | 'products' | 'date' | 'status' | 'value';
  value: string;
  operator?: string;
}

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
  // ✅ Default = sem filtro (mostrar tudo)
  const [pipelineFilter, setPipelineFilter] = useState<string>('all');
  const [columnFilter, setColumnFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [openTagPopover, setOpenTagPopover] = useState(false);
  const [openProductPopover, setOpenProductPopover] = useState(false);

  const { columns: pipelineColumns, isLoading: loadingColumns } = usePipelineColumns(
    pipelineFilter && pipelineFilter !== 'all' ? pipelineFilter : null,
    selectedWorkspaceId
  );

  const filters = useMemo(() => {
    const f: FilterItem[] = [];
    // "all" significa sem filtro
    if (pipelineFilter && pipelineFilter !== 'all') f.push({ type: 'pipeline', value: pipelineFilter });
    if (columnFilter && columnFilter !== 'all') f.push({ type: 'column', value: columnFilter });
    if (teamFilter && teamFilter !== 'all') f.push({ type: 'team', value: teamFilter });
    if (selectedTags.length > 0) selectedTags.forEach((t) => f.push({ type: 'tags', value: t }));
    if (selectedProducts.length > 0) selectedProducts.forEach((p) => f.push({ type: 'products', value: p }));
    if (dateRange.from && dateRange.to) {
      f.push({
        type: 'date',
        value: `${dateRange.from.toISOString()}|${dateRange.to.toISOString()}`,
        operator: 'between'
      });
    }
    if (statusFilter && statusFilter !== 'all') f.push({ type: 'status', value: statusFilter });
    return f;
  }, [pipelineFilter, columnFilter, teamFilter, selectedTags, selectedProducts, dateRange, statusFilter]);

  const isHydratingRef = useRef(false);
  const userTouchedRef = useRef(false);
  const lastInitialSigRef = useRef<string | null>(null);
  const serializeFilters = (items: FilterItem[] | undefined) => {
    const arr = Array.isArray(items) ? [...items] : [];
    // ordena para comparação estável
    arr.sort((a, b) =>
      `${a.type}|${a.value}|${a.operator || ''}`.localeCompare(`${b.type}|${b.value}|${b.operator || ''}`)
    );
    return JSON.stringify(arr);
  };

  // Quando o pai quer forçar re-hidratação (ex.: Desfazer / carregar preset), libera novamente.
  useEffect(() => {
    userTouchedRef.current = false;
  }, [rehydrateNonce]);

  // Reset coluna quando pipeline mudar
  useEffect(() => {
    if (isHydratingRef.current) return;
    // Se estiver em "Todos os Funis", coluna não se aplica
    if (pipelineFilter === 'all') {
      setColumnFilter('all');
      return;
    }
    setColumnFilter('all');
  }, [pipelineFilter]);

  useEffect(() => {
    if (isHydratingRef.current) return;
    onFiltersChange?.(filters);
  }, [filters, onFiltersChange]);

  // Init (presets / múltiplos funis)
  useEffect(() => {
    if (!initialFilters) return;
    // Evita "surto": depois que o usuário mexe manualmente, não re-hidrata automaticamente
    if (userTouchedRef.current) return;

    // Evita loop/flicker: só re-hidrata se o conteúdo realmente mudou
    const incomingSig = serializeFilters(initialFilters);
    if (incomingSig === lastInitialSigRef.current) return;
    const currentSig = serializeFilters(filters);
    if (incomingSig === currentSig) {
      lastInitialSigRef.current = incomingSig;
      return;
    }

    const byType = new Map<string, FilterItem[]>();
    initialFilters.forEach((f) => {
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

    isHydratingRef.current = true;
    lastInitialSigRef.current = incomingSig;
    setPipelineFilter(pipeline);
    setColumnFilter(column);
    setTeamFilter(team);
    setSelectedTags(tagsArr);
    setSelectedProducts(productsArr);
    setDateRange(parsedRange);
    setStatusFilter(status);
    // libera após o próximo tick (garante que o effect de reset de coluna não dispare logo após a hidratação)
    window.setTimeout(() => {
      isHydratingRef.current = false;
    }, 0);
  }, [initialFilters]);

  const clearAll = () => {
    setPipelineFilter('all');
    setColumnFilter('all');
    setTeamFilter('all');
    setSelectedTags([]);
    setSelectedProducts([]);
    setDateRange({});
    setStatusFilter('all');
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

      <div className="flex flex-nowrap gap-2 items-center overflow-x-auto pb-1">
        {/* Pipeline */}
        <Select
          value={pipelineFilter}
          onValueChange={(v) => {
            userTouchedRef.current = true;
            setPipelineFilter(v);
          }}
          disabled={(pipelines || []).length === 0}
        >
          <SelectTrigger className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[140px]">
            <SelectValue placeholder={(pipelines || []).length === 0 ? 'Nenhum pipeline' : 'Pipeline'} />
          </SelectTrigger>
          <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
            <SelectItem value="all">Todos os Funis</SelectItem>
            {(pipelines || []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Coluna / Etapa (ao lado do Pipeline) */}
        <Select
          value={columnFilter}
          onValueChange={(v) => {
            userTouchedRef.current = true;
            setColumnFilter(v);
          }}
          disabled={!pipelineFilter || pipelineFilter === 'all' || loadingColumns || (pipelineColumns || []).length === 0}
        >
          <SelectTrigger className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[140px]">
            <SelectValue
              placeholder={
                !pipelineFilter
                  ? 'Selecione um pipeline'
                  : pipelineFilter === 'all'
                    ? 'Etapa'
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
          value={teamFilter}
          onValueChange={(v) => {
            userTouchedRef.current = true;
            setTeamFilter(v);
          }}
        >
          <SelectTrigger className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[140px]">
            <SelectValue placeholder="Equipe (usuário)" />
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

        {/* Tags multi */}
        <Popover open={openTagPopover} onOpenChange={setOpenTagPopover}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-9 px-3 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[160px] justify-between"
              disabled={(tags || []).length === 0}
            >
              <span className="flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" />
                {selectedTags.length > 0 ? `${selectedTags.length} etiqueta(s)` : 'Etiquetas'}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">{selectedTags.length > 0 ? 'editar' : 'selecionar'}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#0f0f0f]" align="start">
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {(tags || []).map((t) => {
                const checked = selectedTags.includes(t.id);
                return (
                  <label key={t.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 px-1 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(state) => {
                        userTouchedRef.current = true;
                        const next = state ? [...selectedTags, t.id] : selectedTags.filter((id) => id !== t.id);
                        setSelectedTags(next);
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span>{t.name}</span>
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
                !dateRange.from && !dateRange.to && 'text-gray-500 dark:text-gray-400'
              )}
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {dateRange.from && dateRange.to
                ? `${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}`
                : 'Período'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2 rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#0f0f0f]" align="start">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={(range) => {
                userTouchedRef.current = true;
                setDateRange(range || {});
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
                  userTouchedRef.current = true;
                  setDateRange({});
                }}
              >
                Limpar
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Status */}
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            userTouchedRef.current = true;
            setStatusFilter(v);
          }}
        >
          <SelectTrigger className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[140px]">
            <SelectValue placeholder="Status" />
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

        {/* Produtos (no lugar do "Igual a") */}
        <Popover open={openProductPopover} onOpenChange={setOpenProductPopover}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-9 px-3 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[160px] justify-between"
              disabled={(products || []).length === 0}
            >
              <span className="flex items-center gap-1">
                {selectedProducts.length > 0 ? `${selectedProducts.length} produto(s)` : 'Produtos'}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {selectedProducts.length > 0 ? 'editar' : 'selecionar'}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 p-2 rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#0f0f0f]"
            align="start"
          >
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {(products || []).map((p) => {
                const checked = selectedProducts.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 px-1 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(state) => {
                        userTouchedRef.current = true;
                        const next = state ? [...selectedProducts, p.id] : selectedProducts.filter((id) => id !== p.id);
                        setSelectedProducts(next);
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate" title={p.name}>
                      {p.name}
                    </span>
                  </label>
                );
              })}
              {(!products || products.length === 0) && <div className="text-[11px] text-gray-500">Nenhum produto disponível</div>}
            </div>
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs rounded-none"
                onClick={() => {
                  userTouchedRef.current = true;
                  setSelectedProducts([]);
                }}
              >
                Limpar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

