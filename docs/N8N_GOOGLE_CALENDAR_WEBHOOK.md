# Documentação: Webhook N8N para Google Calendar

## Visão Geral

Este documento descreve o formato do payload e como configurar um workflow no N8N para processar eventos do Google Calendar quando atividades são criadas, atualizadas ou deletadas no sistema.

## Endpoint

O webhook será chamado na URL configurada em `workspace_webhook_settings.google_calendar_webhook_url` (ou `webhook_url` se o específico não estiver configurado).

## Formato do Payload

### Ação: CREATE (Criar Evento)

```json
{
  "action": "create",
  "activity_id": "uuid-da-atividade",
  "responsible_user_id": "uuid-do-usuario-responsavel",
  "refresh_token": "refresh-token-do-google-do-usuario",
  "event_data": {
    "summary": "Título da Atividade",
    "description": "Descrição da atividade\n\nLink: https://app.tezeus.com/administracao-google-agenda",
    "start": {
      "dateTime": "2024-12-13T14:00:00Z",
      "timeZone": "America/Sao_Paulo"
    },
    "end": {
      "dateTime": "2024-12-13T14:30:00Z",
      "timeZone": "America/Sao_Paulo"
    }
  }
}
```

### Ação: UPDATE (Atualizar Evento)

```json
{
  "action": "update",
  "activity_id": "uuid-da-atividade",
  "responsible_user_id": "uuid-do-usuario-responsavel",
  "refresh_token": "refresh-token-do-google-do-usuario",
  "google_event_id": "google-event-id-existente",
  "event_data": {
    "summary": "Título Atualizado da Atividade",
    "description": "Descrição atualizada",
    "start": {
      "dateTime": "2024-12-13T15:00:00Z",
      "timeZone": "America/Sao_Paulo"
    },
    "end": {
      "dateTime": "2024-12-13T15:30:00Z",
      "timeZone": "America/Sao_Paulo"
    }
  }
}
```

### Ação: DELETE (Deletar Evento)

```json
{
  "action": "delete",
  "activity_id": "uuid-da-atividade",
  "responsible_user_id": "uuid-do-usuario-responsavel",
  "refresh_token": "refresh-token-do-google-do-usuario",
  "google_event_id": "google-event-id-a-deletar"
}
```

## Resposta Esperada

O N8N deve retornar um JSON com o seguinte formato:

### Sucesso (CREATE/UPDATE)

```json
{
  "success": true,
  "google_event_id": "event-id-retornado-pelo-google"
}
```

### Sucesso (DELETE)

```json
{
  "success": true
}
```

### Erro

```json
{
  "success": false,
  "error": "Mensagem de erro descritiva"
}
```

## Workflow N8N Recomendado

### 1. Webhook Trigger

- **Tipo:** Webhook
- **Método:** POST
- **Path:** `/google-calendar-event` (ou o path que você configurar)

### 2. Switch Node (para separar ações)

- **Condição:** `{{ $json.action }}`
- **Casos:**
  - `create` → Fluxo de criação
  - `update` → Fluxo de atualização
  - `delete` → Fluxo de deleção

### 3. Para CREATE e UPDATE:

#### 3.1. Obter Access Token

- **Tipo:** HTTP Request
- **Método:** POST
- **URL:** `https://oauth2.googleapis.com/token`
- **Body (form-urlencoded):**
  ```
  client_id: [CLIENT_ID_DO_GOOGLE]
  client_secret: [CLIENT_SECRET_DO_GOOGLE]
  refresh_token: {{ $json.refresh_token }}
  grant_type: refresh_token
  ```
- **Salvar:** `access_token` da resposta

#### 3.2. Criar/Atualizar Evento no Google Calendar

- **Tipo:** HTTP Request
- **Método:** 
  - CREATE: `POST`
  - UPDATE: `PUT`
- **URL:**
  - CREATE: `https://www.googleapis.com/calendar/v3/calendars/primary/events`
  - UPDATE: `https://www.googleapis.com/calendar/v3/calendars/primary/events/{{ $json.google_event_id }}`
- **Headers:**
  ```
  Authorization: Bearer {{ $json.access_token }}
  Content-Type: application/json
  ```
- **Body (JSON):**
  ```json
  {
    "summary": "{{ $json.event_data.summary }}",
    "description": "{{ $json.event_data.description }}",
    "start": {{ $json.event_data.start }},
    "end": {{ $json.event_data.end }}
  }
  ```

#### 3.3. Retornar Resposta

- **Tipo:** Respond to Webhook
- **Body:**
  ```json
  {
    "success": true,
    "google_event_id": "{{ $json.id }}"
  }
  ```

### 4. Para DELETE:

#### 4.1. Obter Access Token

- Mesmo processo do passo 3.1

#### 4.2. Deletar Evento

- **Tipo:** HTTP Request
- **Método:** DELETE
- **URL:** `https://www.googleapis.com/calendar/v3/calendars/primary/events/{{ $json.google_event_id }}`
- **Headers:**
  ```
  Authorization: Bearer {{ $json.access_token }}
  ```

#### 4.3. Retornar Resposta

- **Tipo:** Respond to Webhook
- **Body:**
  ```json
  {
    "success": true
  }
  ```

## Tratamento de Erros

1. **Token Expirado/Inválido:**
   - Retornar erro 401
   - O sistema marcará a autorização como revogada

2. **Evento Não Encontrado (UPDATE/DELETE):**
   - Retornar sucesso mesmo se evento não existir (idempotência)

3. **Google Calendar API Error:**
   - Retornar erro com mensagem descritiva
   - O sistema logará mas não bloqueará a operação

## Exemplo de Workflow Completo

```
Webhook → Switch (action) 
  ├─ create → Get Access Token → Create Event → Return Response
  ├─ update → Get Access Token → Update Event → Return Response
  └─ delete → Get Access Token → Delete Event → Return Response
```

## Variáveis de Ambiente Necessárias

No N8N, configure as seguintes variáveis de ambiente ou use credenciais:

- `GOOGLE_CLIENT_ID`: Client ID do aplicativo Google
- `GOOGLE_CLIENT_SECRET`: Client Secret do aplicativo Google

**Nota:** Essas credenciais são as mesmas configuradas em `system_google_calendar_settings` no banco de dados.

## Validações Recomendadas

1. Validar que `action` está em `['create', 'update', 'delete']`
2. Validar que `refresh_token` não está vazio
3. Validar que `event_data` está presente para create/update
4. Validar que `google_event_id` está presente para update/delete

## Logs e Debugging

Recomenda-se adicionar nodes de log no N8N para:
- Payload recebido
- Access token obtido (sem expor o token completo)
- Resposta do Google Calendar API
- Erros capturados

## Notas Importantes

1. O `refresh_token` é específico de cada usuário e workspace
2. O sistema já valida se o usuário tem Google Calendar autorizado antes de chamar o webhook
3. O webhook deve responder rapidamente (< 30 segundos) para evitar timeouts
4. Operações são idempotentes: chamar múltiplas vezes com os mesmos dados não deve causar problemas
5. O sistema não bloqueia a criação/atualização de atividades se o Google Calendar falhar

