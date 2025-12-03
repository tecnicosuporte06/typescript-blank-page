import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Edit, Trash2, Plus, ListOrdered, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdicionarFilaModal } from "../../modals/AdicionarFilaModal";
import { EditarFilaModal } from "../../modals/EditarFilaModal";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface AutomacoesFilasMasterRef {
  handleAddFila: () => void;
}

interface Fila {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  color?: string;
  order_position?: number;
  distribution_type?: string;
  ai_agent_id?: string;
  greeting_message?: string;
  workspace_id?: string;
  workspaces?: { name: string };
  user_count?: number;
}

export const AutomacoesFilasMaster = forwardRef<AutomacoesFilasMasterRef>((props, ref) => {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedFila, setSelectedFila] = useState<Fila | null>(null);

  const handleAddFila = () => {
    setShowAddModal(true);
  };

  useImperativeHandle(ref, () => ({
    handleAddFila
  }));

  const loadFilas = async () => {
    try {
      // Usar edge function com service_role para contornar RLS
      const { data, error } = await supabase.functions.invoke('get-queues-with-workspaces');

      if (error) {
        console.error('Erro ao carregar filas:', error);
        toast.error('Erro ao carregar filas');
        setLoading(false);
        return;
      }

      console.log('📊 Filas retornadas:', data);
      setFilas(data || []);
    } catch (error) {
      console.error('Erro ao carregar filas:', error);
      toast.error('Erro ao carregar filas');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFila = async (filaId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta fila?')) return;

    try {
      const { error } = await supabase
        .from('queues')
        .delete()
        .eq('id', filaId);

      if (error) throw error;
      
      toast.success('Fila excluída com sucesso');
      loadFilas();
    } catch (error) {
      console.error('Erro ao excluir fila:', error);
      toast.error('Erro ao excluir fila');
    }
  };

  const handleEditFila = (fila: Fila) => {
    setSelectedFila(fila);
    setShowEditModal(true);
  };

  useEffect(() => {
    loadFilas();
  }, []);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#050505]">
      {/* Excel-style Table */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="bg-white border border-[#d4d4d4] shadow-sm dark:bg-[#111111] dark:border-gray-700">
            <div className="grid grid-cols-5 bg-[#f3f3f3] border-b border-[#d4d4d4] dark:bg-[#161616] dark:border-gray-700">
              {['Id', 'Nome', 'Usuários', 'Empresas', 'Ações'].map((header) => (
                <div key={header} className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] last:border-r-0 dark:text-gray-200 dark:border-gray-700">
                  {header}
                </div>
              ))}
            </div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="grid grid-cols-5 border-b border-[#d4d4d4] animate-pulse dark:border-gray-700">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="px-3 py-2.5 border-r border-[#d4d4d4] last:border-r-0 dark:border-gray-700">
                    <div className="h-4 bg-gray-200 rounded dark:bg-gray-800" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : filas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-white border-2 border-dashed border-[#d4d4d4] dark:bg-[#111111] dark:border-gray-700">
            <ListOrdered className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2 dark:text-gray-100">Nenhuma fila encontrada</h3>
            <p className="text-gray-500 mb-4 dark:text-gray-400">
              Clique em "Adicionar fila" para criar sua primeira fila.
            </p>
            <Button 
              onClick={handleAddFila}
              className="h-7 px-3 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Adicionar fila
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-[#d4d4d4] shadow-sm dark:bg-[#111111] dark:border-gray-700">
            {/* Table Header */}
            <div className="grid grid-cols-5 bg-[#f3f3f3] border-b border-[#d4d4d4] sticky top-0 z-10 dark:bg-[#161616] dark:border-gray-700">
              <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] dark:text-gray-200 dark:border-gray-700">
                Id
              </div>
              <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] dark:text-gray-200 dark:border-gray-700">
                Nome
              </div>
              <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] dark:text-gray-200 dark:border-gray-700">
                Usuários
              </div>
              <div className="px-3 py-2 text-xs font-semibold text-gray-700 border-r border-[#d4d4d4] dark:text-gray-200 dark:border-gray-700">
                Empresas
              </div>
              <div className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
                Ações
              </div>
            </div>

            {/* Table Body */}
            {filas.map((fila) => (
              <div
                key={fila.id}
                className="grid grid-cols-5 border-b border-[#d4d4d4] hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-900/60"
              >
                {/* Id */}
                <div className="px-3 py-2.5 text-xs border-r border-[#d4d4d4] font-mono text-gray-600 dark:text-gray-400 dark:border-gray-700">
                  {fila.id.substring(0, 8)}
                </div>

                {/* Nome */}
                <div className="px-3 py-2.5 text-xs border-r border-[#d4d4d4] flex items-center gap-2 dark:border-gray-700 dark:text-gray-100">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: fila.color || '#8B5CF6' }}
                  />
                  <span className="font-medium">{fila.name}</span>
                </div>

                {/* Usuários */}
                <div className="px-3 py-2.5 text-xs border-r border-[#d4d4d4] dark:border-gray-700 dark:text-gray-200">
                  {fila.user_count || 0}
                </div>

                {/* Empresas */}
                <div className="px-3 py-2.5 text-xs border-r border-[#d4d4d4] dark:border-gray-700 dark:text-gray-200">
                  {fila.workspaces?.name || 'Sem empresa'}
                </div>

                {/* Ações */}
                <div className="px-3 py-2.5 text-xs flex items-center gap-1 dark:text-gray-200">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditFila(fila)}
                    className="h-6 px-2 text-[10px] hover:bg-gray-200 dark:hover:bg-gray-800"
                    title="Editar"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteFila(fila.id)}
                    className="h-6 px-2 text-[10px] hover:bg-gray-200 hover:text-red-600 dark:hover:bg-gray-800"
                    title="Excluir"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdicionarFilaModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={() => {
          setShowAddModal(false);
          loadFilas();
        }}
      />

      <EditarFilaModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        fila={selectedFila}
        onSuccess={() => {
          setShowEditModal(false);
          setSelectedFila(null);
          loadFilas();
        }}
      />
    </div>
  );
});

AutomacoesFilasMaster.displayName = 'AutomacoesFilasMaster';
