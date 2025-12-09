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
  tags?: string[]; // Array de tag_ids (UUIDs)
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

interface ConversationData {
  create?: boolean; // Se true, cria conversa
  connection_id?: string; // Opcional - UUID da conexão
  initial_message?: string; // Opcional - Mensagem inicial
}

interface RequestPayload {
  action: "create_contact" | "create_card" | "create_contact_with_card";
  workspace_id: string;
  contact?: ContactData;
  card?: CardData;
  conversation?: ConversationData; // Opcional - Para criar conversa
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

// Função para adicionar tags ao contato
async function addTagsToContact(
  supabase: any,
  contactId: string,
  workspaceId: string,
  tagIds: string[]
): Promise<void> {
  if (!tagIds || tagIds.length === 0) {
    return;
  }

  // Validar que as tags pertencem ao workspace
  const { data: validTags, error: tagsError } = await supabase
    .from("tags")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("id", tagIds);

  if (tagsError) {
    console.error("Erro ao validar tags:", tagsError);
    throw new Error(`Erro ao validar tags: ${tagsError.message}`);
  }

  if (!validTags || validTags.length === 0) {
    console.warn("Nenhuma tag válida encontrada para o workspace");
    return;
  }

  const validTagIds = validTags.map((tag: any) => tag.id);

  // Adicionar tags ao contato (usar upsert para evitar duplicatas)
  const contactTagsData = validTagIds.map((tagId: string) => ({
    contact_id: contactId,
    tag_id: tagId,
  }));

  const { error: insertError } = await supabase
    .from("contact_tags")
    .upsert(contactTagsData, {
      onConflict: "contact_id,tag_id",
      ignoreDuplicates: true,
    });

  if (insertError) {
    console.error("Erro ao adicionar tags ao contato:", insertError);
    throw new Error(`Erro ao adicionar tags: ${insertError.message}`);
  }

  console.log(`✅ ${validTagIds.length} tag(s) adicionada(s) ao contato ${contactId}`);
}

// Função para criar conversa (vazia ou com mensagem inicial)
async function createConversation(
  supabase: any,
  contactId: string,
  workspaceId: string,
  conversationData: ConversationData
): Promise<string | null> {
  if (!conversationData.create) {
    return null;
  }

  // Verificar se já existe conversa aberta para o contato
  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("workspace_id", workspaceId)
    .eq("status", "open")
    .maybeSingle();

  if (existingConversation) {
    console.log("Conversa existente encontrada:", existingConversation.id);
    
    // Se tem mensagem inicial e conversa já existe, adicionar mensagem
    if (conversationData.initial_message) {
      await addInitialMessage(
        supabase,
        existingConversation.id,
        workspaceId,
        conversationData.initial_message
      );
    }
    
    return existingConversation.id;
  }

  // Buscar conexão padrão se connection_id não foi fornecido
  let connectionId = conversationData.connection_id || null;
  let instanceName = null;

  if (!connectionId) {
    const { data: defaultConnection } = await supabase
      .from("connections")
      .select("id, instance_name")
      .eq("workspace_id", workspaceId)
      .eq("status", "connected")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultConnection) {
      connectionId = defaultConnection.id;
      instanceName = defaultConnection.instance_name;
    }
  } else {
    // Buscar instance_name da conexão fornecida
    const { data: connection } = await supabase
      .from("connections")
      .select("instance_name")
      .eq("id", connectionId)
      .maybeSingle();

    if (connection) {
      instanceName = connection.instance_name;
    }
  }

  // Criar nova conversa
  const conversationPayload: any = {
    contact_id: contactId,
    workspace_id: workspaceId,
    status: "open",
    canal: "whatsapp",
    agente_ativo: false,
    connection_id: connectionId,
    evolution_instance: instanceName,
  };

  const { data: newConversation, error: conversationError } = await supabase
    .from("conversations")
    .insert(conversationPayload)
    .select("id")
    .single();

  if (conversationError || !newConversation) {
    console.error("Erro ao criar conversa:", conversationError);
    throw new Error(`Erro ao criar conversa: ${conversationError?.message || "Erro desconhecido"}`);
  }

  console.log("Nova conversa criada:", newConversation.id);

  // Adicionar mensagem inicial se fornecida
  if (conversationData.initial_message) {
    await addInitialMessage(
      supabase,
      newConversation.id,
      workspaceId,
      conversationData.initial_message
    );
  }

  return newConversation.id;
}

// Função auxiliar para adicionar mensagem inicial
async function addInitialMessage(
  supabase: any,
  conversationId: string,
  workspaceId: string,
  content: string
): Promise<void> {
  // Não inserir mensagem manualmente - deixar test-send-msg fazer tudo
  // O test-send-msg cria a mensagem no banco E dispara o webhook do N8n
  try {
    console.log(`📤 ========== DISPARANDO WEBHOOK N8N PARA MENSAGEM INICIAL ==========`);
    console.log(`📤 Conversa ID: ${conversationId}`);
    console.log(`📤 Workspace ID: ${workspaceId}`);
    console.log(`📤 Conteúdo: ${content.substring(0, 50)}...`);
    
    // Preparar payload seguindo exatamente o formato que test-send-msg espera
    const payload = {
      conversation_id: conversationId,
      content: content,
      message_type: "text",
      sender_type: "system",
      sender_id: null,
      clientMessageId: `webhook_initial_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    
    console.log(`📦 Payload completo:`, JSON.stringify(payload, null, 2));
    
    // Chamar test-send-msg que vai:
    // 1. Criar a mensagem no banco
    // 2. Chamar message-sender
    // 3. Que chama n8n-send-message
    // 4. Que monta o payload correto e envia para o N8n
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const sendMessageUrl = `${supabaseUrl}/functions/v1/test-send-msg`;
    
    console.log(`🌐 URL da edge function: ${sendMessageUrl}`);
    console.log(`⏱️ Iniciando requisição HTTP...`);
    
    const sendResponse = await fetch(sendMessageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    
    console.log(`✅ Resposta recebida - Status: ${sendResponse.status} ${sendResponse.statusText}`);
    
    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error(`❌ Erro ao disparar webhook N8n:`, errorText);
      console.error(`❌ Status: ${sendResponse.status}`);
      // Não falhar a criação da conversa se o envio falhar
    } else {
      const responseData = await sendResponse.json().catch(() => ({}));
      console.log(`✅ Webhook N8n disparado com sucesso`);
      console.log(`✅ Resposta:`, JSON.stringify(responseData, null, 2));
    }
  } catch (error) {
    console.error(`❌ Erro ao disparar webhook N8n (não crítico):`, error);
    console.error(`❌ Stack trace:`, error instanceof Error ? error.stack : 'N/A');
    // Não falhar a criação da conversa se o envio falhar
  }
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

// Função para verificar se a coluna precisa de conversation_id
// (baseado nas automações que têm ações que requerem conversation)
async function checkIfColumnNeedsConversation(
  supabase: any,
  columnId: string
): Promise<boolean> {
  try {
    console.log(`🔍 [checkIfColumnNeedsConversation] Verificando se coluna ${columnId} precisa de conversation_id...`);
    
    // Buscar automações da coluna
    const { data: automations, error: automationsError } = await (supabase as any)
      .rpc('get_column_automations', { p_column_id: columnId });

    if (automationsError) {
      console.error(`❌ [checkIfColumnNeedsConversation] Erro ao buscar automações:`, automationsError);
      return false;
    }

    if (!automations || automations.length === 0) {
      console.log(`ℹ️ [checkIfColumnNeedsConversation] Nenhuma automação encontrada na coluna ${columnId}`);
      return false;
    }

    console.log(`📋 [checkIfColumnNeedsConversation] ${automations.length} automação(ões) encontrada(s) na coluna`);
    console.log(`📋 [checkIfColumnNeedsConversation] Automações:`, automations.map((a: any) => ({ id: a.id, name: a.name, is_active: a.is_active })));

    // Verificar cada automação ativa
    for (const automation of automations) {
      console.log(`🔍 [checkIfColumnNeedsConversation] Verificando automação: "${automation.name}" (ID: ${automation.id}, Ativa: ${automation.is_active})`);
      
      if (!automation.is_active) {
        console.log(`⏭️ [checkIfColumnNeedsConversation] Automação "${automation.name}" está inativa, pulando`);
        continue;
      }

      // Buscar detalhes da automação
      const { data: automationDetails, error: detailsError } = await (supabase as any)
        .rpc('get_automation_details', { p_automation_id: automation.id });

      if (detailsError) {
        console.error(`❌ [checkIfColumnNeedsConversation] Erro ao buscar detalhes da automação ${automation.id}:`, detailsError);
        continue;
      }

      if (!automationDetails) {
        console.warn(`⚠️ [checkIfColumnNeedsConversation] Detalhes da automação ${automation.id} não encontrados`);
        continue;
      }

      let parsedDetails = automationDetails;
      if (typeof automationDetails === 'string') {
        try {
          parsedDetails = JSON.parse(automationDetails);
          console.log(`✅ [checkIfColumnNeedsConversation] Detalhes parseados com sucesso`);
        } catch (parseError) {
          console.error(`❌ [checkIfColumnNeedsConversation] Erro ao parsear detalhes:`, parseError);
          continue;
        }
      }

      const triggers = parsedDetails.triggers || [];
      const actions = parsedDetails.actions || [];

      console.log(`📋 [checkIfColumnNeedsConversation] Automação "${automation.name}" tem ${triggers.length} trigger(s) e ${actions.length} ação(ões)`);
      console.log(`📋 [checkIfColumnNeedsConversation] Triggers:`, triggers.map((t: any) => t.trigger_type || t?.trigger_type));
      console.log(`📋 [checkIfColumnNeedsConversation] Actions:`, actions.map((a: any) => a.action_type));

      // Verificar se tem trigger enter_column
      const hasEnterColumnTrigger = triggers.some((t: any) => 
        (t.trigger_type || t?.trigger_type) === 'enter_column'
      );

      if (!hasEnterColumnTrigger) {
        console.log(`⏭️ [checkIfColumnNeedsConversation] Automação "${automation.name}" não tem trigger enter_column, pulando`);
        continue;
      }

      console.log(`✅ [checkIfColumnNeedsConversation] Automação "${automation.name}" tem trigger enter_column`);

      // Verificar se tem ações que precisam de conversation_id
      const actionsNeedingConversation = actions.filter((a: any) => 
        ['send_message', 'send_funnel'].includes(a.action_type)
      );

      console.log(`📋 [checkIfColumnNeedsConversation] Ações que precisam de conversation_id: ${actionsNeedingConversation.length}`);
      if (actionsNeedingConversation.length > 0) {
        console.log(`📋 [checkIfColumnNeedsConversation] Ações:`, actionsNeedingConversation.map((a: any) => a.action_type));
      }

      if (actionsNeedingConversation.length > 0) {
        console.log(`✅ [checkIfColumnNeedsConversation] Coluna ${columnId} precisa de conversation_id (automação "${automation.name}" tem ações que requerem conversa)`);
        return true;
      }
    }

    console.log(`ℹ️ [checkIfColumnNeedsConversation] Coluna ${columnId} não precisa de conversation_id`);
    return false;
  } catch (error) {
    console.error(`❌ [checkIfColumnNeedsConversation] Erro ao verificar se coluna precisa de conversation_id:`, error);
    console.error(`❌ [checkIfColumnNeedsConversation] Stack:`, error instanceof Error ? error.stack : 'N/A');
    // Em caso de erro, assumir que não precisa (para não bloquear criação)
    return false;
  }
}

// Função para criar card
async function createCard(
  supabase: any,
  cardData: CardData,
  contactId: string,
  conversationId?: string | null
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

  // Adicionar conversation_id se fornecido
  if (conversationId) {
    insertData.conversation_id = conversationId;
    console.log(`✅ [createCard] Card será criado com conversation_id: ${conversationId}`);
  } else {
    console.log(`⚠️ [createCard] Card será criado SEM conversation_id (conversationId = ${conversationId})`);
  }

  if (cardData.responsible_user_id) {
    insertData.responsible_user_id = cardData.responsible_user_id;
  }

  console.log(`📝 [createCard] Inserindo card com dados:`, JSON.stringify({
    pipeline_id: insertData.pipeline_id,
    column_id: insertData.column_id,
    contact_id: insertData.contact_id,
    conversation_id: insertData.conversation_id || null,
    description: insertData.description
  }, null, 2));

  const { data: newCard, error } = await supabase
    .from("pipeline_cards")
    .insert(insertData)
    .select("id, conversation_id")
    .single();

  if (error || !newCard) {
    console.error(`❌ [createCard] Erro ao inserir card:`, error);
    throw new Error(`Erro ao criar card: ${error?.message || "Erro desconhecido"}`);
  }

  console.log(`✅ [createCard] Novo card criado: ${newCard.id}`);
  console.log(`✅ [createCard] Card criado com conversation_id: ${newCard.conversation_id || 'null'}`);
  
  if (!newCard.conversation_id && conversationId) {
    console.error(`❌ [createCard] ATENÇÃO: conversationId foi passado (${conversationId}) mas o card foi criado sem conversation_id!`);
  }
  
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
    console.log(`\n🤖 ========== ACIONANDO AUTOMAÇÕES DE COLUNA ==========`);
    console.log(`🤖 Card ID: ${cardId}`);
    console.log(`🤖 Column ID: ${columnId}`);
    console.log(`🤖 Timestamp: ${new Date().toISOString()}`);

    // Buscar dados completos do card (com retry para garantir disponibilidade)
    console.log(`📋 Buscando dados completos do card...`);
    let card = null;
    let cardError = null;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const { data, error } = await supabaseClient
        .from('pipeline_cards')
        .select(`
          *,
          conversation:conversations(id, contact_id, connection_id, workspace_id),
          contact:contacts(id, phone, name),
          pipelines:pipelines!inner(id, workspace_id, name)
        `)
        .eq('id', cardId)
        .single();
      
      if (!error && data) {
        card = data;
        cardError = null;
        console.log(`✅ Card encontrado na tentativa ${attempt}`);
        break;
      } else {
        cardError = error;
        if (attempt < maxRetries) {
          console.warn(`⚠️ Tentativa ${attempt} falhou, aguardando antes de tentar novamente...`);
          await new Promise(resolve => setTimeout(resolve, 300 * attempt)); // Backoff exponencial
        }
      }
    }

    if (cardError || !card) {
      console.error(`❌ Erro ao buscar card após ${maxRetries} tentativas:`, cardError);
      console.error(`❌ Card ID fornecido: ${cardId}`);
      return;
    }

    console.log(`✅ Card encontrado:`, {
      id: card.id,
      contact_id: card.contact_id,
      conversation_id: card.conversation_id || card.conversation?.id,
      pipeline_id: card.pipeline_id,
      column_id: card.column_id,
      has_conversation: !!(card.conversation_id || card.conversation?.id),
      has_contact: !!card.contact_id
    });

    // Validar se card tem conversation_id quando necessário para ações
    const hasConversationId = !!(card.conversation_id || card.conversation?.id);
    if (!hasConversationId) {
      console.warn(`⚠️ Card não tem conversation_id - algumas ações podem não funcionar`);
    }

    // Buscar automações da coluna com trigger enter_column
    console.log(`🔍 Buscando automações da coluna ${columnId}...`);
    const { data: automations, error: automationsError } = await (supabaseClient as any)
      .rpc('get_column_automations', { p_column_id: columnId });

    if (automationsError) {
      console.error(`❌ Erro ao buscar automações via RPC:`, automationsError);
      console.error(`❌ Erro completo:`, JSON.stringify(automationsError, null, 2));
      return;
    }

    if (!automations || automations.length === 0) {
      console.log(`ℹ️ Nenhuma automação configurada na coluna ${columnId}`);
      return;
    }

    console.log(`✅ ${automations.length} automação(ões) encontrada(s) na coluna`);
    console.log(`📋 IDs das automações:`, automations.map((a: any) => ({ id: a.id, name: a.name, is_active: a.is_active })));

    // Processar cada automação
    for (const automation of automations) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🔄 Processando automação: "${automation.name}" (ID: ${automation.id})`);
      
      if (!automation.is_active) {
        console.log(`⏭️ Automação "${automation.name}" está inativa, pulando`);
        continue;
      }

      try {
        // Buscar detalhes completos da automação
        console.log(`📋 Buscando detalhes da automação ${automation.id}...`);
        const { data: automationDetails, error: detailsError } = await (supabaseClient as any)
          .rpc('get_automation_details', { p_automation_id: automation.id });

        if (detailsError) {
          console.error(`❌ Erro ao buscar detalhes da automação ${automation.id}:`, detailsError);
          console.error(`❌ Erro completo:`, JSON.stringify(detailsError, null, 2));
          continue;
        }

        if (!automationDetails) {
          console.error(`❌ Detalhes da automação ${automation.id} não encontrados`);
          continue;
        }

        let parsedDetails = automationDetails;
        if (typeof automationDetails === 'string') {
          try {
            parsedDetails = JSON.parse(automationDetails);
            console.log(`✅ Detalhes da automação parseados com sucesso`);
          } catch (parseError) {
            console.error(`❌ Erro ao parsear detalhes da automação:`, parseError);
            continue;
          }
        }

        const triggers = parsedDetails.triggers || [];
        const actions = parsedDetails.actions || [];

        console.log(`📋 Triggers encontrados:`, triggers.length);
        console.log(`📋 Ações encontradas:`, actions.length);

        // Verificar se tem trigger enter_column
        const hasEnterColumnTrigger = triggers.some((t: any) => 
          (t.trigger_type || t?.trigger_type) === 'enter_column'
        );

        if (!hasEnterColumnTrigger) {
          console.log(`⏭️ Automação "${automation.name}" não tem trigger enter_column, pulando`);
          console.log(`📋 Triggers disponíveis:`, triggers.map((t: any) => t.trigger_type || t?.trigger_type));
          continue;
        }

        console.log(`✅ Trigger enter_column encontrado na automação "${automation.name}"`);

        // Verificar se já foi executada (evitar duplicatas)
        console.log(`🔍 Verificando se automação já foi executada recentemente...`);
        const { data: existingExecution, error: executionCheckError } = await supabaseClient
          .from('automation_executions')
          .select('id')
          .eq('card_id', cardId)
          .eq('column_id', columnId)
          .eq('automation_id', automation.id)
          .eq('trigger_type', 'enter_column')
          .gte('executed_at', new Date(Date.now() - 60000).toISOString()) // Último minuto
          .maybeSingle();

        if (executionCheckError) {
          console.warn(`⚠️ Erro ao verificar execução anterior:`, executionCheckError);
        }

        if (existingExecution) {
          console.log(`⏭️ Automação "${automation.name}" já foi executada recentemente (execution ID: ${existingExecution.id}), pulando`);
          continue;
        }

        console.log(`🚀 Executando automação "${automation.name}"`);

        // Validar conversation_id antes de executar ações que precisam dele
        const actionsNeedingConversation = actions.filter((a: any) => 
          ['send_message', 'send_funnel'].includes(a.action_type)
        );

        if (actionsNeedingConversation.length > 0 && !hasConversationId) {
          console.warn(`⚠️ Automação "${automation.name}" tem ${actionsNeedingConversation.length} ação(ões) que precisam de conversation_id, mas o card não tem. Pulando essas ações.`);
          console.warn(`⚠️ Ações que serão puladas:`, actionsNeedingConversation.map((a: any) => a.action_type));
        }

        // Executar ações em ordem
        const sortedActions = [...actions].sort((a: any, b: any) => 
          (a.action_order || 0) - (b.action_order || 0)
        );

        console.log(`📋 Executando ${sortedActions.length} ação(ões) em ordem...`);
        for (let i = 0; i < sortedActions.length; i++) {
          const action = sortedActions[i];
          console.log(`  [${i + 1}/${sortedActions.length}] Executando ação: ${action.action_type}`);
          
          // Verificar se ação precisa de conversation_id
          if (['send_message', 'send_funnel'].includes(action.action_type) && !hasConversationId) {
            console.warn(`  ⚠️ Ação ${action.action_type} precisa de conversation_id, mas card não tem. Pulando.`);
            continue;
          }

          try {
            await executeAutomationAction(action, card, supabaseClient);
            console.log(`  ✅ Ação ${action.action_type} executada com sucesso`);
          } catch (actionError) {
            console.error(`  ❌ Erro ao executar ação ${action.action_type}:`, actionError);
            console.error(`  ❌ Stack trace:`, actionError instanceof Error ? actionError.stack : 'N/A');
            // Continua com próxima ação mesmo se uma falhar
          }
        }

        // Registrar execução
        console.log(`📝 Registrando execução da automação...`);
        await supabaseClient
          .from('automation_executions')
          .insert({
            card_id: cardId,
            column_id: columnId,
            automation_id: automation.id,
            trigger_type: 'enter_column',
            executed_at: new Date().toISOString()
          })
          .then(() => {
            console.log(`✅ Execução registrada com sucesso`);
          })
          .catch(err => {
            // Ignorar erro de duplicata (pode acontecer em race conditions)
            console.warn(`⚠️ Erro ao registrar execução (pode ser duplicata):`, err);
          });

        console.log(`✅ Automação "${automation.name}" executada com sucesso`);
      } catch (automationError) {
        console.error(`❌ Erro ao processar automação ${automation.id}:`, automationError);
        console.error(`❌ Stack trace:`, automationError instanceof Error ? automationError.stack : 'N/A');
        // Continua com próxima automação
      }
    }

    console.log(`\n🤖 ========== PROCESSAMENTO DE AUTOMAÇÕES CONCLUÍDO ==========`);
  } catch (error) {
    console.error(`\n❌ ========== ERRO GERAL AO ACIONAR AUTOMAÇÕES ==========`);
    console.error(`❌ Erro:`, error);
    console.error(`❌ Stack trace:`, error instanceof Error ? error.stack : 'N/A');
    console.error(`❌ Card ID: ${cardId}`);
    console.error(`❌ Column ID: ${columnId}`);
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
      
      // Processar tags se fornecidas
      if (payload.contact.tags && payload.contact.tags.length > 0) {
        try {
          await addTagsToContact(supabase, contactId, payload.workspace_id, payload.contact.tags);
        } catch (tagError: any) {
          console.error("Erro ao adicionar tags (não crítico):", tagError);
          // Não falhar a requisição se tags falharem
        }
      }
      
      // Criar conversa se solicitado
      let conversationId = null;
      if (payload.conversation?.create) {
        try {
          conversationId = await createConversation(
            supabase,
            contactId,
            payload.workspace_id,
            payload.conversation
          );
        } catch (convError: any) {
          console.error("Erro ao criar conversa (não crítico):", convError);
          // Não falhar a requisição se conversa falhar
        }
      }
      
      eventType = "external_api_contact";
      responseBody = {
        success: true,
        data: {
          contact_id: contactId,
          ...(conversationId && { conversation_id: conversationId }),
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

      // ✅ CRÍTICO: Verificar se a coluna precisa de conversation_id ANTES de criar o card
      console.log(`🔍 [create_card] Verificando se coluna precisa de conversation_id...`);
      const needsConversation = await checkIfColumnNeedsConversation(
        supabase,
        payload.card.column_id
      );
      console.log(`🔍 [create_card] Resultado: needsConversation = ${needsConversation}`);

      let conversationId: string | null = null;
      
      // Se a coluna precisa de conversa OU se foi solicitado no payload, criar conversa
      if (needsConversation || payload.conversation?.create) {
        console.log(`📞 [create_card] Conversa é necessária. Iniciando criação...`);
        try {
          // Se já foi solicitado no payload, usar a função createConversation
          if (payload.conversation?.create) {
            console.log(`📞 [create_card] Usando createConversation do payload...`);
            conversationId = await createConversation(
              supabase,
              payload.card.contact_id!,
              payload.workspace_id,
              payload.conversation
            );
            console.log(`📞 [create_card] createConversation retornou: ${conversationId}`);
          } else {
            // Se não foi solicitado mas a coluna precisa, criar automaticamente
            console.log(`📞 [create_card] Criando conversa automaticamente (coluna precisa)...`);
            const { data: contact, error: contactError } = await supabase
              .from("contacts")
              .select("id, phone")
              .eq("id", payload.card.contact_id!)
              .maybeSingle();

            if (contactError) {
              console.error(`❌ [create_card] Erro ao buscar contato:`, contactError);
            }

            if (contact?.phone) {
              console.log(`📞 [create_card] Contato tem telefone: ${contact.phone}`);
              // Verificar se já existe conversa aberta
              const { data: existingConversation, error: existingError } = await supabase
                .from("conversations")
                .select("id")
                .eq("contact_id", payload.card.contact_id!)
                .eq("workspace_id", payload.workspace_id)
                .eq("status", "open")
                .maybeSingle();

              if (existingError) {
                console.error(`❌ [create_card] Erro ao buscar conversa existente:`, existingError);
              }

              if (existingConversation) {
                conversationId = existingConversation.id;
                console.log(`✅ [create_card] Conversa existente encontrada: ${conversationId}`);
              } else {
                console.log(`📞 [create_card] Conversa não existe. Criando nova...`);
                // Criar conversa automaticamente
                const { data: defaultConnection, error: connError } = await supabase
                  .from("connections")
                  .select("id, instance_name")
                  .eq("workspace_id", payload.workspace_id)
                  .eq("status", "connected")
                  .order("created_at", { ascending: true })
                  .limit(1)
                  .maybeSingle();

                if (connError) {
                  console.error(`❌ [create_card] Erro ao buscar conexão padrão:`, connError);
                }

                const conversationPayload: any = {
                  contact_id: payload.card.contact_id!,
                  workspace_id: payload.workspace_id,
                  status: "open",
                  canal: "whatsapp",
                  agente_ativo: false,
                  connection_id: defaultConnection?.id || null,
                  evolution_instance: defaultConnection?.instance_name || null,
                };

                console.log(`📞 [create_card] Payload da conversa:`, JSON.stringify(conversationPayload, null, 2));

                const { data: newConversation, error: convError } = await supabase
                  .from("conversations")
                  .insert(conversationPayload)
                  .select("id")
                  .single();

                if (convError) {
                  console.error(`❌ [create_card] ERRO CRÍTICO ao criar conversa:`, convError);
                  console.error(`❌ [create_card] Erro completo:`, JSON.stringify(convError, null, 2));
                }

                if (!convError && newConversation) {
                  conversationId = newConversation.id;
                  console.log(`✅ [create_card] Conversa criada automaticamente (necessária para automações): ${conversationId}`);
                } else {
                  console.error(`❌ [create_card] Falha ao criar conversa. newConversation:`, newConversation);
                }
              }
            } else {
              console.warn(`⚠️ [create_card] Contato não tem telefone, não é possível criar conversa`);
              console.warn(`⚠️ [create_card] Contact data:`, contact);
            }
          }
        } catch (convError: any) {
          console.error("❌ [create_card] Exception ao criar conversa:", convError);
          console.error("❌ [create_card] Stack:", convError?.stack);
        }
      } else {
        console.log(`ℹ️ [create_card] Coluna não precisa de conversation_id e não foi solicitado no payload`);
      }

      // ✅ CRÍTICO: Se a coluna precisa de conversa mas não conseguimos criar, BLOQUEAR criação do card
      if (needsConversation && !conversationId) {
        console.error(`❌ [create_card] ERRO CRÍTICO: Coluna precisa de conversation_id mas não foi possível criar conversa!`);
        console.error(`❌ [create_card] Bloqueando criação do card para evitar automações quebradas.`);
        responseStatus = 500;
        responseBody = {
          success: false,
          error: "CONVERSATION_REQUIRED",
          message: "A coluna possui automações que requerem uma conversa, mas não foi possível criar a conversa. Verifique se o contato possui telefone e se há uma conexão WhatsApp ativa.",
        };
        return new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Criar card (com conversation_id se disponível)
      console.log(`📝 [create_card] Criando card com conversationId: ${conversationId || 'null'}`);
      cardId = await createCard(supabase, payload.card, payload.card.contact_id!, conversationId);
      console.log(`✅ [create_card] Card criado com sucesso: ${cardId}`);
      
      // ✅ Acionar automações de coluna em background (não bloqueia resposta)
      // Pequena espera para garantir que o card está disponível no banco
      setTimeout(() => {
        console.log(`🤖 Iniciando processamento de automações em background para card ${cardId}`);
        triggerColumnAutomations(supabase, cardId, payload.card.column_id)
          .then(() => {
            console.log(`✅ Processamento de automações concluído para card ${cardId}`);
          })
          .catch(err => {
            console.error(`❌ ========== ERRO CRÍTICO AO ACIONAR AUTOMAÇÕES ==========`);
            console.error(`❌ Card ID: ${cardId}`);
            console.error(`❌ Column ID: ${payload.card.column_id}`);
            console.error(`❌ Erro:`, err);
            console.error(`❌ Stack trace:`, err instanceof Error ? err.stack : 'N/A');
            console.error(`❌ ==========================================================`);
          });
      }, 500); // Espera 500ms para garantir que o card está disponível
      
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

      // Processar tags se fornecidas
      if (payload.contact.tags && payload.contact.tags.length > 0) {
        try {
          await addTagsToContact(supabase, contactId, payload.workspace_id, payload.contact.tags);
        } catch (tagError: any) {
          console.error("Erro ao adicionar tags (não crítico):", tagError);
          // Não falhar a requisição se tags falharem
        }
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

      // ✅ CRÍTICO: Verificar se a coluna precisa de conversation_id ANTES de criar o card
      console.log(`🔍 [create_contact_with_card] Verificando se coluna precisa de conversation_id...`);
      const needsConversation = await checkIfColumnNeedsConversation(
        supabase,
        payload.card.column_id
      );
      console.log(`🔍 [create_contact_with_card] Resultado: needsConversation = ${needsConversation}`);

      let conversationId: string | null = null;
      
      // Se a coluna precisa de conversa OU se foi solicitado no payload, criar conversa
      if (needsConversation || payload.conversation?.create) {
        console.log(`📞 [create_contact_with_card] Conversa é necessária. Iniciando criação...`);
        try {
          // Se já foi solicitado no payload, usar a função createConversation
          if (payload.conversation?.create) {
            console.log(`📞 [create_contact_with_card] Usando createConversation do payload...`);
            conversationId = await createConversation(
              supabase,
              contactId,
              payload.workspace_id,
              payload.conversation
            );
            console.log(`📞 [create_contact_with_card] createConversation retornou: ${conversationId}`);
          } else {
            // Se não foi solicitado mas a coluna precisa, criar automaticamente
            console.log(`📞 [create_contact_with_card] Criando conversa automaticamente (coluna precisa)...`);
            const { data: contact, error: contactError } = await supabase
              .from("contacts")
              .select("id, phone")
              .eq("id", contactId)
              .maybeSingle();

            if (contactError) {
              console.error(`❌ [create_contact_with_card] Erro ao buscar contato:`, contactError);
            }

            if (contact?.phone) {
              console.log(`📞 [create_contact_with_card] Contato tem telefone: ${contact.phone}`);
              // Verificar se já existe conversa aberta
              const { data: existingConversation, error: existingError } = await supabase
                .from("conversations")
                .select("id")
                .eq("contact_id", contactId)
                .eq("workspace_id", payload.workspace_id)
                .eq("status", "open")
                .maybeSingle();

              if (existingError) {
                console.error(`❌ [create_contact_with_card] Erro ao buscar conversa existente:`, existingError);
              }

              if (existingConversation) {
                conversationId = existingConversation.id;
                console.log(`✅ [create_contact_with_card] Conversa existente encontrada: ${conversationId}`);
              } else {
                console.log(`📞 [create_contact_with_card] Conversa não existe. Criando nova...`);
                // Criar conversa automaticamente
                const { data: defaultConnection, error: connError } = await supabase
                  .from("connections")
                  .select("id, instance_name")
                  .eq("workspace_id", payload.workspace_id)
                  .eq("status", "connected")
                  .order("created_at", { ascending: true })
                  .limit(1)
                  .maybeSingle();

                if (connError) {
                  console.error(`❌ [create_contact_with_card] Erro ao buscar conexão padrão:`, connError);
                }

                const conversationPayload: any = {
                  contact_id: contactId,
                  workspace_id: payload.workspace_id,
                  status: "open",
                  canal: "whatsapp",
                  agente_ativo: false,
                  connection_id: defaultConnection?.id || null,
                  evolution_instance: defaultConnection?.instance_name || null,
                };

                console.log(`📞 [create_contact_with_card] Payload da conversa:`, JSON.stringify(conversationPayload, null, 2));

                const { data: newConversation, error: convError } = await supabase
                  .from("conversations")
                  .insert(conversationPayload)
                  .select("id")
                  .single();

                if (convError) {
                  console.error(`❌ [create_contact_with_card] ERRO CRÍTICO ao criar conversa:`, convError);
                  console.error(`❌ [create_contact_with_card] Erro completo:`, JSON.stringify(convError, null, 2));
                }

                if (!convError && newConversation) {
                  conversationId = newConversation.id;
                  console.log(`✅ [create_contact_with_card] Conversa criada automaticamente (necessária para automações): ${conversationId}`);
                } else {
                  console.error(`❌ [create_contact_with_card] Falha ao criar conversa. newConversation:`, newConversation);
                }
              }
            } else {
              console.warn(`⚠️ [create_contact_with_card] Contato não tem telefone, não é possível criar conversa`);
              console.warn(`⚠️ [create_contact_with_card] Contact data:`, contact);
            }
          }
        } catch (convError: any) {
          console.error("❌ [create_contact_with_card] Exception ao criar conversa:", convError);
          console.error("❌ [create_contact_with_card] Stack:", convError?.stack);
        }
      } else {
        console.log(`ℹ️ [create_contact_with_card] Coluna não precisa de conversation_id e não foi solicitado no payload`);
      }

      // ✅ CRÍTICO: Se a coluna precisa de conversa mas não conseguimos criar, BLOQUEAR criação do card
      if (needsConversation && !conversationId) {
        console.error(`❌ [create_contact_with_card] ERRO CRÍTICO: Coluna precisa de conversation_id mas não foi possível criar conversa!`);
        console.error(`❌ [create_contact_with_card] Bloqueando criação do card para evitar automações quebradas.`);
        responseStatus = 500;
        responseBody = {
          success: false,
          error: "CONVERSATION_REQUIRED",
          message: "A coluna possui automações que requerem uma conversa, mas não foi possível criar a conversa. Verifique se o contato possui telefone e se há uma conexão WhatsApp ativa.",
        };
        return new Response(JSON.stringify(responseBody), {
          status: responseStatus,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Criar card (com conversation_id se disponível)
      console.log(`📝 [create_contact_with_card] Criando card com conversationId: ${conversationId || 'null'}`);
      cardId = await createCard(supabase, payload.card, contactId, conversationId);
      console.log(`✅ [create_contact_with_card] Card criado com sucesso: ${cardId}`);
      
      // ✅ Acionar automações de coluna em background (não bloqueia resposta)
      // Pequena espera para garantir que o card está disponível no banco
      setTimeout(() => {
        console.log(`🤖 Iniciando processamento de automações em background para card ${cardId}`);
        triggerColumnAutomations(supabase, cardId, payload.card.column_id)
          .then(() => {
            console.log(`✅ Processamento de automações concluído para card ${cardId}`);
          })
          .catch(err => {
            console.error(`❌ ========== ERRO CRÍTICO AO ACIONAR AUTOMAÇÕES ==========`);
            console.error(`❌ Card ID: ${cardId}`);
            console.error(`❌ Column ID: ${payload.card.column_id}`);
            console.error(`❌ Erro:`, err);
            console.error(`❌ Stack trace:`, err instanceof Error ? err.stack : 'N/A');
            console.error(`❌ ==========================================================`);
          });
      }, 500); // Espera 500ms para garantir que o card está disponível
      
      eventType = "external_api_both";
      responseBody = {
        success: true,
        data: {
          contact_id: contactId,
          card_id: cardId,
          ...(conversationId && { conversation_id: conversationId }),
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

