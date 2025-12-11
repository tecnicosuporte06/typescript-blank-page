import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Calendar, CheckCircle2, LogOut, ShieldCheck, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getWorkspaceHeaders } from "@/lib/workspaceHeaders";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

interface IntegrationStatus {
  connected: boolean;
  requiresReconnect: boolean;
  googleEmail: string | null;
  authorizedAt: string | null;
  lastTokenCheckAt?: string | null;
  revokedAt: string | null;
  scopes: string[];
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
};

export function AdministracaoGoogleAgenda() {
  const { selectedWorkspace } = useWorkspace();
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const redirectUri = useMemo(
    () => `${window.location.origin}/google-agenda/callback`,
    []
  );

  const headers = useMemo(() => {
    try {
      return getWorkspaceHeaders(selectedWorkspace?.workspace_id);
    } catch (error) {
      console.error("❌ Erro ao montar headers do workspace", error);
      return null;
    }
  }, [selectedWorkspace?.workspace_id]);

  const loadStatus = useCallback(async () => {
    if (!headers) {
      setStatus(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const {
        data,
        error,
      } = await supabase.functions.invoke<any>(
        "google-calendar-integration",
        {
          headers,
          body: { action: "status" },
        }
      );

      if (error) throw error;

      // Se o backend sinalizar que as credenciais globais não estão configuradas
      if (data?.error === "GOOGLE_SETTINGS_NOT_CONFIGURED") {
        setStatus(null);
        setLoading(false);
        toast.error(
          "As credenciais do aplicativo Google Agenda ainda não foram configuradas pelo painel MASTER."
        );
        return;
      }

      setStatus(data as IntegrationStatus);
    } catch (error: any) {
      console.error("❌ Erro ao carregar status da Google Agenda", error);
      toast.error(
        error?.message ??
          "Não foi possível carregar o status da integração com a Google Agenda."
      );
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Detectar modo escuro/claro
  useEffect(() => {
    const checkDarkMode = () => {
      const isDark = document.documentElement.classList.contains('dark') ||
        localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setIsDarkMode(isDark);
    };

    checkDarkMode();

    // Observar mudanças no tema
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Observar mudanças no localStorage
    const handleStorageChange = () => checkDarkMode();
    window.addEventListener('storage', handleStorageChange);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Listener para mensagens do callback
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verificar origem para segurança
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'google-calendar-oauth-complete') {
        setIsAuthModalOpen(false);
        setAuthUrl(null);

        if (event.data.status === 'success') {
          toast.success('Integração com Google Agenda concluída com sucesso!');
          loadStatus();
        } else {
          toast.error(
            event.data.message || 'Não foi possível concluir a integração. Tente novamente.'
          );
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadStatus]);

  const handleConnect = async () => {
    if (!headers) {
      toast.error("Selecione um workspace antes de conectar sua agenda.");
      return;
    }

    setIsRedirecting(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        authUrl?: string;
        error?: string;
      }>("google-calendar-integration", {
        headers,
        body: { action: "auth-url" },
      });

      if (error) throw error;

      if (data?.error === "GOOGLE_SETTINGS_NOT_CONFIGURED") {
        throw new Error(
          "As credenciais globais do aplicativo Google Agenda não estão configuradas. Peça ao usuário MASTER para configurá-las."
        );
      }

      if (!data?.authUrl) {
        throw new Error("Não recebemos o link de autenticação do Google.");
      }

      // Abrir modal com iframe ao invés de redirecionar
      setAuthUrl(data.authUrl);
      setIsAuthModalOpen(true);
    } catch (error: any) {
      console.error("❌ Erro ao iniciar OAuth com Google", error);
      toast.error(
        error?.message ??
          "Não foi possível iniciar o login com Google. Tente novamente."
      );
    } finally {
      setIsRedirecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!headers) return;
    setIsDisconnecting(true);

    try {
      const { error } = await supabase.functions.invoke(
        "google-calendar-integration",
        {
          headers,
          body: { action: "disconnect" },
        }
      );

      if (error) throw error;
      toast.success("Integração com Google Agenda desconectada.");
      loadStatus();
    } catch (error: any) {
      console.error("❌ Erro ao desconectar integração Google Agenda", error);
      toast.error(
        error?.message ?? "Não foi possível desconectar da Google Agenda."
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  const renderStatusSection = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-12 w-full" />
        </div>
      );
    }

    if (!headers) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Selecione um workspace</AlertTitle>
          <AlertDescription>
            É necessário escolher um workspace antes de configurar a Google
            Agenda.
          </AlertDescription>
        </Alert>
      );
    }

    if (!status?.connected) {
      return (
        <div className="space-y-6">
          {status?.requiresReconnect && (
            <Alert variant="destructive">
              <AlertTitle>Conexão expirada</AlertTitle>
              <AlertDescription>
                Precisamos que você refaça o login com Google para continuar
                criando eventos automaticamente.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <p className="text-base text-muted-foreground">
              Conecte sua conta Google para permitir a criação automática de
              eventos no seu Google Agenda diretamente pelo sistema.
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>Cada usuário conecta apenas o próprio calendário.</li>
              <li>Os eventos criados ficam visíveis somente para você.</li>
              <li>Nenhuma configuração técnica adicional é necessária.</li>
            </ul>
          </div>

          <Button
            size="lg"
            className="gap-2"
            onClick={handleConnect}
            disabled={isRedirecting}
          >
            {isRedirecting ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Calendar className="w-4 h-4" />
            )}
            Fazer login com Google para ativar a Agenda
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant="secondary"
            className="gap-2 px-3 py-1 border border-emerald-200 bg-emerald-50 text-emerald-800"
          >
            <CheckCircle2 className="w-4 h-4" />
            Conectado
          </Badge>
          {status.requiresReconnect && (
            <Badge variant="destructive">Reconexão necessária</Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {status.googleEmail}
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Última autorização</p>
            <p className="font-medium">{formatDateTime(status.authorizedAt)}</p>
          </div>
          <div className="rounded-lg border p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Última verificação</p>
            <p className="font-medium">{formatDateTime(status.lastTokenCheckAt)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Escopos autorizados</p>
          <div className="flex flex-wrap gap-2">
            {status.scopes?.length ? (
              status.scopes.map((scope) => (
                <Badge key={scope} variant="outline" className="font-mono text-[11px]">
                  {scope}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">Nenhum escopo registrado.</span>
            )}
          </div>
        </div>

        <Alert>
          <ShieldCheck className="w-4 h-4" />
          <AlertTitle>Tokens seguros e revogáveis</AlertTitle>
          <AlertDescription>
            Armazenamos apenas o e-mail e o refresh token, sem persistir o access token.
            Sempre que precisarmos criar um evento, geramos um novo access token temporário. Se o token ficar inválido, ele é revogado automaticamente e você será orientado a reconectar.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="destructive"
            className="gap-2"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            Desconectar Google Agenda
          </Button>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={loadStatus}
            disabled={loading}
          >
            <RefreshCcw className="w-4 h-4" />
            Recarregar status
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Google Agenda</h1>
        <p className="text-muted-foreground">
          Configure a integração oficial com a Google Agenda para que o Tezeus
          crie eventos automaticamente no seu calendário pessoal.
        </p>
      </div>

      <Card className="border-primary/20 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Integração com Google Agenda
          </CardTitle>
          <CardDescription>
            Conecte sua conta Google para permitir a criação automática de eventos no seu Google Agenda diretamente pelo sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>{renderStatusSection()}</CardContent>
      </Card>

      <Alert>
        <AlertTitle>Como funciona?</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Assim que você autorizar o acesso, o sistema passa a criar eventos no seu próprio Google Agenda.
            Nenhum outro usuário consegue ver ou alterar os eventos gerados para você.
          </p>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>Suporte nativo a múltiplos usuários dentro do mesmo workspace.</li>
            <li>O consentimento é solicitado diretamente pelo Google com escopo Calendar.</li>
            <li>Usamos acesso offline para manter os eventos funcionando continuamente.</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Modal de Autenticação Google */}
      <Dialog open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen}>
        <DialogContent className={`sm:max-w-2xl max-w-[90vw] w-full h-[85vh] p-0 gap-0 border border-[#d4d4d4] dark:border-gray-700 bg-white dark:bg-[#0f0f0f] shadow-lg rounded-none overflow-hidden flex flex-col ${isDarkMode ? 'dark' : ''}`}>
          <DialogHeader className="bg-primary p-4 rounded-none m-0 flex-shrink-0 border-b border-[#d4d4d4] dark:border-gray-700">
            <DialogTitle className="text-primary-foreground text-base font-bold">
              Autenticação Google Agenda
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 relative overflow-hidden">
            {authUrl && (
              <iframe
                ref={iframeRef}
                src={authUrl}
                className="w-full h-full border-0"
                title="Autenticação Google Agenda"
                allow="popups"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

