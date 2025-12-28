import { useState, useEffect } from 'react';
import { Filter, Plus, X, Calendar as CalendarIcon, User, Tag, MessageSquare, DollarSign, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface QueryBuilderSidebarProps {
  pipelines: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  selectedWorkspaceId?: string;
  onFiltersChange?: (filters: FilterItem[]) => void;
}

interface FilterItem {
  type: 'pipeline' | 'team' | 'tags' | 'date' | 'status' | 'value';
  value: string;
  operator?: string; // Para filtros que precisam de operador (date, value)
}

export function QueryBuilderSidebar({ pipelines, tags, agents, selectedWorkspaceId, onFiltersChange }: QueryBuilderSidebarProps) {
  const [filters, setFilters] = useState<FilterItem[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange(filters);
    }
  }, [filters, onFiltersChange]);

  const addFilter = (type: 'pipeline' | 'team' | 'tags' | 'date' | 'status' | 'value') => {
    setFilters([...filters, { type, value: '', operator: type === 'date' || type === 'value' ? 'equals' : undefined }]);
    setPopoverOpen(false); // Fechar popover após adicionar
  };

  const removeFilter = (index: number) => {
    const newFilters = [...filters];
    newFilters.splice(index, 1);
    setFilters(newFilters);
  };

  const updateFilter = (index: number, value: string) => {
    const newFilters = [...filters];
    newFilters[index].value = value;
    setFilters(newFilters);
  };

  const updateFilterOperator = (index: number, operator: string) => {
    const newFilters = [...filters];
    newFilters[index].operator = operator;
    setFilters(newFilters);
  };

  const filterTypes = [
    { id: 'pipeline' as const, label: 'Pipeline', icon: Filter, disabled: false },
    { id: 'team' as const, label: 'Equipe', icon: User, disabled: false },
    { id: 'tags' as const, label: 'Tags', icon: Tag, disabled: false },
    { id: 'date' as const, label: 'Data', icon: CalendarIcon, disabled: false },
    { id: 'status' as const, label: 'Status', icon: Activity, disabled: false },
    { id: 'value' as const, label: 'Valor', icon: DollarSign, disabled: false },
  ];

  return (
    <div className="w-64 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1f1f1f]">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 uppercase tracking-wide">
          <Filter className="h-3.5 w-3.5" />
          Filtros Avançados
        </h3>
      </div>

      <div className="flex-1 min-h-0 p-3 bg-white dark:bg-[#1a1a1a] overflow-y-auto">
        <div className="space-y-3 pb-3">
          {filters.map((filter, index) => (
            <div key={index} className="p-2 bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-gray-700 rounded-none space-y-2 relative group shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                className="absolute -top-1 -right-1 h-5 w-5 rounded-none bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeFilter(index)}
              >
                <X className="h-3 w-3" />
              </Button>
              
              <div className="font-medium text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                {filterTypes.find(t => t.id === filter.type)?.label || filter.type}
              </div>

              {filter.type === 'pipeline' && (
                <Select value={filter.value} onValueChange={(v) => updateFilter(index, v)} disabled={!selectedWorkspaceId || (pipelines || []).length === 0}>
                  <SelectTrigger className="h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]">
                    <SelectValue placeholder={selectedWorkspaceId ? ((pipelines || []).length === 0 ? "Nenhum pipeline encontrado" : "Selecione o pipeline") : "Selecione workspace primeiro"} />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                    {(pipelines || []).length === 0 ? (
                      <SelectItem value="" disabled>Nenhum pipeline disponível</SelectItem>
                    ) : (
                      (pipelines || []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}

              {filter.type === 'team' && (
                <Select value={filter.value} onValueChange={(v) => updateFilter(index, v)}>
                  <SelectTrigger className="h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]">
                    <SelectValue placeholder="Selecione a equipe" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                    <SelectItem value="ia">Agente IA</SelectItem>
                    {(agents || []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {filter.type === 'tags' && (
                <Select value={filter.value} onValueChange={(v) => updateFilter(index, v)} disabled={!selectedWorkspaceId || (tags || []).length === 0}>
                  <SelectTrigger className="h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]">
                    <SelectValue placeholder={selectedWorkspaceId ? "Selecione a tag" : "Selecione workspace primeiro"} />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                    {(tags || []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {filter.type === 'date' && (
                <>
                  <Select value={filter.operator || 'equals'} onValueChange={(v) => updateFilterOperator(index, v)}>
                    <SelectTrigger className="h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                      <SelectItem value="equals">Igual a</SelectItem>
                      <SelectItem value="greater">Maior que</SelectItem>
                      <SelectItem value="less">Menor que</SelectItem>
                      <SelectItem value="between">Entre</SelectItem>
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-7 w-full text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] justify-start text-left font-normal",
                          !filter.value && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {filter.value ? format(new Date(filter.value), "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-none border-[#d4d4d4] dark:border-gray-700" align="start">
                      <Calendar
                        mode="single"
                        selected={filter.value ? new Date(filter.value) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            updateFilter(index, date.toISOString().split('T')[0]);
                          }
                        }}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </>
              )}

              {filter.type === 'status' && (
                <Select value={filter.value} onValueChange={(v) => updateFilter(index, v)}>
                  <SelectTrigger className="h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="won">Ganho</SelectItem>
                    <SelectItem value="lost">Perdido</SelectItem>
                    <SelectItem value="qualified">Qualificado</SelectItem>
                    <SelectItem value="offer">Com Oferta</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {filter.type === 'value' && (
                <>
                  <Select value={filter.operator || 'equals'} onValueChange={(v) => updateFilterOperator(index, v)}>
                    <SelectTrigger className="h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                      <SelectItem value="equals">Igual a</SelectItem>
                      <SelectItem value="greater">Maior que</SelectItem>
                      <SelectItem value="less">Menor que</SelectItem>
                      <SelectItem value="between">Entre</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input 
                    type="number"
                    className="h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]" 
                    placeholder="Valor..."
                    value={filter.value}
                    onChange={(e) => updateFilter(index, e.target.value)}
                  />
                </>
              )}
            </div>
          ))}

          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full border-dashed border-[#d4d4d4] dark:border-gray-600 rounded-none h-7 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-[#111111] dark:text-gray-100"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Adicionar Filtro
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-56 p-1 rounded-none border-[#d4d4d4] dark:border-gray-600 bg-white dark:bg-[#0f0f0f]"
              align="start"
            >
              <div className="grid gap-0.5">
                {filterTypes.map((type) => (
                  <Button
                    key={type.id}
                    variant="ghost"
                    disabled={type.disabled}
                    className="justify-start font-normal h-7 text-xs rounded-none hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-100 disabled:opacity-50"
                    onClick={() => addFilter(type.id)}
                  >
                    <type.icon className="mr-2 h-3.5 w-3.5" />
                    {type.label}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="p-3 border-t border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#1f1f1f] space-y-2">
        <Button 
          className="w-full h-7 text-xs rounded-none bg-primary hover:bg-primary/90"
          onClick={() => {
            if (onFiltersChange) {
              onFiltersChange(filters);
            }
          }}
        >
          Aplicar Filtros
        </Button>
        <Button
          variant="outline"
          className="w-full h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-[#111111] dark:text-gray-100"
          onClick={() => {
            setFilters([]);
            if (onFiltersChange) {
              onFiltersChange([]);
            }
          }}
        >
          Limpar Todos
        </Button>
      </div>
    </div>
  );
}


