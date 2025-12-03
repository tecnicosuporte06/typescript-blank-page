import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useNavigate } from "react-router-dom";
import { useWorkspaceConnections } from "@/hooks/useWorkspaceConnections";
import { useAuth } from "@/hooks/useAuth";

interface IniciarConversaContatoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  contactPhone: string;
}

interface Queue {
  id: string;
  name: string;
  color: string;
}

export function IniciarConversaContatoModal({ 
  open, 
  onOpenChange, 
  contactId,
  contactName,
  contactPhone 
}: IniciarConversaContatoModalProps) {
  const { selectedWorkspace } = useWorkspace();
  const [selectedQueue, setSelectedQueue] = useState<string>("");
  const [selectedConnection, setSelectedConnection] = useState<string>("");
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  
  // Usar hook para buscar conexões
  const { connections, isLoading: connectionsLoading } = useWorkspaceConnections(
    selectedWorkspace?.workspace_id
  );

  // Carregar filas
  useEffect(() => {
    const fetchQueues = async () => {
      if (!selectedWorkspace) return;

      try {
        const { data, error } = await supabase
          .from('queues')
          .select('id, name, color')
          .eq('workspace_id', selectedWorkspace.workspace_id)
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setQueues(data || []);
      } catch (error) {
        console.error('Erro ao carregar filas:', error);
      }
    };

    if (open) {
      fetchQueues();
    }
  }, [open, selectedWorkspace]);

  // Selecionar primeira conexão automaticamente quando carregadas
  useEffect(() => {
    if (connections.length > 0 && !selectedConnection) {
      setSelectedConnection(connections[0].id);
    }
  }, [connections, selectedConnection]);

  const handleIniciar = async () => {
    if (!selectedConnection) {
      toast({
        title: "Atenção",
        description: "Selecione uma conexão.",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);

      // Verificar se já existe uma conversa com este contato
      const { data: existingConversation, error: checkError } = await supabase
        .from('conversations')
        .select('id, status')
        .eq('contact_id', contactId)
        .eq('connection_id', selectedConnection)
        .eq('workspace_id', selectedWorkspace!.workspace_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (checkError) throw checkError;

      let conversationId;
      const connectionData = connections.find(c => c.id === selectedConnection);

      if (existingConversation) {
        // Conversa já existe - atualizar para status 'open' e configurações
        conversationId = existingConversation.id;
        
        await supabase
          .from('conversations')
          .update({ 
            status: 'open',
            queue_id: selectedQueue || null,
            connection_id: selectedConnection,
            evolution_instance: connectionData?.instance_name,
            last_activity_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', conversationId);

        toast({
          title: "Conversa iniciada",
          description: existingConversation.status === 'open' 
            ? "Redirecionando para a conversa." 
            : "Conversa reaberta com sucesso!",
        });
      } else {
        // Criar nova conversa com status 'open'
        const { data: newConversation, error: conversationError } = await supabase
          .from('conversations')
          .insert({
            contact_id: contactId,
            connection_id: selectedConnection,
            evolution_instance: connectionData?.instance_name,
            queue_id: selectedQueue || null,
            canal: 'whatsapp',
            status: 'open',
            agente_ativo: false,
            last_activity_at: new Date().toISOString(),
            workspace_id: selectedWorkspace!.workspace_id
          })
          .select()
          .single();

        if (conversationError) throw conversationError;
        conversationId = newConversation.id;

        toast({
          title: "Conversa criada",
          description: "Nova conversa iniciada com sucesso!",
        });
      }

      // Redirecionar para a aba Conversas com a conversa selecionada
      // Master deve ir para a rota do workspace, outros usuários vão para /conversas
      if (userRole === 'master' && selectedWorkspace) {
        navigate(`/workspace/${selectedWorkspace.workspace_id}/conversas`, { 
          state: { selectedConversationId: conversationId } 
        });
      } else {
        navigate('/conversas', { 
          state: { selectedConversationId: conversationId } 
        });
      }

      handleClose();
    } catch (error) {
      console.error('Erro ao iniciar conversa:', error);
      toast({
        title: "Erro",
        description: "Não foi possível iniciar a conversa. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedQueue("");
    setSelectedConnection("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white text-gray-900 dark:bg-[#0b0b0b] dark:text-gray-100 dark:border-gray-700">
        <DialogHeader className="px-4 py-2 bg-primary text-primary-foreground border-b border-[#d4d4d4] rounded-t-none dark:border-gray-700">
          <DialogTitle>Iniciar Conversa</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-200">Contato</Label>
            <div className="p-3 bg-muted rounded-md dark:bg-[#1a1a1a]">
              <div className="font-medium dark:text-gray-100">{contactName}</div>
              <div className="text-sm text-muted-foreground dark:text-gray-400">{contactPhone}</div>
            </div>
          </div>

          {/* Seleção de Fila */}
          <div className="space-y-2">
            <Label htmlFor="queue" className="text-gray-700 dark:text-gray-200">Fila (opcional)</Label>
            <Select value={selectedQueue} onValueChange={setSelectedQueue}>
              <SelectTrigger id="queue" className="dark:bg-[#161616] dark:border-gray-700 dark:text-gray-100">
                <SelectValue placeholder="Selecione uma fila" />
              </SelectTrigger>
              <SelectContent className="dark:bg-[#161616] dark:border-gray-700 dark:text-gray-100">
                {queues.map((queue) => (
                  <SelectItem key={queue.id} value={queue.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: queue.color }}
                      />
                      {queue.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seleção de Conexão */}
          <div className="space-y-2">
            <Label htmlFor="connection" className="text-gray-700 dark:text-gray-200">Selecione uma Conexão</Label>
            <Select value={selectedConnection} onValueChange={setSelectedConnection}>
              <SelectTrigger id="connection" className="dark:bg-[#161616] dark:border-gray-700 dark:text-gray-100">
                <SelectValue placeholder="Selecione uma Conexão" />
              </SelectTrigger>
              <SelectContent className="dark:bg-[#161616] dark:border-gray-700 dark:text-gray-100">
                {connectionsLoading ? (
                  <div className="p-2 text-sm text-muted-foreground dark:text-gray-400">
                    Carregando conexões...
                  </div>
                ) : connections.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground dark:text-gray-400">
                    Nenhuma conexão disponível
                  </div>
                ) : (
                  connections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      <div className="flex items-center gap-2">
                        {connection.instance_name} {connection.phone_number && `(${connection.phone_number})`}
                        {connection.status === 'connected' ? (
                          <span className="text-xs text-green-500 font-semibold">CONECTADO</span>
                        ) : (
                          <span className="text-xs text-red-500 font-semibold">DESCONECTADO</span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex gap-2 border-t border-[#d4d4d4] pt-4 dark:border-gray-700 bg-[#f7f7f7] dark:bg-[#111111]">
          <Button variant="outline" onClick={handleClose} disabled={loading} className="rounded-none border border-[#d4d4d4] text-gray-800 bg-white hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:bg-transparent dark:hover:bg-[#1f1f1f]">
            Cancelar
          </Button>
          <Button 
            onClick={handleIniciar} 
            disabled={loading || !selectedConnection}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-none disabled:opacity-70"
          >
            {loading ? "Iniciando..." : "Iniciar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
