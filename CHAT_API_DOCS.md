# Sistema de Chat com N8N (Modo Exclusivo)

Este sistema fornece um backend para integração com n8n, processando mensagens do WhatsApp exclusivamente através de workflows do n8n.

## 🗄️ Estrutura do Banco de Dados

### Tabela `conversations`
- `id` (UUID): Identificador único da conversa
- `phone_number` (TEXT): Número de telefone do cliente
- `contact_name` (TEXT): Nome do contato
- `created_at` (TIMESTAMP): Data de criação
- `updated_at` (TIMESTAMP): Última atualização

### Tabela `messages`
- `id` (UUID): Identificador único da mensagem
- `conversation_id` (UUID): FK para conversations
- `sender_type` (TEXT): 'client' ou 'operator'
- `message_type` (TEXT): 'text', 'image', 'video', 'audio'
- `content` (TEXT): Conteúdo da mensagem ou URL da mídia
- `mime_type` (TEXT): Tipo MIME para mídias
- `created_at` (TIMESTAMP): Data de criação

### Storage `chat-media`
Bucket público para armazenar mídias (imagens, vídeos, áudios)

## 🔌 Edge Functions

### 1. `evolution-webhook`
**Endpoint:** `https://zldeaozqxjwvzgrblyrh.supabase.co/functions/v1/evolution-webhook`
**Método:** POST
**Descrição:** Recebe webhooks da Evolution API e encaminha para n8n

**Comportamento:**
- Todos os dados são encaminhados para n8n via `N8N_WEBHOOK_URL`
- Sem processamento local - apenas proxy para n8n
- Retorna 200 OK mesmo se n8n estiver indisponível

### 2. `whatsapp-webhook`
**Endpoint:** `https://zldeaozqxjwvzgrblyrh.supabase.co/functions/v1/whatsapp-webhook`
**Método:** POST
**Descrição:** Recebe webhooks do WhatsApp e encaminha para n8n

**Comportamento:**
- Todos os dados são encaminhados para n8n via `N8N_WEBHOOK_URL`
- Sem processamento local - apenas proxy para n8n
- Retorna 200 OK mesmo se n8n estiver indisponível

### 3. `send-evolution-message` (DESABILITADO)
**Status:** Função desabilitada no modo n8n-only
**Descrição:** Apenas marca mensagens como enviadas localmente

### 4. `fetch-whatsapp-profile` (DESABILITADO) 
**Status:** Função desabilitada no modo n8n-only
**Descrição:** Retorna erro - busca de perfil não disponível

## 🔧 Variáveis de Ambiente

Configure essas variáveis nos Secrets do Supabase:

- `N8N_WEBHOOK_URL`: URL do webhook do n8n para processar mensagens
- `WHATSAPP_VERIFY_TOKEN`: Token de verificação do webhook WhatsApp (opcional)
- `EVOLUTION_VERIFY_TOKEN`: Token de verificação do webhook Evolution (opcional)

**Observação:** As credenciais da Evolution API (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE) foram removidas. Toda comunicação WhatsApp é agora tratada exclusivamente através de workflows n8n.

## 📱 Fluxo de Funcionamento (Modo N8N Exclusivo)

### Recebimento de Mensagens:
1. Evolution API ou WhatsApp envia webhook para os respectivos endpoints
2. Webhook encaminha todos os dados para n8n (via `N8N_WEBHOOK_URL`)
3. Workflows do n8n tratam todo o processamento de mensagens, operações no banco de dados e lógica de negócio
4. Se n8n estiver indisponível, webhooks retornam OK (200) mas descartam a mensagem

### Envio de Mensagens:
1. Todo envio de mensagem é tratado pelos workflows do n8n
2. A função `send-evolution-message` está desabilitada e apenas marca mensagens como enviadas localmente
3. Workflows do n8n são responsáveis pela entrega real de mensagens WhatsApp

### Processamento de Mídia:
1. Processamento de mídia é tratado pelos workflows do n8n
2. O sistema inclui `n8n-media-processor` para manipulação de mídia
3. Todos os downloads e uploads de mídia são gerenciados pelo n8n

## 🎯 Configuração N8N

### Configuração do Webhook N8N:
1. Crie um workflow no n8n com trigger de webhook
2. Configure a URL do webhook no ambiente Supabase: `N8N_WEBHOOK_URL`
3. O payload recebido terá a estrutura:
```json
{
  "source": "evolution-webhook" ou "whatsapp-webhook",
  "event": "messages.upsert",
  "instance": "nome-da-instancia",
  "data": {
    // dados originais da mensagem
  }
}
```

### Exemplo de Workflow N8N:
- **Trigger:** Webhook 
- **Filtro:** Processar apenas `event === "messages.upsert"`
- **Ações:** Salvar no banco, processar mídia, responder se necessário

## ✅ Tratamento de Mídias (Via N8N)

O processamento de mídia agora é exclusivamente tratado pelo n8n:

1. **Recebimento:** Webhook → N8N → Processamento de mídia → Banco de dados
2. **Tipos suportados:** Definidos pelos workflows n8n
3. **Storage:** Gerenciado pelos workflows n8n 
4. **Processamento:** `n8n-media-processor` disponível para workflows

## 🔒 Segurança

- Webhooks são públicos mas apenas encaminham para n8n
- Funções Evolution API desabilitadas para maior segurança
- Todo processamento de dados é controlado pelos workflows n8n
- RLS mantido nas tabelas do banco de dados

O sistema agora opera em modo n8n-only! Configure a variável `N8N_WEBHOOK_URL` e crie seus workflows no n8n.