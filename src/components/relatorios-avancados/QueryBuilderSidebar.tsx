import { useEffect, useMemo, useState } from 'react';
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

interface QueryBuilderSidebarProps {
  pipelines: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  selectedWorkspaceId?: string; // mantido para compatibilidade, mas não usado
  onFiltersChange?: (filters: FilterItem[]) => void;
}

interface FilterItem {
  type: 'pipeline' | 'team' | 'tags' | 'date' | 'status' | 'value';
  value: string;
  operator?: string;
}

export function QueryBuilderSidebar({ pipelines, tags, agents, onFiltersChange }: QueryBuilderSidebarProps) {
  const [pipelineFilter, setPipelineFilter] = useState<string>('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [valueFilter, setValueFilter] = useState<string>('');
  const [valueOperator, setValueOperator] = useState<string>('equals');
  const [openTagPopover, setOpenTagPopover] = useState(false);

  const filters = useMemo(() => {
    const f: FilterItem[] = [];
    if (pipelineFilter) f.push({ type: 'pipeline', value: pipelineFilter });
    if (teamFilter && teamFilter !== 'all') f.push({ type: 'team', value: teamFilter });
    if (selectedTags.length > 0) selectedTags.forEach((t) => f.push({ type: 'tags', value: t }));
    if (dateRange.from && dateRange.to) {
      f.push({
        type: 'date',
        value: `${dateRange.from.toISOString()}|${dateRange.to.toISOString()}`,
        operator: 'between'
      });
    }
    if (statusFilter && statusFilter !== 'all') f.push({ type: 'status', value: statusFilter });
    if (valueFilter) f.push({ type: 'value', value: valueFilter, operator: valueOperator });
    return f;
  }, [pipelineFilter, teamFilter, selectedTags, dateRange, statusFilter, valueFilter, valueOperator]);

  useEffect(() => {
    onFiltersChange?.(filters);
  }, [filters, onFiltersChange]);

  const clearAll = () => {
    setPipelineFilter('');
    setTeamFilter('');
    setSelectedTags([]);
    setDateRange({});
    setStatusFilter('');
    setValueFilter('');
    setValueOperator('equals');
  };

  return (
    <div className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 uppercase tracking-wide">
          <Filter className="h-3.5 w-3.5" />
          Filtros Avançados
        </h3>
        <Button
          variant="outline"
          className="h-8 px-3 text-xs rounded-none border-[#d4d4d4] dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-[#111111] dark:text-gray-100"
          onClick={clearAll}
        >
          Limpar Todos
        </Button>
      </div>

      <div className="flex flex-nowrap gap-2 items-center overflow-x-auto pb-1">
        {/* Pipeline */}
        <Select value={pipelineFilter} onValueChange={setPipelineFilter} disabled={(pipelines || []).length === 0}>
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

        {/* Equipe */}
        <Select value={teamFilter} onValueChange={setTeamFilter}>
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
                {selectedTags.length > 0 ? `${selectedTags.length} tag(s)` : 'Tags'}
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
                        const next = state ? [...selectedTags, t.id] : selectedTags.filter((id) => id !== t.id);
                        setSelectedTags(next);
                      }}
                      className="h-3.5 w-3.5"
                    />
                    <span>{t.name}</span>
                  </label>
                );
              })}
              {(!tags || tags.length === 0) && <div className="text-[11px] text-gray-500">Nenhuma tag disponível</div>}
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
              onSelect={(range) => setDateRange(range || {})}
              numberOfMonths={1}
              locale={ptBR}
            />
            <div className="flex justify-end mt-2">
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs rounded-none" onClick={() => setDateRange({})}>
                Limpar
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Status */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
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

        {/* Valor */}
        <Select value={valueOperator} onValueChange={setValueOperator}>
          <SelectTrigger className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] min-w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
            <SelectItem value="equals">Igual a</SelectItem>
            <SelectItem value="greater">Maior que</SelectItem>
            <SelectItem value="less">Menor que</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          className="h-9 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] w-28"
          placeholder="Valor"
          value={valueFilter}
          onChange={(e) => setValueFilter(e.target.value)}
        />
      </div>
    </div>
  );
}

