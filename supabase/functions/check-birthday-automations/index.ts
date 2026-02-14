import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Seleciona aleatoriamente entre a mensagem principal e variações (se existirem).
 */
function selectMessageVariation(mainMessage: string, variations: string[]): string {
  const validVariations = (variations || []).filter((v: string) => v && v.trim());
  if (validVariations.length === 0) return mainMessage;
  const allMessages = [mainMessage, ...validVariations].filter(Boolean);
  return allMessages[Math.floor(Math.random() * allMessages.length)];
}

/**
 * Substitui variáveis de template pelos dados reais do contato.
 */
function replaceMessageVariables(
  message: string,
  contact?: { name?: string; phone?: string; email?: string } | null
): string {
  if (!message) return message;
  return message
    .replace(/\{\{nome\}\}/gi, contact?.name || '')
    .replace(/\{\{primeiro_nome\}\}/gi, (contact?.name || '').split(' ')[0] || '')
    .replace(/\{\{telefone\}\}/gi, contact?.phone || '')
    .replace(/\{\{email\}\}/gi, contact?.email || '');
}

function getLocalTimeInfo(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const monthNum = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10);
  const dayNum = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
  const yearNum = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);

  return { hours, minutes, monthNum, dayNum, yearNum };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎂 [Birthday Automations] Iniciando verificação...');
    console.log('🎂 [Birthday Automations] Timestamp:', new Date().toISOString());

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const timeZone = 'America/Sao_Paulo';
    const { hours, minutes, monthNum, dayNum, yearNum } = getLocalTimeInfo(now, timeZone);

    console.log(`🎂 [Birthday Automations] Hora atual (${timeZone}): ${hours}:${String(minutes).padStart(2, '0')}, Data: ${dayNum}/${monthNum}/${yearNum}`);

    // 1. Buscar todas as automações de aniversário ativas
    const { data: automations, error: automationsError } = await supabase
      .from('workspace_birthday_automation')
      .select('*')
      .eq('is_enabled', true);

    if (automationsError) {
      console.error('❌ [Birthday Automations] Erro ao buscar automações:', automationsError);
      throw automationsError;
    }

    if (!automations || automations.length === 0) {
      console.log('ℹ️ [Birthday Automations] Nenhuma automação de aniversário ativa');
      return new Response(
        JSON.stringify({ message: 'No active birthday automations', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎂 [Birthday Automations] ${automations.length} automação(ões) ativa(s) encontrada(s)`);

    let totalProcessed = 0;

    for (const automation of automations) {
      try {
        // 2. Verificar se o horário atual corresponde ao send_time configurado
        const sendTimeParts = (automation.send_time || '09:00').split(':');
        const sendHour = parseInt(sendTimeParts[0], 10);
        const sendMinute = parseInt(sendTimeParts[1], 10);

        if (hours !== sendHour || minutes !== sendMinute) {
          continue; // Não é hora de enviar
        }

        console.log(`🎂 [Birthday Automations] Hora de envio atingida para workspace ${automation.workspace_id}`);

        // 3. Buscar contatos aniversariantes do dia neste workspace
        // Usando RPC ou query direta com extract
        const { data: birthdayContacts, error: contactsError } = await supabase
          .from('contacts')
          .select('id, name, phone, email, birth_date')
          .eq('workspace_id', automation.workspace_id)
          .not('birth_date', 'is', null);

        if (contactsError) {
          console.error(`❌ [Birthday Automations] Erro ao buscar contatos:`, contactsError);
          continue;
        }

        // Filtrar aniversariantes do dia (mês e dia coincidem)
        const todayBirthdayContacts = (birthdayContacts || []).filter(contact => {
          if (!contact.birth_date) return false;
          const birthDate = new Date(contact.birth_date + 'T00:00:00');
          return (birthDate.getMonth() + 1) === monthNum && birthDate.getDate() === dayNum;
        });

        if (todayBirthdayContacts.length === 0) {
          console.log(`ℹ️ [Birthday Automations] Nenhum aniversariante hoje no workspace ${automation.workspace_id}`);
          continue;
        }

        console.log(`🎂 [Birthday Automations] ${todayBirthdayContacts.length} aniversariante(s) encontrado(s) no workspace ${automation.workspace_id}`);

        // 4. Para cada aniversariante, verificar se já enviou e enviar mensagem
        for (const contact of todayBirthdayContacts) {
          try {
            // Verificar se já enviou para este contato este ano
            const { data: existingExecution } = await supabase
              .from('birthday_automation_executions')
              .select('id')
              .eq('workspace_id', automation.workspace_id)
              .eq('contact_id', contact.id)
              .eq('year', yearNum)
              .maybeSingle();

            if (existingExecution) {
              console.log(`⏭️ [Birthday Automations] Já enviou para ${contact.name} (${contact.id}) este ano`);
              continue;
            }

            // 5. Selecionar mensagem e substituir variáveis
            const rawMessage = selectMessageVariation(
              automation.message_template,
              automation.message_variations || []
            );
            const messageText = replaceMessageVariables(rawMessage, contact);

            console.log(`📤 [Birthday Automations] Enviando mensagem de aniversário para ${contact.name}`);

            // 6. Buscar conversa ativa do contato neste workspace
            const { data: conversation, error: convError } = await supabase
              .from('conversations')
              .select(`
                id,
                workspace_id,
                connection_id,
                connection:connections!conversations_connection_id_fkey(id, instance_name, status)
              `)
              .eq('workspace_id', automation.workspace_id)
              .eq('contact_id', contact.id)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (convError || !conversation) {
              console.warn(`⚠️ [Birthday Automations] Sem conversa ativa para ${contact.name}, pulando...`);
              continue;
            }

            // Se automação tem connection_id específico, buscar conexão específica
            let connection = Array.isArray(conversation.connection)
              ? conversation.connection[0]
              : conversation.connection;

            if (automation.connection_id) {
              const { data: specificConnection } = await supabase
                .from('connections')
                .select('id, instance_name, status')
                .eq('id', automation.connection_id)
                .eq('status', 'connected')
                .maybeSingle();

              if (specificConnection) {
                connection = specificConnection;
              }
            }

            if (!connection || connection.status !== 'connected') {
              console.warn(`⚠️ [Birthday Automations] Conexão não disponível para ${contact.name}`);
              continue;
            }

            // 7. Criar registro da mensagem no banco
            const requestId = `birthday_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const { data: message, error: messageError } = await supabase
              .from('messages')
              .insert({
                conversation_id: conversation.id,
                workspace_id: conversation.workspace_id,
                content: messageText,
                message_type: 'text',
                sender_type: 'system',
                sender_id: '00000000-0000-0000-0000-000000000001',
                status: 'sending',
                external_id: requestId,
                metadata: {
                  requestId,
                  source: 'birthday_automation',
                  contact_name: contact.name,
                  created_at: new Date().toISOString()
                }
              })
              .select()
              .single();

            if (messageError || !message) {
              console.error(`❌ [Birthday Automations] Erro ao criar mensagem:`, messageError);
              continue;
            }

            // 8. Chamar message-sender
            const senderPayload = {
              messageId: message.id,
              phoneNumber: contact.phone,
              content: messageText,
              messageType: 'text',
              evolutionInstance: connection.instance_name,
              conversationId: conversation.id,
              workspaceId: conversation.workspace_id,
              external_id: message.external_id
            };

            const { data: senderResult, error: senderError } = await supabase.functions.invoke('message-sender', {
              body: senderPayload
            });

            if (senderError) {
              console.error(`❌ [Birthday Automations] Erro no message-sender:`, senderError);
              await supabase
                .from('messages')
                .update({
                  status: 'failed',
                  metadata: {
                    ...message.metadata,
                    error: senderError.message,
                    sent_via: 'sender_error',
                    timestamp: new Date().toISOString()
                  }
                })
                .eq('id', message.id);
            } else {
              await supabase
                .from('messages')
                .update({
                  status: 'sent',
                  metadata: {
                    ...message.metadata,
                    sent_via: senderResult?.method || 'message-sender',
                    timestamp: new Date().toISOString(),
                    external_response: senderResult?.result
                  }
                })
                .eq('id', message.id);

              console.log(`✅ [Birthday Automations] Mensagem de aniversário enviada para ${contact.name}`);
            }

            // 9. Registrar execução para evitar duplicata
            await supabase
              .from('birthday_automation_executions')
              .insert({
                workspace_id: automation.workspace_id,
                contact_id: contact.id,
                year: yearNum,
                status: senderError ? 'failed' : 'sent'
              });

            if (!senderError) {
              totalProcessed++;
            }

          } catch (contactError) {
            console.error(`❌ [Birthday Automations] Erro ao processar contato ${contact.id}:`, contactError);
          }
        }
      } catch (automationError) {
        console.error(`❌ [Birthday Automations] Erro ao processar automação ${automation.id}:`, automationError);
      }
    }

    console.log(`✅ [Birthday Automations] Verificação concluída. ${totalProcessed} mensagem(ns) enviada(s)`);

    return new Response(
      JSON.stringify({
        message: 'Birthday automations processed',
        processed: totalProcessed,
        automations_checked: automations.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [Birthday Automations] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
