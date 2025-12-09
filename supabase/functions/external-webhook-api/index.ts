import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface ApiKeyValidation {
  workspace_id: string;
  api_key_id: string;
}

interface ContactData {
  name: string;
  phone?: string;
  email?: string;
  extra_info?: Record<string, any>;
}

interface CardData {
  pipeline_id: string;
  column_id: string;
  contact_id?: string;
  title?: string;
  description?: string;
  value?: number;
  status?: string;
  responsible_user_id?: string;
}

interface RequestPayload {
  action: "create_contact" | "create_card" | "create_contact_with_card";
  workspace_id: string;
  contact?: ContactData;
  card?: CardData;
}

// Função para validar API Key
async function validateApiKey(
  supabase: any,
  apiKey: string
): Promise<ApiKeyValidation | null> {
  if (!apiKey) {
    return null;
  }

  const { data, error } = await supabase
    .from("workspace_api_keys")
    .select("id, workspace_id, is_active")
    .eq("api_key", apiKey)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    console.error("API Key validation error:", error);
    return null;
  }

  // Atualizar last_used_at
  await supabase
    .from("workspace_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    workspace_id: data.workspace_id,
    api_key_id: data.id,
  };
}

// Função para validar workspace
async function validateWorkspace(
  supabase: any,
  workspaceId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return true;
}

// Função para normalizar telefone
function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  
  // Remove caracteres não numéricos
  let normalized = phone.replace(/\D/g, "");
  
  // Adiciona 55 na frente se não tiver
  if (normalized && !normalized.startsWith("55")) {
    normalized = "55" + normalized;
  }
  
  return normalized || null;
}

// Função para criar ou buscar contato
async function createOrGetContact(
  supabase: any,
  workspaceId: string,
  contactData: ContactData
): Promise<{ id: string; is_new: boolean }> {
  const normalizedPhone = normalizePhone(contactData.phone);

  // Se tem telefone, buscar contato existente
  if (normalizedPhone) {
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (existingContact) {
      console.log("Contato existente encontrado:", existingContact.id);
      return { id: existingContact.id, is_new: false };
    }
  }

  // Criar novo contato
  const insertData: any = {
    name: contactData.name.trim(),
    workspace_id: workspaceId,
    phone: normalizedPhone,
    email: contactData.email?.trim() || null,
  };

  if (contactData.extra_info && Object.keys(contactData.extra_info).length > 0) {
    insertData.extra_info = contactData.extra_info;
  }

  const { data: newContact, error } = await supabase
    .from("contacts")
    .insert(insertData)
    .select("id")
    .single();

  if (error || !newContact) {
    throw new Error(`Erro ao criar contato: ${error?.message || "Erro desconhecido"}`);
  }

  console.log("Novo contato criado:", newContact.id);
  return { id: newContact.id, is_new: true };
}

// Função para validar pipeline e coluna
async function validatePipelineAndColumn(
  supabase: any,
  workspaceId: string,
  pipelineId: string,
  columnId: string
): Promise<boolean> {
  // Validar pipeline
  const { data: pipeline, error: pipelineError } = await supabase
    .from("pipelines")
    .select("id, workspace_id")
    .eq("id", pipelineId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (pipelineError || !pipeline) {
    return false;
  }

  // Validar coluna
  const { data: column, error: columnError } = await supabase
    .from("pipeline_columns")
    .select("id, pipeline_id")
    .eq("id", columnId)
    .eq("pipeline_id", pipelineId)
    .maybeSingle();

  if (columnError || !column) {
    return false;
  }

  return true;
}

// Função para criar card
async function createCard(
  supabase: any,
  cardData: CardData,
  contactId: string
): Promise<string> {
  // Validar que contact_id existe
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .maybeSingle();

  if (contactError || !contact) {
    throw new Error("Contato não encontrado");
  }

  // Determinar description (obrigatório)
  // Aceita tanto 'title' quanto 'description' do payload para compatibilidade
  const description = cardData.title || cardData.description || "Novo Card";

  const insertData: any = {
    pipeline_id: cardData.pipeline_id,
    column_id: cardData.column_id,
    contact_id: contactId,
    description: description,
    value: cardData.value || 0,
    status: cardData.status || "aberto",
    moved_to_column_at: new Date().toISOString(), // ✅ Registrar timestamp de entrada na coluna
  };

  if (cardData.responsible_user_id) {
    insertData.responsible_user_id = cardData.responsible_user_id;
  }

  const { data: newCard, error } = await supabase
    .from("pipeline_cards")
    .insert(insertData)
    .select("id")
    .single();

  if (error || !newCard) {
    throw new Error(`Erro ao criar card: ${error?.message || "Erro desconhecido"}`);
  }

  console.log("Novo card criado:", newCard.id);
  return newCard.id;
}

// Função para executar ação de automação (simplificada do pipeline-management)
async function executeAutomationAction(
  action: any,
  card: any,
  supabaseClient: any
): Promise<void> {
  console.log(`🎬 Executando ação: ${action.action_type}`, action.action_config);
  
  // Normalizar action_config
  if (!action.action_config) {
    action.action_config = {};
  } else if (typeof action.action_config === 'string') {
    try {
      action.action_config = JSON.parse(action.action_config);
    } catch {
      action.action_config = {};
    }
  }

  switch (action.action_type) {
    case 'send_message': {
      const conversationId = card.conversation?.id || card.conversation_id;
      if (!conversationId) {
        console.warn(`⚠️ Card não tem conversa associada. Não é possível enviar mensagem.`);
        return;
      }

      const messageContent = action.action_config?.message || action.action_config?.content || '';
      if (!messageContent) {
        console.error(`❌ Ação send_message não tem conteúdo configurado`);
        return;
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const sendMessageUrl = `${supabaseUrl}/functions/v1/test-send-msg`;
      
      const payload = {
        conversation_id: conversationId,
        content: messageContent,
        message_type: 'text',
        sender_type: 'system',
        sender_id: null,
        clientMessageId: `automation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      try {
        const sendResponse = await fetch(sendMessageUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          console.error(`❌ Erro ao enviar mensagem:`, errorText);
          return;
        }

        console.log(`✅ Mensagem enviada com sucesso`);
      } catch (error) {
        console.error(`❌ Erro ao enviar mensagem:`, error);
      }
      break;
    }
    
    case 'move_to_column': {
      const targetColumnId = action.action_config?.target_column_id || action.action_config?.column_id;
      if (!targetColumnId) {
        console.warn(`⚠️ Ação move_to_column não tem target_column_id configurado.`);
        return;
      }
      
      await supabaseClient
        .from('pipeline_cards')
        .update({ column_id: targetColumnId, moved_to_column_at: new Date().toISOString() })
        .eq('id', card.id);
      
      console.log(`✅ Card movido para coluna ${targetColumnId}`);
      break;
    }
    
    case 'add_tag': {
      const tagId = action.action_config?.tag_id;
      if (!tagId || !card.contact_id) {
        console.warn(`⚠️ Ação add_tag não tem tag_id ou card não tem contact_id.`);
        return;
      }
      
      await supabaseClient
        .from('contact_tags')
        .upsert({
          contact_id: card.contact_id,
          tag_id: tagId
        }, {
          onConflict: 'contact_id,tag_id'
        });
      
      console.log(`✅ Tag ${tagId} adicionada ao contato`);
      break;
    }
    
    case 'add_agent': {
      let conversationId = card.conversation?.id || card.conversation_id;
      if (!conversationId && card.id) {
        const { data: cardData } = await supabaseClient
          .from('pipeline_cards')
          .select('conversation_id')
          .eq('id', card.id)
          .single();
        conversationId = cardData?.conversation_id || null;
      }

      if (!conversationId) {
        console.warn(`⚠️ Card não tem conversa associada. Não é possível adicionar agente.`);
        return;
      }

      let agentIdToActivate = action.action_config?.agent_id || null;
      if (!agentIdToActivate) {
        const { data: conv } = await supabaseClient
          .from('conversations')
          .select('agent_active_id, queue_id')
          .eq('id', conversationId)
          .single();

        if (conv?.agent_active_id) {
          agentIdToActivate = conv.agent_active_id;
        } else if (conv?.queue_id) {
          const { data: queue } = await supabaseClient
            .from('queues')
            .select('ai_agent_id')
            .eq('id', conv.queue_id)
            .single();
          agentIdToActivate = queue?.ai_agent_id || null;
        }
      }

      if (!agentIdToActivate) {
        console.warn(`⚠️ Nenhum agent_id definido. Ação ignorada.`);
        return;
      }

      await supabaseClient
        .from('conversations')
        .update({
          agente_ativo: true,
          agent_active_id: agentIdToActivate,
          status: 'open'
        })
        .eq('id', conversationId);

      console.log(`✅ Agente ${agentIdToActivate} ativado na conversa`);
      break;
    }
    
    case 'remove_agent': {
      let conversationId = card.conversation?.id || card.conversation_id;
      if (!conversationId && card.id) {
        const { data: cardData } = await supabaseClient
          .from('pipeline_cards')
          .select('conversation_id')
          .eq('id', card.id)
          .single();
        conversationId = cardData?.conversation_id || null;
      }

      if (!conversationId) {
        console.warn(`⚠️ Card não tem conversa associada. Não é possível remover agente.`);
        return;
      }

      await supabaseClient
        .from('conversations')
        .update({ 
          agente_ativo: false,
          agent_active_id: null
        })
        .eq('id', conversationId);

      console.log(`✅ Agente removido da conversa`);
      break;
    }
    
    case 'send_funnel': {
      const funnelId = action.action_config?.funnel_id;
      if (!funnelId) {
        console.warn(`⚠️ Ação send_funnel não tem funnel_id configurado.`);
        return;
      }

      let conversationId = card.conversation?.id || card.conversation_id;
      if (!conversationId && card.contact_id) {
        const workspaceId = card.pipelines?.workspace_id || card.conversation?.workspace_id;
        if (workspaceId) {
          const { data: existingConversation } = await supabaseClient
            .from('conversations')
            .select('id, connection_id, workspace_id')
            .eq('contact_id', card.contact_id)
            .eq('workspace_id', workspaceId)
            .not('connection_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (existingConversation) {
            conversationId = existingConversation.id;
          }
        }
      }
      
      if (!conversationId) {
        console.warn(`⚠️ Card não tem conversa associada. Não é possível enviar funil.`);
        return;
      }

      const { data: funnel } = await supabaseClient
        .from('quick_funnels')
        .select('*')
        .eq('id', funnelId)
        .single();

      if (!funnel || !funnel.steps || funnel.steps.length === 0) {
        console.warn(`⚠️ Funil não encontrado ou sem steps.`);
        return;
      }

      const sortedSteps = [...funnel.steps].sort((a, b) => (a.order || 0) - (b.order || 0));
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const sendMessageUrl = `${supabaseUrl}/functions/v1/test-send-msg`;

      for (let i = 0; i < sortedSteps.length; i++) {
        const step = sortedSteps[i];
        // Lógica simplificada - apenas para mensagens de texto
        if (step.type === 'message' || step.type === 'messages') {
          const { data: message } = await supabaseClient
            .from('quick_messages')
            .select('*')
            .eq('id', step.item_id)
            .single();

          if (message) {
            await fetch(sendMessageUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conversation_id: conversationId,
                content: message.content,
                message_type: 'text',
                sender_type: 'system',
                sender_id: null,
                clientMessageId: `funnel_${funnelId}_step_${i}_${Date.now()}`
              })
            });
          }
        }

        if (step.delay_seconds && step.delay_seconds > 0 && i < sortedSteps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, step.delay_seconds * 1000));
        }
      }

      console.log(`✅ Funil enviado com sucesso`);
      break;
    }
    
    default:
      console.warn(`⚠️ Tipo de ação desconhecido: ${action.action_type}`);
  }
}

// Função para acionar automações de coluna quando card é criado
async function triggerColumnAutomations(
  supabaseClient: any,
  cardId: string,
  columnId: string
): Promise<void> {
  try {
    console.log(`🤖 Acionando automações para card ${cardId} na coluna ${columnId}`);

    // Buscar dados completos do card
    const { data: card, error: cardError } = await supabaseClient
      .from('pipeline_cards')
      .select(`
        *,
        conversation:conversations(id, contact_id, connection_id, workspace_id),
        contact:contacts(id, phone, name),
        pipelines:pipelines!inner(id, workspace_id, name)
      `)
      .eq('id', cardId)
      .single();

    if (cardError || !card) {
      console.error(`❌ Erro ao buscar card:`, cardError);
      return;
    }

    // Buscar automações da coluna com trigger enter_column
    const { data: automations, error: automationsError } = await (supabaseClient as any)
      .rpc('get_column_automations', { p_column_id: columnId });

    if (automationsError) {
      console.error(`❌ Erro ao buscar automações:`, automationsError);
      return;
    }

    if (!automations || automations.length === 0) {
      console.log(`ℹ️ Nenhuma automação configurada na coluna ${columnId}`);
      return;
    }

    console.log(`✅ ${automations.length} automação(ões) encontrada(s) na coluna`);

    // Processar cada automação
    for (const automation of automations) {
      if (!automation.is_active) {
        console.log(`⏭️ Automação "${automation.name}" está inativa, pulando`);
        continue;
      }

      try {
        // Buscar detalhes completos da automação
        const { data: automationDetails, error: detailsError } = await (supabaseClient as any)
          .rpc('get_automation_details', { p_automation_id: automation.id });

        if (detailsError || !automationDetails) {
          console.error(`❌ Erro ao buscar detalhes da automação ${automation.id}:`, detailsError);
          continue;
        }

        let parsedDetails = automationDetails;
        if (typeof automationDetails === 'string') {
          try {
            parsedDetails = JSON.parse(automationDetails);
          } catch {
            console.error(`❌ Erro ao parsear detalhes da automação`);
            continue;
          }
        }

        const triggers = parsedDetails.triggers || [];
        const actions = parsedDetails.actions || [];

        // Verificar se tem trigger enter_column
        const hasEnterColumnTrigger = triggers.some((t: any) => 
          (t.trigger_type || t?.trigger_type) === 'enter_column'
        );

        if (!hasEnterColumnTrigger) {
          console.log(`⏭️ Automação "${automation.name}" não tem trigger enter_column, pulando`);
          continue;
        }

        // Verificar se já foi executada (evitar duplicatas)
        const { data: existingExecution } = await supabaseClient
          .from('automation_executions')
          .select('id')
          .eq('card_id', cardId)
          .eq('column_id', columnId)
          .eq('automation_id', automation.id)
          .eq('trigger_type', 'enter_column')
          .gte('executed_at', new Date(Date.now() - 60000).toISOString()) // Último minuto
          .maybeSingle();

        if (existingExecution) {
          console.log(`⏭️ Automação "${automation.name}" já foi executada recentemente, pulando`);
          continue;
        }

        console.log(`🚀 Executando automação "${automation.name}"`);

        // Executar ações em ordem
        const sortedActions = [...actions].sort((a: any, b: any) => 
          (a.action_order || 0) - (b.action_order || 0)
        );

        for (const action of sortedActions) {
          try {
            await executeAutomationAction(action, card, supabaseClient);
          } catch (actionError) {
            console.error(`❌ Erro ao executar ação ${action.action_type}:`, actionError);
            // Continua com próxima ação mesmo se uma falhar
          }
        }

        // Registrar execução
        await supabaseClient
          .from('automation_executions')
          .insert({
            card_id: cardId,
            column_id: columnId,
            automation_id: automation.id,
            trigger_type: 'enter_column',
            executed_at: new Date().toISOString()
          })
          .catch(err => {
            // Ignorar erro de duplicata (pode acontecer em race conditions)
            console.warn(`⚠️ Erro ao registrar execução (pode ser duplicata):`, err);
          });

        console.log(`✅ Automação "${automation.name}" executada com sucesso`);
      } catch (automationError) {
        console.error(`❌ Erro ao processar automação ${automation.id}:`, automationError);
        // Continua com próxima automação
      }
    }

    console.log(`🤖 Processamento de automações concluído`);
  } catch (error) {
    console.error(`❌ Erro geral ao acionar automações:`, error);
    // Não falha a criação do card se as automações falharem
  }
}

// Função para registrar log
async function logWebhookCall(
  supabase: any,
  workspaceId: string,
  eventType: string,
  status: "success" | "error",
  payload: any,
  responseStatus: number,
  responseBody: any
) {
  try {
    await supabase.from("webhook_logs").insert({
      workspace_id: workspaceId,
      event_type: eventType,
      status: status,
      payload_json: payload,
      response_status: responseStatus,
      response_body: typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody),
    });
  } catch (error) {
    console.error("Erro ao registrar log:", error);
    // Não falhar a requisição se o log falhar
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    const errorResponse = {
      success: false,
      error: "METHOD_NOT_ALLOWED",
      message: "Apenas método POST é permitido",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: RequestPayload;
  let apiKeyValidation: ApiKeyValidation | null = null;
  let responseStatus = 200;
  let responseBody: any = {};

  try {
    // Obter API Key do header
    const apiKey = req.headers.get("X-API-Key");
    if (!apiKey) {
      responseStatus = 401;
      responseBody = {
        success: false,
        error: "UNAUTHORIZED",
        message: "API Key não fornecida. Use o header X-API-Key",
      };
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validar API Key
    apiKeyValidation = await validateApiKey(supabase, apiKey);
    if (!apiKeyValidation) {
      responseStatus = 401;
      responseBody = {
        success: false,
        error: "UNAUTHORIZED",
        message: "API Key inválida ou inativa",
      };
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse do payload
    payload = await req.json();

    // Validar action
    if (!payload.action || !["create_contact", "create_card", "create_contact_with_card"].includes(payload.action)) {
      responseStatus = 400;
      responseBody = {
        success: false,
        error: "INVALID_ACTION",
        message: "Ação inválida. Use: create_contact, create_card ou create_contact_with_card",
      };
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validar workspace_id
    if (!payload.workspace_id) {
      responseStatus = 400;
      responseBody = {
        success: false,
        error: "MISSING_WORKSPACE_ID",
        message: "workspace_id é obrigatório",
      };
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validar que workspace_id corresponde à API Key
    if (payload.workspace_id !== apiKeyValidation.workspace_id) {
      responseStatus = 403;
      responseBody = {
        success: false,
        error: "FORBIDDEN",
        message: "API Key não tem permissão para acessar este workspace",
      };
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validar workspace existe
    const workspaceValid = await validateWorkspace(supabase, payload.workspace_id);
    if (!workspaceValid) {
      responseStatus = 404;
      responseBody = {
        success: false,
        error: "WORKSPACE_NOT_FOUND",
        message: "Workspace não encontrado",
      };
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let contactId: string | undefined;
    let cardId: string | undefined;
    let eventType = "";

    // Processar ação
    if (payload.action === "create_contact") {
      if (!payload.contact || !payload.contact.name) {
        responseStatus = 400;
        responseBody = {
          success: false,
          error: "MISSING_CONTACT_DATA",
          message: "Dados do contato são obrigatórios (name)",
        };
        return new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await createOrGetContact(supabase, payload.workspace_id, payload.contact);
      contactId = result.id;
      eventType = "external_api_contact";
      responseBody = {
        success: true,
        data: {
          contact_id: contactId,
        },
        message: result.is_new ? "Contato criado com sucesso" : "Contato existente retornado",
      };
    } else if (payload.action === "create_card") {
      if (!payload.card) {
        responseStatus = 400;
        responseBody = {
          success: false,
          error: "MISSING_CARD_DATA",
          message: "Dados do card são obrigatórios",
        };
        return new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!payload.card.pipeline_id || !payload.card.column_id || !payload.card.contact_id) {
        responseStatus = 400;
        responseBody = {
          success: false,
          error: "MISSING_CARD_REQUIRED_FIELDS",
          message: "pipeline_id, column_id e contact_id são obrigatórios",
        };
        return new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validar pipeline e coluna
      const isValid = await validatePipelineAndColumn(
        supabase,
        payload.workspace_id,
        payload.card.pipeline_id,
        payload.card.column_id
      );

      if (!isValid) {
        responseStatus = 404;
        responseBody = {
          success: false,
          error: "PIPELINE_OR_COLUMN_NOT_FOUND",
          message: "Pipeline ou coluna não encontrados ou não pertencem ao workspace",
        };
        return new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      cardId = await createCard(supabase, payload.card, payload.card.contact_id);
      
      // ✅ Acionar automações de coluna em background (não bloqueia resposta)
      triggerColumnAutomations(supabase, cardId, payload.card.column_id).catch(err => {
        console.error(`❌ Erro ao acionar automações (não crítico):`, err);
      });
      
      eventType = "external_api_card";
      responseBody = {
        success: true,
        data: {
          card_id: cardId,
        },
        message: "Card criado com sucesso",
      };
    } else if (payload.action === "create_contact_with_card") {
      if (!payload.contact || !payload.contact.name) {
        responseStatus = 400;
        responseBody = {
          success: false,
          error: "MISSING_CONTACT_DATA",
          message: "Dados do contato são obrigatórios (name)",
        };
        return new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!payload.card) {
        responseStatus = 400;
        responseBody = {
          success: false,
          error: "MISSING_CARD_DATA",
          message: "Dados do card são obrigatórios",
        };
        return new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!payload.card.pipeline_id || !payload.card.column_id) {
        responseStatus = 400;
        responseBody = {
          success: false,
          error: "MISSING_CARD_REQUIRED_FIELDS",
          message: "pipeline_id e column_id são obrigatórios",
        };
        return new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Criar contato
      const contactResult = await createOrGetContact(supabase, payload.workspace_id, payload.contact);
      contactId = contactResult.id;

      // Validar pipeline e coluna
      const isValid = await validatePipelineAndColumn(
        supabase,
        payload.workspace_id,
        payload.card.pipeline_id,
        payload.card.column_id
      );

      if (!isValid) {
        responseStatus = 404;
        responseBody = {
          success: false,
          error: "PIPELINE_OR_COLUMN_NOT_FOUND",
          message: "Pipeline ou coluna não encontrados ou não pertencem ao workspace",
        };
        return new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Criar card
      cardId = await createCard(supabase, payload.card, contactId);
      
      // ✅ Acionar automações de coluna em background (não bloqueia resposta)
      triggerColumnAutomations(supabase, cardId, payload.card.column_id).catch(err => {
        console.error(`❌ Erro ao acionar automações (não crítico):`, err);
      });
      
      eventType = "external_api_both";
      responseBody = {
        success: true,
        data: {
          contact_id: contactId,
          card_id: cardId,
        },
        message: "Contato e card criados com sucesso",
      };
    }

    // Registrar log de sucesso
    if (apiKeyValidation) {
      await logWebhookCall(
        supabase,
        apiKeyValidation.workspace_id,
        eventType,
        "success",
        payload,
        responseStatus,
        responseBody
      );
    }

    return new Response(JSON.stringify(responseBody), {
      status: responseStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error(`[${requestId}] Erro na função:`, error);

    responseStatus = 500;
    responseBody = {
      success: false,
      error: "INTERNAL_ERROR",
      message: error?.message || "Erro interno do servidor",
    };

    // Registrar log de erro
    if (apiKeyValidation) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await logWebhookCall(
        supabase,
        apiKeyValidation.workspace_id,
        payload?.action || "unknown",
        "error",
        payload || {},
        responseStatus,
        responseBody
      );
    }

    return new Response(JSON.stringify(responseBody), {
      status: responseStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

