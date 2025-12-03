import { Search, Download, Share2, Save, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Workspace } from '@/contexts/WorkspaceContext';

interface ReportHeaderProps {
  workspaces: Workspace[];
  selectedWorkspace: string;
  onWorkspaceChange: (value: string) => void;
  viewMode: 'list' | 'bi' | 'kpis' | 'funnel';
  onViewModeChange: (mode: 'list' | 'bi' | 'kpis' | 'funnel') => void;
  onExport: () => void;
}

export function ReportHeader({
  workspaces,
  selectedWorkspace,
  onWorkspaceChange,
  viewMode,
  onViewModeChange,
  onExport
}: ReportHeaderProps) {
  return (
    <div className="bg-[#f3f3f3] dark:bg-[#2d2d2d] border-b border-[#d4d4d4] dark:border-gray-700 px-3 py-1.5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between shrink-0">
      <div className="flex items-center gap-2 flex-1">
        <Select value={selectedWorkspace} onValueChange={onWorkspaceChange}>
          <SelectTrigger className="w-[200px] h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#1f1f1f]">
            <SelectValue placeholder="Selecione o Workspace" />
          </SelectTrigger>
          <SelectContent className="rounded-none border-[#d4d4d4] dark:border-gray-700">
            {workspaces.map((ws) => (
              <SelectItem key={ws.workspace_id} value={ws.workspace_id}>
                {ws.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

        <div className="flex bg-white dark:bg-[#1f1f1f] border border-[#d4d4d4] dark:border-gray-700 rounded-none p-0.5">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('list')}
            className={viewMode === 'list' ? 'h-6 px-2 text-xs rounded-none bg-[#FEF3C7] dark:bg-gray-700 text-black dark:text-white font-bold' : 'h-6 px-2 text-xs rounded-none hover:bg-gray-100 dark:hover:bg-gray-800'}
          >
            Lista
          </Button>
          <Button
            variant={viewMode === 'bi' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('bi')}
            className={viewMode === 'bi' ? 'h-6 px-2 text-xs rounded-none bg-[#FEF3C7] dark:bg-gray-700 text-black dark:text-white font-bold' : 'h-6 px-2 text-xs rounded-none hover:bg-gray-100 dark:hover:bg-gray-800'}
          >
            BI
          </Button>
          <Button
            variant={viewMode === 'kpis' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('kpis')}
            className={viewMode === 'kpis' ? 'h-6 px-2 text-xs rounded-none bg-[#FEF3C7] dark:bg-gray-700 text-black dark:text-white font-bold' : 'h-6 px-2 text-xs rounded-none hover:bg-gray-100 dark:hover:bg-gray-800'}
          >
            KPIs
          </Button>
          <Button
            variant={viewMode === 'funnel' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('funnel')}
            className={viewMode === 'funnel' ? 'h-6 px-2 text-xs rounded-none bg-[#FEF3C7] dark:bg-gray-700 text-black dark:text-white font-bold' : 'h-6 px-2 text-xs rounded-none hover:bg-gray-100 dark:hover:bg-gray-800'}
          >
            Funil
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
          <Input placeholder="Pesquisar..." className="pl-7 h-7 text-xs rounded-none border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#1f1f1f] focus-visible:ring-1 focus-visible:ring-primary" />
        </div>
        
        <Button variant="ghost" size="icon" title="Salvar Vista" className="h-7 w-7 rounded-none hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent hover:border-gray-300 dark:hover:border-gray-600">
          <Save className="h-3.5 w-3.5" />
        </Button>
        
        <Button variant="ghost" size="icon" onClick={onExport} title="Exportar CSV" className="h-7 w-7 rounded-none hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent hover:border-gray-300 dark:hover:border-gray-600">
          <Download className="h-3.5 w-3.5" />
        </Button>
        
        <Button variant="ghost" size="icon" title="Compartilhar" className="h-7 w-7 rounded-none hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent hover:border-gray-300 dark:hover:border-gray-600">
          <Share2 className="h-3.5 w-3.5" />
        </Button>
        
        <Button variant="ghost" size="icon" title="Configurações" className="h-7 w-7 rounded-none hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent hover:border-gray-300 dark:hover:border-gray-600">
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}


