import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Função para normalizar status do Z-API para o formato padrão
function normalizeZapiStatus(zapiStatus: string): string {
  const statusMap: Record<string, string> = {
    'SENT': 'sent',
    'DELIVERED': 'delivered', 
    'READ': 'read',
    'FAILED': 'failed',
    'PENDING': 'sending'
  };
  
  return statusMap[zapiStatus] || zapiStatus.toLowerCase();
}

// Função para extrair informações de mídia do payload Z-API
function extractMediaInfo(data: any): {
  downloadUrl?: string;
  mimeType?: string;
  fileName?: string;
  mediaType?: string;
} | null {
  if (data.image) {
    return {
      downloadUrl: data.image.downloadUrl || data.image.imageUrl,
      mimeType: data.image.mimeType || 'image/jpeg',
      fileName: data.image.fileName || `image-${Date.now()}.jpg`,
      mediaType: 'image'
    };
  }
  if (data.video) {
    return {
      downloadUrl: data.video.downloadUrl || data.video.videoUrl,
      mimeType: data.video.mimeType || 'video/mp4',
      fileName: data.video.fileName || `video-${Date.now()}.mp4`,
      mediaType: 'video'
    };
  }
  if (data.audio) {
    return {
      downloadUrl: data.audio.downloadUrl || data.audio.audioUrl,
      mimeType: data.audio.mimeType || 'audio/ogg',
      fileName: data.audio.fileName || `audio-${Date.now()}.ogg`,
      mediaType: 'audio'
    };
  }
  if (data.document) {
    return {
      downloadUrl: data.document.downloadUrl || data.document.documentUrl,
      mimeType: data.document.mimeType || 'application/octet-stream',
      fileName: data.document.fileName || `document-${Date.now()}`,
      mediaType: 'document'
    };
  }
  return null;
}

// Função para baixar mídia com retry
async function downloadMedia(url: string, maxRetries = 3): Promise<ArrayBuffer> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000) // 30s timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.arrayBuffer();
    } catch (error) {
      console.error(`❌ Download attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error('Failed after retries');
}

function sanitizePhoneNumber(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

function extractPhoneFromZapiId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw);
  // Common WhatsApp identifiers that carry the real phone number
  if (s.includes('@c.us') || s.includes('@s.whatsapp.net')) {
    return sanitizePhoneNumber(s);
  }
  // Some Z-API payloads may already be digits
  if (/^\d{8,15}$/.test(s)) return s;
  return null;
}

serve(async (req) => {
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log(`🔥 [${id}] Z-API WEBHOOK - Method: ${req.method}`);

  try {
    const data = await req.json();
    console.log(`📦 [${id}] Data:`, JSON.stringify(data, null, 2));
    
    // 🔥🔥🔥 LOG DE DEBUG: Detectar callbacks de status
    if (data.event === 'MessageStatusCallback' || data.status) {
      console.log(`🔥🔥🔥 [${id}] CALLBACK DE STATUS RECEBIDO:`, {
        event: data.event,
        status: data.status,
        messageId: data.messageId,
        instanceName: data.instanceName || data.instance,
        timestamp: new Date().toISOString()
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Z-API pode enviar instanceName OU instanceId
    const instanceName = data.instanceName || data.instance || data.instanceId;
    
    if (!instanceName) {
      console.error(`❌ [${id}] No instance identifier found in payload`);
      return new Response(
        JSON.stringify({ success: false, error: "No instance name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📍 [${id}] Looking for instance: ${instanceName}`);

    // Buscar conexão pelo instance_name OU instance_id (para Z-API)
    const { data: conn, error: connError } = await supabase
      .from("connections")
      .select("*, provider:whatsapp_providers!connections_provider_id_fkey(n8n_webhook_url, zapi_client_token)")
      .or(`instance_name.eq.${instanceName},metadata->>instanceId.eq.${instanceName}`)
      .maybeSingle();

    if (connError) {
      console.error(`❌ [${id}] Database error:`, connError);
    }

    if (!conn) {
      console.error(`❌ [${id}] Connection not found for instance: ${instanceName}`);
      return new Response(
        JSON.stringify({ success: false, error: "Connection not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ [${id}] Connection: ${conn.id}, Workspace: ${conn.workspace_id}, Instance Name: ${conn.instance_name}`);

    const statusN8nUrl = "https://n8n-n8n.upvzfg.easypanel.host/webhook/status-tezeus";
    const defaultN8nUrl = conn.provider?.n8n_webhook_url;

    // Extrair external_id do messageId do Z-API
    // Para MessageStatusCallback, o ID vem em data.ids[0]
    const externalId = data.messageId || data.id || (data.ids && data.ids[0]) || null;

    // Detectar eventos de status (para roteamento dedicado)
    // Importante: alguns payloads de mensagem podem conter "status" -> NÃO queremos roteá-los como status.
    // Aqui só consideramos status quando for explicitamente callback, ou quando vier ids[0] + status.
    const isStatusCallback =
      data?.type === 'MessageStatusCallback' ||
      data?.event === 'DeliveryCallback' ||
      (Array.isArray(data?.ids) && data.ids.length > 0 && !!data?.status);

    const forwardUrl = isStatusCallback ? statusN8nUrl : defaultN8nUrl;

    if (forwardUrl) {
      console.log(`🚀 [${id}] Forwarding to: ${forwardUrl}`, { isStatusCallback });
      
      // Verificar se há mídia no payload
      const mediaInfo = extractMediaInfo(data);
      let base64: string | undefined;
      
      if (mediaInfo?.downloadUrl) {
        try {
          console.log(`📥 [${id}] Downloading media from: ${mediaInfo.downloadUrl}`);
          const mediaBuffer = await downloadMedia(mediaInfo.downloadUrl);
          
          // Converter para base64
          const uint8Array = new Uint8Array(mediaBuffer);
          const binaryString = Array.from(uint8Array)
            .map(byte => String.fromCharCode(byte))
            .join('');
          base64 = btoa(binaryString);
          
          console.log(`✅ [${id}] Media downloaded and converted to base64 (${mediaInfo.mediaType}, ${Math.round(base64.length / 1024)}KB)`);
        } catch (error) {
          console.error(`❌ [${id}] Failed to download media:`, error);
          // Continue sem base64 se falhar
        }
      }
      
      // Extrair instance_token do metadata
      const instanceToken = conn.metadata?.token || 
                           conn.metadata?.instanceToken || 
                           conn.metadata?.instance_token;
      
      // Extrair client_token do provider
      const clientToken = conn.provider?.zapi_client_token;
      
      // Normalizar status se presente no payload (para callbacks de status)
      let normalizedStatus = data.status;
      if (data.status && typeof data.status === 'string') {
        normalizedStatus = normalizeZapiStatus(data.status);
        console.log(`🔄 [${id}] Status normalizado: ${data.status} → ${normalizedStatus}`);
      }
      
      // Resolver identificador do chat/contato
      const chatLid: string | null =
        (typeof data.chatLid === 'string' && data.chatLid) ||
        (typeof data.phone === 'string' && data.phone.endsWith('@lid') ? data.phone : null) ||
        null;

      const rawPhoneId: string | null =
        (typeof data.phone === 'string' && data.phone) ||
        null;

      // Se vier número real, extraímos. Se vier @lid, tentamos resolver via mapeamento persistido
      let resolvedContactPhone: string | null = extractPhoneFromZapiId(rawPhoneId);
      let resolvedContactId: string | null = null;

      try {
        // Caso 1: temos telefone real e também um LID -> salvar mapeamento para uso futuro
        if (resolvedContactPhone && chatLid && conn.workspace_id) {
          const { data: contactRow } = await supabase
            .from('contacts')
            .select('id, whatsapp_lid')
            .eq('workspace_id', conn.workspace_id)
            .eq('phone', resolvedContactPhone)
            .maybeSingle();

          if (contactRow?.id) {
            resolvedContactId = contactRow.id;
            if (!contactRow.whatsapp_lid || contactRow.whatsapp_lid !== chatLid) {
              await supabase
                .from('contacts')
                .update({ whatsapp_lid: chatLid, updated_at: new Date().toISOString() })
                .eq('id', contactRow.id);
            }
          }
        }

        // Caso 2: veio só @lid -> resolver contato via whatsapp_lid
        if (!resolvedContactPhone && chatLid && conn.workspace_id) {
          const { data: byLid } = await supabase
            .from('contacts')
            .select('id, phone')
            .eq('workspace_id', conn.workspace_id)
            .eq('whatsapp_lid', chatLid)
            .maybeSingle();

          if (byLid?.phone) {
            resolvedContactPhone = String(byLid.phone);
            resolvedContactId = byLid.id || null;
          }
        }
      } catch (e) {
        console.warn(`⚠️ [${id}] Failed to resolve/save LID mapping:`, e);
      }

      // ✅ ATUALIZAR STATUS DA MENSAGEM NO BANCO DE DADOS
      if (data.type === 'MessageStatusCallback' && data.ids && data.ids.length > 0) {
        const messageExternalId = data.ids[0]; // ID da mensagem no Z-API
        console.log(`🔥🔥🔥 [${id}] CALLBACK DE STATUS RECEBIDO:`, {
          type: data.type,
          messageExternalId,
          rawStatus: data.status,
          normalizedStatus,
          workspaceId: conn.workspace_id,
          timestamp: new Date().toISOString()
        });
        
        const updateData: any = {
          status: normalizedStatus,
          updated_at: new Date().toISOString()
        };
        
        // Adicionar timestamps específicos
        if (normalizedStatus === 'delivered') {
          updateData.delivered_at = new Date().toISOString();
        } else if (normalizedStatus === 'read') {
          updateData.read_at = new Date().toISOString();
        }
        
        console.log(`📝 [${id}] Executando UPDATE no banco:`, {
          messageExternalId,
          updateData,
          workspaceId: conn.workspace_id
        });
        
        const { data: updatedMessage, error: updateError } = await supabase
          .from('messages')
          .update(updateData)
          .eq('external_id', messageExternalId)
          .eq('workspace_id', conn.workspace_id)
          .select()
          .maybeSingle();
          
        if (updateError) {
          console.error(`❌ [${id}] Erro ao atualizar status da mensagem ${messageExternalId}:`, updateError);
        } else if (updatedMessage) {
          console.log(`✅✅✅ [${id}] STATUS ATUALIZADO NO BANCO COM SUCESSO:`, {
            messageId: updatedMessage.id,
            external_id: messageExternalId,
            oldStatus: 'unknown',
            newStatus: normalizedStatus,
            conversation_id: updatedMessage.conversation_id,
            updatedMessage
          });
        } else {
          console.warn(`⚠️⚠️⚠️ [${id}] MENSAGEM NÃO ENCONTRADA NO BANCO:`, {
            messageExternalId,
            workspaceId: conn.workspace_id,
            tentouBuscarCom: {
              external_id: messageExternalId,
              workspace_id: conn.workspace_id
            }
          });
        }
      }
      
      // Montar payload para n8n
      const n8nPayload: any = {
        event_type: data.event || data.type || 'UNKNOWN',
        provider: 'zapi',
        instance_name: conn.instance_name,
        instance_token: instanceToken, // ✅ Token da instância Z-API
        client_token: clientToken, // ✅ Client token da instância Z-API
        workspace_id: conn.workspace_id,
        connection_id: conn.id,
        contact_phone: resolvedContactPhone,
        contact_id: resolvedContactId,
        chat_lid: chatLid,
        external_id: externalId,
        status: normalizedStatus, // ✅ Status normalizado
        timestamp: new Date().toISOString(),
        webhook_data: {
          ...data,
          status: normalizedStatus // ✅ Sobrescrever status no webhook_data também
        }
      };

      // ============================================================
      // ORIGIN FLAGS (outside-system vs system vs ai_agent)
      // ============================================================
      let originDebug: any = {
        match_strategy: null,
        matched_message_id: null,
        external_id: externalId,
      };

      let message_origin: 'external_outside_system' | 'system' | 'ai_agent' | 'unknown' = 'unknown';
      let is_ai_agent = false;
      let is_system_message = false;

      if (externalId && conn.workspace_id) {
        try {
          // Strategy 1 (preferred): provider id stored in messages.evolution_key_id (used for providerMsgId)
          const { data: byProviderId } = await supabase
            .from('messages')
            .select('id, sender_type, origem_resposta')
            .eq('workspace_id', conn.workspace_id)
            .eq('evolution_key_id', externalId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          let matched = byProviderId as any;
          if (matched?.id) {
            originDebug.match_strategy = 'evolution_key_id';
            originDebug.matched_message_id = matched.id;
          } else {
            // Strategy 2: sometimes we store request id / clientMessageId in external_id
            const { data: byExternalId } = await supabase
              .from('messages')
              .select('id, sender_type, origem_resposta')
              .eq('workspace_id', conn.workspace_id)
              .eq('external_id', externalId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (byExternalId?.id) {
              matched = byExternalId as any;
              originDebug.match_strategy = 'external_id';
              originDebug.matched_message_id = matched.id;
            } else {
              // Strategy 3: metadata.provider_msg_id
              const { data: byMetadataProviderId } = await supabase
                .from('messages')
                .select('id, sender_type, origem_resposta')
                .eq('workspace_id', conn.workspace_id)
                // PostgREST JSON path filter
                // @ts-ignore
                .eq('metadata->>provider_msg_id', externalId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (byMetadataProviderId?.id) {
                matched = byMetadataProviderId as any;
                originDebug.match_strategy = 'metadata.provider_msg_id';
                originDebug.matched_message_id = matched.id;
              } else {
                matched = null;
                originDebug.match_strategy = 'none';
              }
            }
          }

          if (matched?.id) {
            is_ai_agent = String(matched.origem_resposta || '').toLowerCase() === 'automatica';
            is_system_message = !is_ai_agent;
            message_origin = is_ai_agent ? 'ai_agent' : 'system';
          } else {
            // Not found in DB => message likely came from outside the system (manual WhatsApp send or inbound from contact)
            message_origin = 'external_outside_system';
            is_ai_agent = false;
            is_system_message = false;
          }
        } catch (e) {
          console.warn(`⚠️ [${id}] Failed to resolve message_origin via DB:`, e);
          originDebug.match_strategy = 'error';
          message_origin = 'unknown';
        }
      } else {
        // No externalId => can't correlate
        message_origin = 'unknown';
        originDebug.match_strategy = 'missing_external_id';
      }

      n8nPayload.message_origin = message_origin;
      n8nPayload.is_ai_agent = is_ai_agent;
      n8nPayload.is_system_message = is_system_message;
      n8nPayload.origin_debug = originDebug;

      // ============================================================
      // FILTRO: não disparar webhook de status para mensagens do sistema
      // Caso específico: DeliveryCallback + is_system_message = true
      // ============================================================
      const isDeliveryCallback =
        data?.type === 'DeliveryCallback' ||
        data?.event === 'DeliveryCallback' ||
        n8nPayload.event_type === 'DeliveryCallback';

      if (is_system_message && isDeliveryCallback) {
        console.log(`🛑 [${id}] Ignorando DeliveryCallback do sistema (sem forward para N8N)`, {
          external_id: externalId,
          connection_id: conn.id,
          workspace_id: conn.workspace_id,
          origin_debug: originDebug,
        });

        return new Response(
          JSON.stringify({ success: true, ignored: true, reason: 'system_delivery_callback', id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ============================================================
      // FILTRO: não disparar webhook para ReceivedCallback vindo da API (mensagem do sistema)
      // Caso específico: ReceivedCallback + fromApi=true + is_system_message=true
      // ============================================================
      const isReceivedCallback =
        data?.type === 'ReceivedCallback' ||
        data?.event === 'ReceivedCallback' ||
        n8nPayload.event_type === 'ReceivedCallback';

      const fromApi =
        data?.fromApi === true ||
        data?.fromApi === 'true' ||
        data?.from_api === true ||
        data?.from_api === 'true';

      if (is_system_message && isReceivedCallback && fromApi) {
        console.log(`🛑 [${id}] Ignorando ReceivedCallback do sistema (fromApi=true) (sem forward para N8N)`, {
          external_id: externalId,
          connection_id: conn.id,
          workspace_id: conn.workspace_id,
          origin_debug: originDebug,
        });

        return new Response(
          JSON.stringify({ success: true, ignored: true, reason: 'system_received_callback_from_api', id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Adicionar dados de mídia se disponível
      if (mediaInfo) {
        n8nPayload.media = {
          base64,
          fileName: mediaInfo.fileName,
          mimeType: mediaInfo.mimeType,
          mediaUrl: mediaInfo.downloadUrl,
          mediaType: mediaInfo.mediaType
        };
      }
      
      try {
        const n8nResponse = await fetch(forwardUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(n8nPayload)
        });

        const status = n8nResponse.status;
        if (!n8nResponse.ok) {
          const text = await n8nResponse.text().catch(() => '');
          console.error(`❌ [${id}] N8N webhook failed: ${status}`, text);
        } else {
          console.log(`✅ [${id}] N8N: ${status}`);
        }
      } catch (e) {
        console.error(`❌ [${id}] N8N error:`, e);
      }
    } else {
      console.warn(`⚠️ [${id}] No N8N webhook URL configured for this provider`);
    }

    return new Response(
      JSON.stringify({ success: true, id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`❌ [${id}] Error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
