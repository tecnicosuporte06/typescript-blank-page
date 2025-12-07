import { useState } from 'react';
import { useDatabaseConfig, DatabaseConfig } from '@/hooks/useDatabaseConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
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
import { useAuth } from '@/hooks/useAuth';
import { Database, Edit2, Power, RefreshCw, TestTube, X, Eye, EyeOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function DatabaseConfigManager() {
  const {
    configs,
    activeConfig,
    loading,
    error,
    refreshConfigs,
    switchToDatabase,
    updateConfig,
    testConnection,
  } = useDatabaseConfig();

  const { hasRole } = useAuth();
  const isMaster = hasRole(['master']);

  const [editingConfig, setEditingConfig] = useState<DatabaseConfig | null>(null);
  const [editForm, setEditForm] = useState<Partial<DatabaseConfig>>({});
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [testingConfig, setTestingConfig] = useState<DatabaseConfig | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [showAnonKey, setShowAnonKey] = useState(false);

  // Abrir modal de edição
  const handleEdit = async (config: DatabaseConfig) => {
    setEditingConfig(config);
    
    // Buscar anon_key do banco se não estiver disponível
    let anonKey = config.anonKey;
    if (!anonKey) {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: configData } = await (supabase as any)
          .from('database_configs')
          .select('anon_key')
          .eq('id', config.id)
          .single();
        anonKey = configData?.anon_key || '';
      } catch (error) {
        console.warn('Erro ao buscar anon_key:', error);
        anonKey = '';
      }
    }
    
    setEditForm({
      name: config.name,
      url: config.url,
      projectId: config.projectId,
      anonKey: anonKey,
    });
    setShowAnonKey(false); // Resetar visibilidade ao abrir
  };

  // Salvar edição
  const handleSaveEdit = async () => {
    if (!editingConfig) return;

    const success = await updateConfig(editingConfig.id, editForm);
    if (success) {
      setEditingConfig(null);
      setEditForm({});
    }
  };

  // Confirmar e alternar banco
  const handleConfirmSwitch = async () => {
    if (!switchingTo) return;

    await switchToDatabase(switchingTo);
    setSwitchingTo(null);
  };

  // Testar conexão
  const handleTestConnection = async (config: DatabaseConfig) => {
    setTestingConfig(config);
    setIsTesting(true);
    
    const success = await testConnection(config);
    
    setIsTesting(false);
    if (success) {
      setTimeout(() => setTestingConfig(null), 2000);
    }
  };

  if (!isMaster) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso Negado</CardTitle>
          <CardDescription>
            Apenas usuários master podem gerenciar configurações de banco de dados.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Configurações de Banco de Dados</h2>
          <p className="text-muted-foreground">
            Gerencie as configurações dos bancos Supabase disponíveis no sistema
          </p>
        </div>
        <Button onClick={refreshConfigs} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive font-semibold mb-2">Erro ao carregar configurações:</p>
            <p className="text-destructive text-sm">{error}</p>
            <p className="text-muted-foreground text-xs mt-2">
              Verifique o console do navegador (F12) para mais detalhes.
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {configs.map((config) => (
            <Card 
              key={config.id} 
              className={config.isActive ? 'border-primary border-2' : ''}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    <CardTitle>{config.name}</CardTitle>
                  </div>
                  {config.isActive && (
                    <Badge variant="default" className="bg-green-500">
                      <Power className="h-3 w-3 mr-1" />
                      Ativo
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {config.projectId}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">URL</Label>
                  <p className="text-sm font-mono break-all">{config.url}</p>
                </div>

                <div className="flex gap-2">
                  {!config.isActive && (
                    <Button
                      onClick={() => setSwitchingTo(config.name)}
                      variant="default"
                      size="sm"
                      className="flex-1"
                    >
                      <Power className="h-4 w-4 mr-2" />
                      Usar Este Banco
                    </Button>
                  )}
                  <Button
                    onClick={() => handleEdit(config)}
                    variant="outline"
                    size="sm"
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    onClick={() => handleTestConnection(config)}
                    variant="outline"
                    size="sm"
                    disabled={isTesting && testingConfig?.id === config.id}
                  >
                    {isTesting && testingConfig?.id === config.id ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4 mr-2" />
                    )}
                    Testar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {configs.length === 0 && !loading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Nenhuma configuração de banco encontrada. Execute as migrations para criar as configurações iniciais.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialog de Edição */}
      <Dialog open={!!editingConfig} onOpenChange={(open) => !open && setEditingConfig(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Configuração</DialogTitle>
            <DialogDescription>
              Atualize as informações da configuração de banco de dados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={editForm.name || ''}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Base 1"
              />
            </div>
            <div>
              <Label htmlFor="edit-url">URL</Label>
              <Input
                id="edit-url"
                value={editForm.url || ''}
                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                placeholder="https://projeto.supabase.co"
              />
            </div>
            <div>
              <Label htmlFor="edit-project-id">Project ID</Label>
              <Input
                id="edit-project-id"
                value={editForm.projectId || ''}
                onChange={(e) => setEditForm({ ...editForm, projectId: e.target.value })}
                placeholder="projeto-id"
              />
            </div>
            <div>
              <Label htmlFor="edit-anon-key">Anon Key</Label>
              <div className="relative">
                <Input
                  id="edit-anon-key"
                  type={showAnonKey ? 'text' : 'password'}
                  value={editForm.anonKey || ''}
                  onChange={(e) => setEditForm({ ...editForm, anonKey: e.target.value })}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowAnonKey(!showAnonKey)}
                >
                  {showAnonKey ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Chave pública (anon key) do Supabase. Necessária para conexão.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingConfig(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog de Confirmação de Troca */}
      <AlertDialog open={!!switchingTo} onOpenChange={(open) => !open && setSwitchingTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Troca de Banco</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a alternar para o banco <strong>{switchingTo}</strong>.
              Esta ação irá:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Desativar o banco atual</li>
                <li>Ativar o banco selecionado</li>
                <li>Recarregar a página para aplicar as mudanças</li>
              </ul>
              <strong className="block mt-2">Tem certeza que deseja continuar?</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSwitch}>
              Confirmar Troca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

