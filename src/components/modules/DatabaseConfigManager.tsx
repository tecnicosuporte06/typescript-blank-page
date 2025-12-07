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
  const handleEdit = (config: DatabaseConfig) => {
    setEditingConfig(config);
    
    // A anonKey já vem na lista de configurações, não precisa buscar
    setEditForm({
      name: config.name,
      url: config.url,
      projectId: config.projectId,
      anonKey: config.anonKey || '', // Usar anonKey que já vem nos dados
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
      <Card className="bg-white dark:bg-[#1f1f1f] border-[#d4d4d4] dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-800 dark:text-gray-200">Acesso Negado</CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            Apenas usuários master podem gerenciar configurações de banco de dados.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6 text-gray-800 dark:text-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Configurações de Banco de Dados</h2>
          <p className="text-muted-foreground dark:text-gray-400">
            Gerencie as configurações dos bancos Supabase disponíveis no sistema
          </p>
        </div>
        <Button 
          onClick={refreshConfigs} 
          variant="outline" 
          size="sm" 
          className="border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d]"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {error && (
        <Card className="border-destructive bg-white dark:bg-[#1f1f1f] border-[#d4d4d4] dark:border-gray-700">
          <CardContent className="pt-6">
            <p className="text-destructive dark:text-red-400 font-semibold mb-2">Erro ao carregar configurações:</p>
            <p className="text-destructive dark:text-red-400 text-sm mb-4">{error}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  console.log('🔄 [DatabaseConfigManager] Tentando recarregar após erro...');
                  refreshConfigs();
                }}
                disabled={loading}
                className="border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d]"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Tentar Novamente
              </Button>
              <p className="text-muted-foreground dark:text-gray-400 text-xs">
              Verifique o console do navegador (F12) para mais detalhes.
            </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="bg-white dark:bg-[#1f1f1f] border-[#d4d4d4] dark:border-gray-700">
              <CardHeader>
                <Skeleton className="h-6 w-48 bg-gray-200 dark:bg-gray-700" />
                <Skeleton className="h-4 w-64 mt-2 bg-gray-200 dark:bg-gray-700" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full bg-gray-200 dark:bg-gray-700" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {configs.map((config) => (
            <Card 
              key={config.id} 
              className={`bg-white dark:bg-[#1f1f1f] border-[#d4d4d4] dark:border-gray-700 ${config.isActive ? 'border-primary dark:border-primary border-2' : ''}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                    <CardTitle className="text-gray-800 dark:text-gray-200">{config.name}</CardTitle>
                  </div>
                  {config.isActive && (
                    <Badge variant="default" className="bg-green-500 dark:bg-green-600 text-white">
                      <Power className="h-3 w-3 mr-1" />
                      Ativo
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-gray-600 dark:text-gray-400">
                  {config.projectId}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground dark:text-gray-400">URL</Label>
                  <p className="text-sm font-mono break-all text-gray-700 dark:text-gray-300">{config.url}</p>
                </div>

                <div className="flex gap-2">
                  {!config.isActive && (
                    <Button
                      onClick={() => setSwitchingTo(config.name)}
                      variant="default"
                      size="sm"
                      className="flex-1 bg-primary dark:bg-primary text-white hover:bg-primary/90"
                    >
                      <Power className="h-4 w-4 mr-2" />
                      Usar Este Banco
                    </Button>
                  )}
                  <Button
                    onClick={() => handleEdit(config)}
                    variant="outline"
                    size="sm"
                    className="border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d]"
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    onClick={() => handleTestConnection(config)}
                    variant="outline"
                    size="sm"
                    disabled={isTesting && testingConfig?.id === config.id}
                    className="border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d] disabled:opacity-50"
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
        <Card className="bg-white dark:bg-[#1f1f1f] border-[#d4d4d4] dark:border-gray-700">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground dark:text-gray-400">
              Nenhuma configuração de banco encontrada. Execute as migrations para criar as configurações iniciais.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialog de Edição */}
      <Dialog open={!!editingConfig} onOpenChange={(open) => !open && setEditingConfig(null)}>
        <DialogContent className="bg-white dark:bg-[#1f1f1f] border-[#d4d4d4] dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-800 dark:text-gray-200">Editar Configuração</DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              Atualize as informações da configuração de banco de dados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-name" className="text-gray-700 dark:text-gray-300">Nome</Label>
              <Input
                id="edit-name"
                value={editForm.name || ''}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Base 1"
                className="bg-white dark:bg-[#2d2d2d] border-[#d4d4d4] dark:border-gray-700 text-gray-800 dark:text-gray-200"
              />
            </div>
            <div>
              <Label htmlFor="edit-url" className="text-gray-700 dark:text-gray-300">URL</Label>
              <Input
                id="edit-url"
                value={editForm.url || ''}
                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                placeholder="https://projeto.supabase.co"
                className="bg-white dark:bg-[#2d2d2d] border-[#d4d4d4] dark:border-gray-700 text-gray-800 dark:text-gray-200"
              />
            </div>
            <div>
              <Label htmlFor="edit-project-id" className="text-gray-700 dark:text-gray-300">Project ID</Label>
              <Input
                id="edit-project-id"
                value={editForm.projectId || ''}
                onChange={(e) => setEditForm({ ...editForm, projectId: e.target.value })}
                placeholder="projeto-id"
                className="bg-white dark:bg-[#2d2d2d] border-[#d4d4d4] dark:border-gray-700 text-gray-800 dark:text-gray-200"
              />
            </div>
            <div>
              <Label htmlFor="edit-anon-key" className="text-gray-700 dark:text-gray-300">Anon Key</Label>
              <div className="relative">
                <Input
                  id="edit-anon-key"
                  type={showAnonKey ? 'text' : 'password'}
                  value={editForm.anonKey || ''}
                  onChange={(e) => setEditForm({ ...editForm, anonKey: e.target.value })}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="pr-10 bg-white dark:bg-[#2d2d2d] border-[#d4d4d4] dark:border-gray-700 text-gray-800 dark:text-gray-200"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent dark:hover:bg-transparent"
                  onClick={() => setShowAnonKey(!showAnonKey)}
                >
                  {showAnonKey ? (
                    <EyeOff className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                Chave pública (anon key) do Supabase. Necessária para conexão.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditingConfig(null)}
              className="border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d]"
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} className="bg-primary dark:bg-primary text-white hover:bg-primary/90">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog de Confirmação de Troca */}
      <AlertDialog open={!!switchingTo} onOpenChange={(open) => !open && setSwitchingTo(null)}>
        <AlertDialogContent className="bg-white dark:bg-[#1f1f1f] border-[#d4d4d4] dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-800 dark:text-gray-200">Confirmar Troca de Banco</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
              Você está prestes a alternar para o banco <strong className="text-gray-800 dark:text-gray-200">{switchingTo}</strong>.
              Esta ação irá:
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600 dark:text-gray-400">
                <li>Desativar o banco atual</li>
                <li>Ativar o banco selecionado</li>
                <li>Recarregar a página para aplicar as mudanças</li>
              </ul>
              <strong className="block mt-2 text-gray-800 dark:text-gray-200">Tem certeza que deseja continuar?</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#3d3d3d]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmSwitch}
              className="bg-primary dark:bg-primary text-white hover:bg-primary/90"
            >
              Confirmar Troca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

