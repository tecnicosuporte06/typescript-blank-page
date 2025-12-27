import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useLossReasons } from '@/hooks/useLossReasons';
import { Plus, Trash2, Edit2, X, Check, FileText, Search, Layers } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

export const ConfiguracaoAcoes: React.FC = () => {
  const { selectedWorkspace } = useWorkspace();
  const { workspaceId: urlWorkspaceId } = useParams<{ workspaceId: string }>();

  // Priorizar workspaceId da URL, depois selectedWorkspace
  const effectiveWorkspaceId = urlWorkspaceId || selectedWorkspace?.workspace_id || null;

  const {
    lossReasons,
    isLoading,
    createLossReason,
    updateLossReason,
    deleteLossReason,
  } = useLossReasons(effectiveWorkspaceId);

  // Debug log para verificar workspaceId
  useEffect(() => {
    console.log('🔍 ConfiguracaoAcoes - Workspace Debug:', {
      urlWorkspaceId,
      selectedWorkspaceId: selectedWorkspace?.workspace_id,
      effectiveWorkspaceId,
      lossReasonsCount: lossReasons.length,
      isLoading
    });
  }, [urlWorkspaceId, selectedWorkspace?.workspace_id, effectiveWorkspaceId, lossReasons.length, isLoading]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newReasonName, setNewReasonName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteReasonId, setDeleteReasonId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newReasonName.trim()) return;
    await createLossReason(newReasonName.trim());
    setNewReasonName('');
    setIsAddModalOpen(false);
  };

  // Filtrar motivos de perda baseado no termo de busca
  const filteredLossReasons = lossReasons.filter(reason =>
    reason.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) return;
    await updateLossReason(editingId, editingName.trim());
    setEditingId(null);
    setEditingName('');
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    await updateLossReason(id, undefined, !currentStatus);
  };

  const handleDelete = async () => {
    if (!deleteReasonId) return;
    await deleteLossReason(deleteReasonId);
    setDeleteReasonId(null);
  };

  return (
    <div className="flex flex-col h-full bg-white border border-gray-300 m-2 shadow-sm font-sans text-xs dark:bg-[#0f0f0f] dark:border-gray-700 dark:text-gray-100">
      {/* Excel-like Toolbar (Ribbon) */}
      <div className="flex flex-col border-b border-gray-300 bg-[#f8f9fa] dark:border-gray-700 dark:bg-[#141414]">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 h-auto">
          <div className="flex items-center gap-2">
            <span
              className="font-semibold text-gray-900 dark:text-gray-100"
              style={{ fontSize: "1.5rem" }}
            >
              Motivos de Perda
            </span>
          </div>
        </div>

        {/* Tools Bar */}
        <div className="flex items-center gap-2 p-2 overflow-x-auto">
          {/* Search Group */}
          <div className="flex items-center gap-2 border-r border-gray-300 pr-3 mr-1 dark:border-gray-700">
            <div className="relative w-48">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500 h-3 w-3 dark:text-gray-400" />
              <Input
                placeholder="Pesquisar motivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-7 text-xs border-gray-300 rounded-none focus-visible:ring-1 focus-visible:ring-primary dark:bg-[#1b1b1b] dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Actions Group */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 hover:bg-gray-200 rounded-sm flex flex-col items-center justify-center gap-0.5 text-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span className="text-[9px]">Novo Motivo</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto bg-[#e6e6e6] dark:bg-[#050505] relative">
        <div className="inline-block min-w-full align-middle bg-white dark:bg-[#111111]">
          <table className="min-w-full border-collapse bg-white text-xs font-sans dark:bg-[#111111] dark:text-gray-100">
            <thead className="bg-[#f3f3f3] sticky top-0 z-10 dark:bg-[#1f1f1f]">
              <tr>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[200px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                  <div className="flex items-center justify-between">
                    <span>Motivo</span>
                    <div className="w-[1px] h-3 bg-gray-400 mx-1" />
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-left font-semibold text-gray-700 min-w-[150px] group hover:bg-[#e1e1e1] cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:hover:bg-[#2a2a2a]">
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <div className="w-[1px] h-3 bg-gray-400 mx-1" />
                  </div>
                </th>
                <th className="border border-[#d4d4d4] px-2 py-1 text-center font-semibold text-gray-700 w-[80px] dark:border-gray-700 dark:text-gray-200">
                  <div className="flex items-center justify-between">
                    <span>Ações</span>
                    <div className="w-[1px] h-3 bg-gray-400 mx-1" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="border border-[#e0e0e0] text-center py-12 bg-gray-50 text-muted-foreground dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-400">
                    Carregando motivos...
                  </td>
                </tr>
              ) : filteredLossReasons.length === 0 ? (
                <tr>
                  <td colSpan={3} className="border border-[#e0e0e0] text-center py-12 bg-gray-50 text-muted-foreground dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-400">
                    {searchTerm ? `Nenhum motivo encontrado para "${searchTerm}"` : 'Nenhuma motivo encontrada.'}
                  </td>
                </tr>
              ) : (
                filteredLossReasons.map((reason) => (
                  <tr key={reason.id} className="hover:bg-blue-50 group h-[32px] dark:hover:bg-[#1f2937]">
                    {editingId === reason.id ? (
                      <>
                        <td className="border border-[#e0e0e0] px-2 py-0 align-middle dark:border-gray-700">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveEdit();
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            className="h-6 text-xs rounded-none border-gray-300 dark:bg-[#161616] dark:border-gray-700 dark:text-gray-100"
                            autoFocus
                          />
                        </td>
                        <td className="border border-[#e0e0e0] px-2 py-0 text-gray-500 dark:border-gray-700 dark:text-gray-400 align-middle">
                          {lossReasons.find(r => r.id === editingId)?.is_active !== false ? 'Motivo ativo' : 'Motivo inativo'}
                        </td>
                        <td className="border border-[#e0e0e0] px-1 py-0 text-center align-middle dark:border-gray-700">
                          <div className="flex items-center justify-center gap-1 h-full">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleSaveEdit}
                              disabled={!editingName.trim()}
                              className="h-6 w-6 rounded-sm hover:bg-green-100 text-green-600 dark:text-gray-200 dark:hover:bg-[#1a3a1a]"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleCancelEdit}
                              className="h-6 w-6 rounded-sm hover:bg-red-100 text-red-600 dark:hover:bg-[#2a1f1f]"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="border border-[#e0e0e0] px-2 py-0 font-medium align-middle dark:border-gray-700 dark:text-gray-100">
                          {reason.name}
                        </td>
                        <td className="border border-[#e0e0e0] px-2 py-0 align-middle dark:border-gray-700">
                          <Badge
                            onClick={() => handleToggleStatus(reason.id, reason.is_active ?? true)}
                            className={`rounded-none text-[10px] cursor-pointer transition-colors px-2 py-0.5 ${
                              reason.is_active !== false
                                ? 'bg-green-100 text-black border border-green-300 dark:bg-green-900/30 dark:text-white dark:border-green-500/40 hover:bg-green-200 dark:hover:bg-green-900/50'
                                : 'bg-gray-100 text-gray-700 border border-gray-300 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-600/40 hover:bg-gray-200 dark:hover:bg-gray-800/50'
                            }`}
                            title="Clique para alterar o status"
                          >
                            {reason.is_active !== false ? 'Motivo ativo' : 'Motivo inativo'}
                          </Badge>
                        </td>
                        <td className="border border-[#e0e0e0] px-1 py-0 text-center align-middle dark:border-gray-700">
                          <div className="flex items-center justify-center gap-1 h-full">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleStartEdit(reason.id, reason.name)}
                              className="h-6 w-6 rounded-sm hover:bg-blue-100 text-gray-600 dark:text-gray-200 dark:hover:bg-[#243447]"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteReasonId(reason.id)}
                              className="h-6 w-6 rounded-sm hover:bg-red-100 text-red-600 dark:hover:bg-[#2a1f1f]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer fixo com paginação */}
        <div className="sticky bottom-0 left-0 right-0 bg-[#f8f9fa] dark:bg-[#141414] border-t border-gray-300 dark:border-gray-700 px-4 py-2 z-20">
          <div className="flex items-center justify-center gap-2 text-[11px] text-gray-600 dark:text-gray-400">
            <button
              className="px-2 py-1 border border-gray-300 rounded-sm disabled:opacity-50 dark:border-gray-700"
              disabled={true}
            >
              Anterior
            </button>
            <span>
              Página 1 • 1
            </span>
            <button
              className="px-2 py-1 border border-gray-300 rounded-sm disabled:opacity-50 dark:border-gray-700"
              disabled={true}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {/* Dialog para adicionar novo motivo */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle className="text-lg dark:text-gray-100">Adicionar Motivo de Perda</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground dark:text-gray-400">
              Digite o nome do novo motivo de perda que será exibido ao marcar um negócio como perdido.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Digite o nome do novo motivo..."
              value={newReasonName}
              onChange={(e) => setNewReasonName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newReasonName.trim()) {
                  handleCreate();
                }
              }}
              className="h-8 text-xs rounded-none border-gray-300 focus-visible:ring-1 focus-visible:ring-primary dark:bg-[#1b1b1b] dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddModalOpen(false);
                setNewReasonName('');
              }}
              className="rounded-none border border-gray-300 dark:border-gray-600 dark:text-gray-200 dark:bg-transparent dark:hover:bg-[#1f1f1f]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newReasonName.trim() || isLoading}
              className="rounded-none bg-yellow-500 hover:bg-yellow-600 text-gray-900"
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!deleteReasonId} onOpenChange={() => setDeleteReasonId(null)}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg dark:text-black">Confirmar exclusão</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex items-center justify-center py-6">
            <AlertDialogDescription className="text-xs text-muted-foreground dark:text-gray-200 text-center">
              Tem certeza que deseja excluir este motivo de perda? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none border border-gray-300 dark:border-gray-600 dark:text-gray-200 dark:bg-transparent dark:hover:bg-[#1f1f1f]">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-none bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 dark:text-white">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
