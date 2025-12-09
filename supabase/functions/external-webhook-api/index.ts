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

  // Determinar title (obrigatório)
  const title = cardData.title || cardData.description || "Novo Card";

  const insertData: any = {
    pipeline_id: cardData.pipeline_id,
    column_id: cardData.column_id,
    contact_id: contactId,
    title: title,
    description: cardData.description || null,
    value: cardData.value || 0,
    status: cardData.status || "aberto",
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

