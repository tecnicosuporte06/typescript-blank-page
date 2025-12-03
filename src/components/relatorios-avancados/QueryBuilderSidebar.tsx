import { useState } from 'react';
import { Filter, Plus, X, Calendar, User, Tag, MessageSquare, DollarSign, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function QueryBuilderSidebar() {
  const [filters, setFilters] = useState<any[]>([]);

  const addFilter = (type: string) => {
    setFilters([...filters, { type, operator: 'equals', value: '' }]);
  };

  const removeFilter = (index: number) => {
    const newFilters = [...filters];
    newFilters.splice(index, 1);
    setFilters(newFilters);
  };

  const filterTypes = [
    { id: 'date', label: 'Data', icon: Calendar },
    { id: 'status', label: 'Status', icon: Activity },
    { id: 'pipeline', label: 'Pipeline', icon: Filter },
    { id: 'team', label: 'Equipe', icon: User },
    { id: 'tags', label: 'Tags', icon: Tag },
    { id: 'value', label: 'Valor', icon: DollarSign },
  ];

  return (
    <div className="w-64 bg-[#f0f0f0] dark:bg-[#1a1a1a] border-r border-[#d4d4d4] dark:border-gray-700 flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#1f1f1f]">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 uppercase tracking-wide">
          <Filter className="h-3.5 w-3.5" />
          Filtros Avançados
        </h3>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {filters.map((filter, index) => (
            <div key={index} className="p-2 bg-white dark:bg-[#1f1f1f] border border-[#d4d4d4] dark:border-gray-700 rounded-none space-y-2 relative group">
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

              <Select defaultValue={filter.operator}>
                <SelectTrigger className="h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
                  <SelectItem value="equals">Igual a</SelectItem>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="greater">Maior que</SelectItem>
                  <SelectItem value="less">Menor que</SelectItem>
                </SelectContent>
              </Select>

              <Input className="h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d]" placeholder="Valor..." />
            </div>
          ))}

          <Popover>
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
                    className="justify-start font-normal h-7 text-xs rounded-none hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-100"
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
      </ScrollArea>

      <div className="p-3 border-t border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#1f1f1f] space-y-2">
        <Button className="w-full h-7 text-xs rounded-none bg-primary hover:bg-primary/90">Aplicar Filtros</Button>
        <Button
          variant="outline"
          className="w-full h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-[#111111] dark:text-gray-100"
          onClick={() => setFilters([])}
        >
          Limpar Todos
        </Button>
      </div>
    </div>
  );
}


