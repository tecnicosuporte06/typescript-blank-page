import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useLossReasons } from '@/hooks/useLossReasons';
import { Plus, Trash2, Edit2, X, Check, FileText } from 'lucide-react';
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

  const [newReasonName, setNewReasonName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteReasonId, setDeleteReasonId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newReasonName.trim()) return;
    await createLossReason(newReasonName.trim());
    setNewReasonName('');
  };

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
      {/* Barra superior estilo “Excel” */}
      <div className="flex flex-col border-b border-gray-300 bg-[#f8f9fa] dark:border-gray-700 dark:bg-[#141414]">
        <div className="flex items-center justify-between px-4 py-2 bg-primary text-primary-foreground h-10">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="font-semibold text-sm tracking-tight">Configuração de Ações</span>
          </div>
          <Badge variant="outline" className="rounded-none border-white/40 text-[10px] tracking-tight bg-primary/30 text-primary-foreground px-2 py-0.5">
            {lossReasons.length} motivo{lossReasons.length === 1 ? '' : 's'}
          </Badge>
        </div>

        {/* Faixa de ferramentas */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-gray-200 bg-[#f3f3f3] dark:border-gray-700 dark:bg-[#1a1a1a]">
          <div className="flex-1 min-w-[240px]">
            <Input
              placeholder="Digite o nome do novo motivo..."
              value={newReasonName}
              onChange={(e) => setNewReasonName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate();
                }
              }}
              className="h-8 text-xs rounded-none border-gray-300 focus-visible:ring-1 focus-visible:ring-primary dark:bg-[#1b1b1b] dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={!newReasonName.trim() || isLoading}
            className="h-8 rounded-none bg-yellow-500 hover:bg-yellow-600 text-gray-900"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Adicionar
          </Button>
          <Button
            variant="ghost"
            className="h-8 rounded-none border border-gray-300 text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:bg-transparent dark:hover:bg-[#1f1f1f]"
            onClick={() => setNewReasonName('')}
          >
            Limpar
          </Button>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="flex-1 overflow-auto bg-[#e6e6e6] p-4 dark:bg-[#050505]">
        <div className="max-w-4xl mx-auto bg-white border border-gray-300 shadow-sm dark:bg-[#111111] dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-2 bg-[#f3f3f3] border-b border-gray-300 dark:bg-[#1f1f1f] dark:border-gray-700">
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Motivos de perda</p>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                Configure os motivos que podem ser selecionados ao marcar um negócio como perdido.
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs dark:text-gray-100">
              <thead className="bg-[#f7f7f7] dark:bg-[#1f1f1f]">
                <tr>
                  <th className="border border-[#d4d4d4] px-3 py-2 text-left font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">Motivo</th>
                  <th className="border border-[#d4d4d4] px-3 py-2 text-left font-semibold text-gray-700 w-52 dark:border-gray-700 dark:text-gray-200">Status</th>
                  <th className="border border-[#d4d4d4] px-3 py-2 text-center font-semibold text-gray-700 w-32 dark:border-gray-700 dark:text-gray-200">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && lossReasons.length === 0 && (
                  <>
                    {Array.from({ length: 4 }).map((_, index) => (
                      <tr key={`skeleton-${index}`} className="bg-white dark:bg-[#111111]">
                        <td className="border border-[#e0e0e0] px-3 py-3 dark:border-gray-700">
                          <div className="h-4 w-40 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm" />
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-3 dark:border-gray-700">
                          <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm" />
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-3 text-center dark:border-gray-700">
                          <div className="h-4 w-16 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-sm mx-auto" />
                        </td>
                      </tr>
                    ))}
                  </>
                )}

                {!isLoading && lossReasons.length === 0 && (
                  <tr>
                    <td colSpan={3} className="border border-[#e0e0e0] px-3 py-8 bg-white text-center text-gray-500 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-400">
                      Nenhum motivo cadastrado. Utilize a barra superior para incluir novos motivos.
                    </td>
                  </tr>
                )}

                {!isLoading && lossReasons.length > 0 && lossReasons.map((reason) => (
                  <tr key={reason.id} className="bg-white hover:bg-yellow-50 transition-colors dark:bg-[#111111] dark:hover:bg-[#1f2937]">
                    {editingId === reason.id ? (
                      <>
                        <td className="border border-[#e0e0e0] px-3 py-3 align-top dark:border-gray-700">
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
                            className="h-8 rounded-none border-gray-300 dark:bg-[#161616] dark:border-gray-700 dark:text-gray-100"
                            autoFocus
                          />
                          <p className="text-[10px] text-gray-500 mt-1 dark:text-gray-400">Enter para salvar • ESC para cancelar</p>
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-3 text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          {lossReasons.find(r => r.id === editingId)?.is_active !== false ? 'Motivo ativo' : 'Motivo inativo'}
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-3 text-center dark:border-gray-700">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 rounded-none hover:bg-green-50 dark:hover:bg-green-900/30"
                              onClick={handleSaveEdit}
                              disabled={!editingName.trim()}
                            >
                              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 rounded-none hover:bg-red-50 dark:hover:bg-red-900/30"
                              onClick={handleCancelEdit}
                            >
                              <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="border border-[#e0e0e0] px-3 py-3 dark:border-gray-700">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{reason.name}</p>
                          <span className="text-[10px] text-gray-500 uppercase tracking-[0.08em] dark:text-gray-400">Motivo padrão</span>
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-3 dark:border-gray-700">
                          <Badge
                            onClick={() => handleToggleStatus(reason.id, reason.is_active ?? true)}
                            className={`rounded-none text-[10px] cursor-pointer transition-colors ${
                              reason.is_active !== false
                                ? 'bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-500/40 hover:bg-green-200 dark:hover:bg-green-900/50'
                                : 'bg-gray-100 text-gray-700 border border-gray-300 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-600/40 hover:bg-gray-200 dark:hover:bg-gray-800/50'
                            }`}
                            title="Clique para alterar o status"
                          >
                            {reason.is_active !== false ? 'Motivo ativo' : 'Motivo inativo'}
                          </Badge>
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-3 dark:border-gray-700">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 rounded-none hover:bg-gray-200 dark:hover:bg-gray-700"
                              onClick={() => handleStartEdit(reason.id, reason.name)}
                            >
                              <Edit2 className="h-4 w-4 dark:text-gray-300" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 rounded-none hover:bg-red-50 dark:hover:bg-red-900/30"
                              onClick={() => setDeleteReasonId(reason.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!deleteReasonId} onOpenChange={() => setDeleteReasonId(null)}>
        <AlertDialogContent className="rounded-none border border-gray-300 dark:border-gray-700 dark:bg-[#0b0b0b] dark:text-gray-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground dark:text-gray-400">
              Tem certeza que deseja excluir este motivo de perda? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none border border-gray-300 dark:border-gray-600 dark:text-gray-200 dark:bg-transparent dark:hover:bg-[#1f1f1f]">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-none bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
