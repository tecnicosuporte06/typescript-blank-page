import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Verifica se o horário atual está dentro do horário de funcionamento do workspace
 * 
 * @param workspaceId - ID do workspace
 * @param supabaseClient - Cliente Supabase
 * @param currentTime - Data/hora atual (opcional, usa Date.now() se não fornecido)
 * @returns true se estiver dentro do horário ou se não houver configuração, false caso contrário
 */
async function isWithinBusinessHours(
  workspaceId: string,
  supabaseClient: any,
  currentTime?: Date
): Promise<boolean> {
  try {
    // Buscar horários configurados para o workspace
    const { data: businessHours, error } = await supabaseClient
      .from('workspace_business_hours')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_enabled', true);

    if (error) {
      console.error('❌ Erro ao buscar horários de funcionamento:', error);
      // Em caso de erro, permitir envio (fail-safe)
      return true;
    }

    // Se não houver horários configurados, permitir envio (sem restrição)
    if (!businessHours || businessHours.length === 0) {
      console.log('✅ Nenhum horário de funcionamento configurado - permitindo envio');
      return true;
    }

    // Obter data/hora atual no fuso horário America/Sao_Paulo
    const now = currentTime || new Date();
    
    // Converter para fuso horário America/Sao_Paulo usando Intl.DateTimeFormat
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    // Obter partes da data formatada
    const parts = formatter.formatToParts(now);
    
    // Converter weekday string para número (0=Domingo, 1=Segunda, etc)
    const weekdayMap: Record<string, number> = {
      'Sunday': 0,
      'Monday': 1,
      'Tuesday': 2,
      'Wednesday': 3,
      'Thursday': 4,
      'Friday': 5,
      'Saturday': 6,
    };
    
    const dayName = parts.find(p => p.type === 'weekday')?.value || '';
    const dayOfWeekNum = weekdayMap[dayName] ?? now.getDay();
    
    // Extrair hora e minuto
    const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const currentTimeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

    console.log(`🕐 Verificando horário de funcionamento:`, {
      workspaceId,
      dayOfWeek: dayOfWeekNum,
      dayName,
      currentTime: currentTimeString,
      timezone: 'America/Sao_Paulo'
    });

    // Buscar configuração para o dia da semana atual
    const todayConfig = businessHours.find((bh: any) => bh.day_of_week === dayOfWeekNum);

    // ✅ CORREÇÃO: Se não houver configuração para o dia atual, PERMITIR envio
    // Requisito: "Ao não definir horário de funcionamento, entende-se que é qualquer horário"
    // Se o dia não está configurado, significa que não há restrição para esse dia
    if (!todayConfig) {
      console.log(`✅ Dia da semana ${dayOfWeekNum} (${dayName}) não está configurado - permitindo envio (sem restrição para este dia)`);
      return true;
    }

    // Extrair hora e minuto do start_time e end_time
    const startTime = todayConfig.start_time;
    const endTime = todayConfig.end_time;

    // Converter strings TIME para minutos desde meia-noite para comparação
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    const startMinutesTotal = startHours * 60 + startMinutes;
    const endMinutesTotal = endHours * 60 + endMinutes;
    const currentMinutesTotal = hours * 60 + minutes;

    console.log(`📊 Comparando horários:`, {
      startTime: `${String(startHours).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}`,
      endTime: `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`,
      currentTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      startMinutesTotal,
      endMinutesTotal,
      currentMinutesTotal
    });

    // Verificar se está dentro do horário
    let isWithinHours = false;

    if (endMinutesTotal > startMinutesTotal) {
      // Horário normal (não cruza meia-noite)
      // Ex: 08:00 - 18:00
      isWithinHours = currentMinutesTotal >= startMinutesTotal && currentMinutesTotal <= endMinutesTotal;
    } else {
      // Horário que cruza meia-noite
      // Ex: 22:00 - 02:00 (22:00 até 23:59 e 00:00 até 02:00)
      isWithinHours = currentMinutesTotal >= startMinutesTotal || currentMinutesTotal <= endMinutesTotal;
    }

    if (isWithinHours) {
      console.log('✅ Dentro do horário de funcionamento - permitindo envio');
    } else {
      console.log('🚫 Fora do horário de funcionamento - bloqueando envio');
    }

    return isWithinHours;
  } catch (error) {
    console.error('❌ Erro ao verificar horário de funcionamento:', error);
    // Em caso de erro, permitir envio (fail-safe)
    return true;
  }
}

// Função helper para converter qualquer unidade de tempo para minutos
function convertToMinutes(value: number, unit: string): number {
  switch (unit) {
    case 'seconds':
      return value / 60;
    case 'minutes':
      return value;
    case 'hours':
      return value * 60;
    case 'days':
      return value * 1440;
    default:
      console.warn(`⚠️ Unknown time unit: ${unit}, treating as minutes`);
      return value;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json().catch(() => ({}));
    console.log('⏰ [Time Automations] ========== INICIANDO VERIFICAÇÃO ==========');
    console.log('⏰ [Time Automations] Request body:', JSON.stringify(requestBody, null, 2));
    console.log('⏰ [Time Automations] Timestamp:', new Date().toISOString());
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('⏰ [Time Automations] Supabase client criado');

    // Buscar todas as automações ativas com trigger de tempo
    console.log('🔍 [Time Automations] Buscando automações ativas com trigger de tempo...');
    
    const { data: automations, error: automationsError } = await supabase
      .from('crm_column_automations')
      .select(`
        id,
        column_id,
        workspace_id,
        name,
        is_active,
        ignore_business_hours,
        triggers:crm_column_automation_triggers!inner(
          trigger_type,
          trigger_config
        ),
        actions:crm_column_automation_actions(
          action_type,
          action_config,
          action_order
        )
      `)
      .eq('is_active', true)
      .in('triggers.trigger_type', ['time_in_column', 'tempo_na_coluna']);

    if (automationsError) {
      console.error('❌ [Time Automations] Error fetching automations:', automationsError);
      console.error('❌ [Time Automations] Error details:', JSON.stringify(automationsError, null, 2));
      throw automationsError;
    }

    console.log(`📊 [Time Automations] Query executada. Resultado: ${automations?.length || 0} automações encontradas`);

    if (!automations || automations.length === 0) {
      console.log('✅ [Time Automations] Nenhuma automação de tempo ativa encontrada');
      console.log('💡 [Time Automations] Verifique se há automações criadas e se estão ativas');
      return new Response(
        JSON.stringify({ 
          message: 'No automations to process', 
          processed: 0,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 [Time Automations] ========== ${automations.length} AUTOMAÇÃO(ÕES) ENCONTRADA(S) ==========`);
    automations.forEach((auto, idx) => {
      console.log(`   ${idx + 1}. "${auto.name}" (ID: ${auto.id}, Coluna: ${auto.column_id}, Workspace: ${auto.workspace_id})`);
    });

    let totalProcessed = 0;

    // Processar cada automação
    for (const automation of automations) {
      try {
        const trigger = automation.triggers[0];
        const triggerConfig = typeof trigger.trigger_config === 'string' 
          ? JSON.parse(trigger.trigger_config) 
          : trigger.trigger_config;

        // Suportar tanto configuração nova (time_unit + time_value) quanto antiga (time_in_minutes)
        let timeInMinutes: number;
        let originalValue: number;
        let originalUnit: string;

        if (triggerConfig?.time_unit && triggerConfig?.time_value) {
          // Nova configuração com unidade
          originalValue = parseFloat(triggerConfig.time_value);
          originalUnit = triggerConfig.time_unit;
          timeInMinutes = convertToMinutes(originalValue, originalUnit);
          
          console.log(`🔍 [Time Automations] Trigger type found: "${trigger.trigger_type}"`);
          console.log(`🔍 [Time Automations] Automation "${automation.name}": ${originalValue} ${originalUnit} = ${timeInMinutes.toFixed(4)} minutes`);
        } else if (triggerConfig?.time_value) {
          // Configuração com time_value apenas (assume minutos)
          originalValue = parseFloat(triggerConfig.time_value);
          originalUnit = 'minutes';
          timeInMinutes = originalValue;
          
          console.log(`🔍 [Time Automations] Trigger type found: "${trigger.trigger_type}"`);
          console.log(`🔍 [Time Automations] Automation "${automation.name}": ${originalValue} minutes (time_value only)`);
        } else if (triggerConfig?.time_in_minutes) {
          // Configuração antiga em minutos
          timeInMinutes = triggerConfig.time_in_minutes;
          originalValue = timeInMinutes;
          originalUnit = 'minutes';
          
          console.log(`🔍 [Time Automations] Automation "${automation.name}": ${timeInMinutes} minutes (legacy format)`);
        } else {
          console.warn(`⚠️ [Time Automations] Invalid time config for automation ${automation.id}:`, triggerConfig);
          continue;
        }
        
        if (timeInMinutes <= 0) {
          console.warn(`⚠️ [Time Automations] Invalid time value (${timeInMinutes} minutes) for automation ${automation.id}`);
          continue;
        }

        // Buscar cards que estão na coluna há mais tempo que o configurado
        // e que ainda não tiveram essa automação executada
        const now = new Date();
        const timeThreshold = new Date(now.getTime() - (timeInMinutes * 60 * 1000));

        console.log(`🔍 [Time Automations] Current time: ${now.toISOString()}`);
        console.log(`🔍 [Time Automations] Time threshold: ${timeThreshold.toISOString()} (NOW - ${timeInMinutes.toFixed(4)} min)`);
        console.log(`🔍 [Time Automations] Looking for cards in column ${automation.column_id} moved before ${timeThreshold.toISOString()}`);
        console.log(`🔍 [Time Automations] Automation config: ${originalValue} ${originalUnit} = ${timeInMinutes.toFixed(4)} minutes`);

        const { data: eligibleCards, error: cardsError } = await supabase
          .from('pipeline_cards')
          .select(`
            id,
            column_id,
            moved_to_column_at,
            pipeline_id,
            contact_id,
            conversation_id,
            pipelines!inner(workspace_id)
          `)
          .eq('column_id', automation.column_id)
          .not('moved_to_column_at', 'is', null) // Garantir que moved_to_column_at não é NULL
          .lt('moved_to_column_at', timeThreshold.toISOString());

        console.log(`🔍 [Time Automations] Query result: ${eligibleCards?.length || 0} cards found, error: ${cardsError ? JSON.stringify(cardsError) : 'none'}`);

        if (cardsError) {
          console.error(`❌ [Time Automations] Error fetching cards for automation ${automation.id}:`, cardsError);
          continue;
        }

        if (!eligibleCards || eligibleCards.length === 0) {
          console.log(`✅ [Time Automations] No eligible cards for automation "${automation.name}"`);
          continue;
        }

        console.log(`📦 [Time Automations] Found ${eligibleCards.length} eligible cards for "${automation.name}"`);

        // Processar cada card elegível
        for (const card of eligibleCards) {
          console.log(`🔍 [Time Automations] Checking card ${card.id}:`);
          console.log(`   - moved_to_column_at: ${card.moved_to_column_at}`);
          console.log(`   - column_id: ${card.column_id}`);
          
          // Calcular tempo decorrido
          const movedAt = new Date(card.moved_to_column_at);
          const now = new Date();
          const elapsedMinutes = (now.getTime() - movedAt.getTime()) / (1000 * 60);
          console.log(`   - Tempo decorrido: ${elapsedMinutes.toFixed(2)} minutos (requerido: ${timeInMinutes.toFixed(2)})`);
          
          // Verificar se já executou essa automação para esse card neste período
          const { data: existingExecution, error: executionCheckError } = await supabase
            .from('crm_automation_executions')
            .select('id, executed_at')
            .eq('automation_id', automation.id)
            .eq('card_id', card.id)
            .eq('column_id', automation.column_id)
            .gte('executed_at', card.moved_to_column_at)
            .maybeSingle();

          if (executionCheckError) {
            console.error(`❌ [Time Automations] Error checking executions for card ${card.id}:`, executionCheckError);
          }

          if (existingExecution) {
            console.log(`⏭️ [Time Automations] Automation already executed for card ${card.id} at ${existingExecution.executed_at}`);
            continue;
          }

          console.log(`🎬 [Time Automations] Executing automation "${automation.name}" for card ${card.id}`);

          // Executar as ações diretamente
          try {
            let actionSuccess = true;
            
            // Ordenar ações por action_order
            const sortedActions = automation.actions.sort((a: any, b: any) => 
              (a.action_order || 0) - (b.action_order || 0)
            );

            // Executar cada ação
            for (const action of sortedActions) {
              try {
                const actionConfig = typeof action.action_config === 'string' 
                  ? JSON.parse(action.action_config) 
                  : action.action_config;

                console.log(`🎬 [Time Automations] Executando ação: ${action.action_type}`, actionConfig);

                switch (action.action_type) {
                  case 'mover_coluna':
                  case 'move_to_column': {
                    const targetColumnId = actionConfig?.column_id || actionConfig?.target_column_id;
                    const targetPipelineId = actionConfig?.pipeline_id || actionConfig?.target_pipeline_id;
                    
                    console.log(`🔍 [Time Automations] Move action config:`, actionConfig);
                    console.log(`🔍 [Time Automations] Target column ID: ${targetColumnId}, Target Pipeline ID: ${targetPipelineId}`);
                    
                    if (targetColumnId) {
                      const updateData: any = {
                        column_id: targetColumnId,
                        moved_to_column_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                      };

                      if (targetPipelineId) {
                        updateData.pipeline_id = targetPipelineId;
                      }

                      // Usar update direto para suportar pipeline_id
                      const { data: updateResult, error: updateError } = await supabase
                        .from('pipeline_cards')
                        .update(updateData)
                        .eq('id', card.id)
                        .select()
                        .single();
                      
                      if (updateError) {
                        console.error(`❌ [Time Automations] Erro ao mover card:`, updateError);
                      } else {
                        console.log(`✅ [Time Automations] Card ${card.id} movido para coluna ${targetColumnId} no pipeline ${targetPipelineId || card.pipeline_id}`, updateResult);
                        
                        // Enviar broadcast manual para garantir que o frontend receba a atualização
                        const channel = supabase.channel(`pipeline-${card.pipeline_id}`);
                        await channel.send({
                          type: 'broadcast',
                          event: 'pipeline-card-moved',
                          payload: {
                            card_id: card.id,
                            old_column_id: card.column_id,
                            new_column_id: targetColumnId,
                            pipeline_id: targetPipelineId || card.pipeline_id
                          }
                        });
                        console.log(`📡 [Time Automations] Broadcast enviado para pipeline-${card.pipeline_id}`);
                      }
                    } else {
                      console.error(`❌ [Time Automations] column_id não encontrado no actionConfig`);
                    }
                    break;
                  }

                  case 'add_tag':
                  case 'adicionar_tag': {
                    const tagId = actionConfig?.tag_id;
                    if (tagId && card.contact_id) {
                      // Verificar se a tag já existe
                      const { data: existingTag } = await supabase
                        .from('contact_tags')
                        .select('id')
                        .eq('contact_id', card.contact_id)
                        .eq('tag_id', tagId)
                        .maybeSingle();

                      if (!existingTag) {
                        await supabase
                          .from('contact_tags')
                          .insert({
                            contact_id: card.contact_id,
                            tag_id: tagId
                          });
                        console.log(`✅ [Time Automations] Tag ${tagId} adicionada ao contato`);
                      }
                    }
                    break;
                  }

                  case 'remove_tag':
                  case 'remover_tag': {
                    const tagId = actionConfig?.tag_id;
                    if (tagId && card.contact_id) {
                      await supabase
                        .from('contact_tags')
                        .delete()
                        .eq('contact_id', card.contact_id)
                        .eq('tag_id', tagId);
                      console.log(`✅ [Time Automations] Tag ${tagId} removida do contato`);
                    }
                    break;
                  }

                  case 'assign_responsible':
                  case 'atribuir_responsavel': {
                    const userId = actionConfig?.user_id;
                    if (userId) {
                      await supabase
                        .from('pipeline_cards')
                        .update({ responsible_user_id: userId })
                        .eq('id', card.id);
                      console.log(`✅ [Time Automations] Responsável ${userId} atribuído ao card`);
                    }
                    break;
                  }

                  case 'add_agent': {
                    if (card.conversation_id) {
                      const agentId = actionConfig?.agent_id;
                      if (agentId) {
                        await supabase
                          .from('conversations')
                          .update({
                            agente_ativo: true,
                            agent_active_id: agentId,
                            status: 'open'
                          })
                          .eq('id', card.conversation_id);
                        console.log(`✅ [Time Automations] Agente ${agentId} ativado na conversa`);
                      }
                    }
                    break;
                  }

                  case 'remove_agent':
                  case 'remover_agente': {
                    if (!card.conversation_id) {
                      console.warn('⚠️ [Time Automations] Card sem conversation_id para remove_agent');
                      actionSuccess = false;
                      break;
                    }

                    console.log(`🚫 [Time Automations] Desativando agente IA na conversa ${card.conversation_id}`);

                    const { error: agentError } = await supabase
                      .from('conversations')
                      .update({
                        agente_ativo: false,
                        agent_active_id: null
                      })
                      .eq('id', card.conversation_id);

                    if (agentError) {
                      console.error('❌ [Time Automations] Erro ao desativar agente:', agentError);
                      actionSuccess = false;
                    } else {
                      console.log('✅ [Time Automations] Agente desativado com sucesso');
                    }
                    break;
                  }

                  case 'send_message':
                  case 'enviar_mensagem': {
                    const messageText = actionConfig?.message;
                    if (!messageText) {
                      console.warn('⚠️ [Time Automations] send_message sem mensagem configurada');
                      actionSuccess = false;
                      break;
                    }

                    if (!card.conversation_id) {
                      console.error('❌ [Time Automations] Conversa não encontrada no card');
                      actionSuccess = false;
                      break;
                    }

                    // ✅ Verificar horário de funcionamento antes de enviar (a menos que ignore_business_hours esteja ativo)
                    const workspaceId = (card as any).pipelines?.workspace_id;
                    const ignoreBusinessHours = (automation as any).ignore_business_hours === true;
                    
                    if (workspaceId && !ignoreBusinessHours) {
                      const withinBusinessHours = await isWithinBusinessHours(workspaceId, supabase);
                      if (!withinBusinessHours) {
                        console.log(`🚫 [Time Automations] Mensagem bloqueada: fora do horário de funcionamento`);
                        console.log(`   Workspace ID: ${workspaceId}`);
                        console.log(`   Card ID: ${card.id}`);
                        console.log(`   Mensagem não será enviada para evitar violação legal`);
                        actionSuccess = false;
                        break; // Sair do switch sem enviar
                      }
                      console.log(`✅ [Time Automations] Dentro do horário de funcionamento - prosseguindo com envio`);
                    } else if (ignoreBusinessHours) {
                      console.log(`⏰ [Time Automations] Automação configurada para ignorar horário de funcionamento - prosseguindo com envio`);
                    } else {
                      console.warn(`⚠️ [Time Automations] Workspace ID não encontrado - não é possível verificar horário de funcionamento`);
                    }

                    console.log(`📤 [Time Automations] Enviando mensagem para conversa ${card.conversation_id}`);
                    console.log(`📤 [Time Automations] Conteúdo da mensagem: "${messageText}"`);

                    // Chamar send-message (função de produção)
                    // Usar UUID especial para identificar mensagens de automação
                    const { data: sendResult, error: sendError } = await supabase.functions.invoke('send-message', {
                      body: {
                        conversation_id: card.conversation_id,
                        content: messageText,
                        sender_id: '00000000-0000-0000-0000-000000000001', // ID especial para automações
                        sender_type: 'system',
                        message_type: 'text'
                      },
                      headers: {
                        Authorization: `Bearer ${supabaseKey}`,
                        'x-system-user-id': '00000000-0000-0000-0000-000000000001',
                        'x-system-user-email': 'automacao@sistema.com',
                        'x-workspace-id': (card as any).pipelines?.workspace_id || ''
                      }
                    });

                    if (sendError) {
                      console.error('❌ [Time Automations] Erro ao enviar mensagem:', sendError);
                      actionSuccess = false;
                    } else {
                      console.log('✅ [Time Automations] Mensagem enviada com sucesso:', sendResult);
                    }
                    break;
                  }

                  case 'send_funnel': {
                    console.log(`🎯 [Time Automations] ========== EXECUTANDO AÇÃO: ENVIAR FUNIL ==========`);
                    
                    const funnelId = actionConfig?.funnel_id;
                    
                    if (!funnelId) {
                      console.warn(`⚠️ [Time Automations] Ação send_funnel não tem funnel_id configurado.`);
                      actionSuccess = false;
                      break;
                    }
                    
                    // Buscar conversa do card
                    let conversationId = card.conversation_id;
                    
                    // Se não tem conversa, tentar buscar por contact_id
                    if (!conversationId && card.contact_id) {
                      const workspaceId = (card as any).pipelines?.workspace_id;
                      
                      if (workspaceId) {
                        const { data: existingConversation } = await supabase
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
                      console.warn(`⚠️ [Time Automations] Card não tem conversa associada. Não é possível enviar funil. Card ID: ${card.id}, Contact ID: ${card.contact_id}`);
                      actionSuccess = false;
                      break;
                    }
                    
                    // Buscar o funil
                    console.log(`🔍 [Time Automations] Buscando funil: ${funnelId}`);
                    const { data: funnel, error: funnelError } = await supabase
                      .from('quick_funnels')
                      .select('*')
                      .eq('id', funnelId)
                      .single();
                    
                    if (funnelError || !funnel) {
                      console.error(`❌ [Time Automations] Erro ao buscar funil:`, funnelError);
                      actionSuccess = false;
                      break;
                    }
                    
                    console.log(`✅ [Time Automations] Funil encontrado: "${funnel.title}" com ${funnel.steps?.length || 0} steps`);
                    
                    if (!funnel.steps || funnel.steps.length === 0) {
                      console.warn(`⚠️ [Time Automations] Funil ${funnelId} não tem steps configurados.`);
                      actionSuccess = false;
                      break;
                    }
                    
                    // Ordenar steps por order
                    const sortedSteps = [...funnel.steps].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
                    
                    console.log(`📤 [Time Automations] Iniciando envio de ${sortedSteps.length} mensagens do funil...`);
                    
                    // ✅ Verificar horário de funcionamento antes de enviar funil (a menos que ignore_business_hours esteja ativo)
                    const funnelWorkspaceId = (card as any).pipelines?.workspace_id;
                    const ignoreFunnelBusinessHours = (automation as any).ignore_business_hours === true;
                    
                    if (funnelWorkspaceId && !ignoreFunnelBusinessHours) {
                      const withinBusinessHours = await isWithinBusinessHours(funnelWorkspaceId, supabase);
                      if (!withinBusinessHours) {
                        console.log(`🚫 [Time Automations] Funil bloqueado: fora do horário de funcionamento`);
                        console.log(`   Workspace ID: ${funnelWorkspaceId}`);
                        console.log(`   Card ID: ${card.id}`);
                        console.log(`   Funil não será enviado para evitar violação legal`);
                        actionSuccess = false;
                        break; // Sair do switch sem enviar
                      }
                      console.log(`✅ [Time Automations] Dentro do horário de funcionamento - prosseguindo com envio do funil`);
                    } else if (ignoreFunnelBusinessHours) {
                      console.log(`⏰ [Time Automations] Automação configurada para ignorar horário de funcionamento - prosseguindo com envio do funil`);
                    } else {
                      console.warn(`⚠️ [Time Automations] Workspace ID não encontrado - não é possível verificar horário de funcionamento`);
                    }
                    
                    // Processar cada step
                    for (let i = 0; i < sortedSteps.length; i++) {
                      const step = sortedSteps[i];
                      console.log(`\n📨 [Time Automations] Processando step ${i + 1}/${sortedSteps.length}:`, {
                        type: step.type,
                        item_id: step.item_id,
                        delay_seconds: step.delay_seconds
                      });
                      
                      try {
                        let messagePayload: any = null;
                        
                        // Buscar item de acordo com o tipo
                        const normalizedType = step.type.toLowerCase();
                        
                        switch (normalizedType) {
                          case 'message':
                          case 'messages':
                          case 'mensagens': {
                            const { data: message } = await supabase
                              .from('quick_messages')
                              .select('*')
                              .eq('id', step.item_id)
                              .single();
                            
                            if (message) {
                              messagePayload = {
                                conversation_id: conversationId,
                                content: message.content,
                                message_type: 'text'
                              };
                            }
                            break;
                          }
                          
                          case 'audio':
                          case 'audios': {
                            const { data: audio } = await supabase
                              .from('quick_audios')
                              .select('*')
                              .eq('id', step.item_id)
                              .single();
                            
                            if (audio) {
                              messagePayload = {
                                conversation_id: conversationId,
                                content: '',
                                message_type: 'audio',
                                file_url: audio.file_url,
                                file_name: audio.file_name || audio.title || 'audio.mp3'
                              };
                            }
                            break;
                          }
                          
                          case 'media':
                          case 'midias': {
                            const { data: media } = await supabase
                              .from('quick_media')
                              .select('*')
                              .eq('id', step.item_id)
                              .single();
                            
                            if (media) {
                              // Determinar tipo baseado no file_type ou URL
                              let mediaType = 'image';
                              if (media.file_type?.startsWith('video/')) {
                                mediaType = 'video';
                              } else if (media.file_url) {
                                const url = media.file_url.toLowerCase();
                                if (url.includes('.mp4') || url.includes('.mov') || url.includes('.avi')) {
                                  mediaType = 'video';
                                }
                              }
                              
                              messagePayload = {
                                conversation_id: conversationId,
                                content: media.title || '',
                                message_type: mediaType,
                                file_url: media.file_url,
                                file_name: media.file_name || media.title || `media.${mediaType === 'video' ? 'mp4' : 'jpg'}`
                              };
                            }
                            break;
                          }
                          
                          case 'document':
                          case 'documents':
                          case 'documentos': {
                            const { data: document } = await supabase
                              .from('quick_documents')
                              .select('*')
                              .eq('id', step.item_id)
                              .single();
                            
                            if (document) {
                              messagePayload = {
                                conversation_id: conversationId,
                                content: document.title || '',
                                message_type: 'document',
                                file_url: document.file_url,
                                file_name: document.file_name || document.title || 'document.pdf'
                              };
                            }
                            break;
                          }
                          
                          default:
                            console.error(`❌ [Time Automations] Tipo de step não reconhecido: "${step.type}"`);
                        }
                        
                        if (!messagePayload) {
                          console.error(`❌ [Time Automations] Falha ao criar payload para step ${i + 1}`);
                          continue;
                        }
                        
                        console.log(`📦 [Time Automations] Enviando mensagem ${i + 1}/${sortedSteps.length}...`);
                        
                        // Enviar mensagem
                        const { error: stepError } = await supabase.functions.invoke('test-send-msg', {
                          body: messagePayload
                        });
                        
                        if (stepError) {
                          console.error(`❌ [Time Automations] Erro ao enviar step ${i + 1}:`, stepError);
                          continue;
                        }
                        
                        console.log(`✅ [Time Automations] Mensagem ${i + 1}/${sortedSteps.length} enviada com sucesso`);
                        
                        // Aguardar delay antes do próximo step (se houver)
                        if (step.delay_seconds && step.delay_seconds > 0 && i < sortedSteps.length - 1) {
                          console.log(`⏳ [Time Automations] Aguardando ${step.delay_seconds} segundos antes do próximo step...`);
                          await new Promise(resolve => setTimeout(resolve, step.delay_seconds * 1000));
                        }
                        
                      } catch (stepError) {
                        console.error(`❌ [Time Automations] Erro ao processar step ${i + 1}:`, stepError);
                      }
                    }
                    
                    console.log(`✅ [Time Automations] ========== FUNIL ENVIADO COM SUCESSO ==========`);
                    break;
                  }

                  default:
                    console.log(`⚠️ [Time Automations] Ação ${action.action_type} não implementada em time-based automations`);
                }
              } catch (actionError) {
                console.error(`❌ [Time Automations] Erro ao executar ação ${action.action_type}:`, actionError);
                actionSuccess = false;
              }
            }

            if (actionSuccess) {
              // Registrar execução
              const { error: execInsertError } = await supabase
                .from('crm_automation_executions')
                .insert({
                  automation_id: automation.id,
                  card_id: card.id,
                  column_id: automation.column_id,
                  execution_type: 'tempo_na_coluna',
                  metadata: {
                    time_in_minutes: timeInMinutes,
                    original_value: originalValue,
                    original_unit: originalUnit,
                    moved_to_column_at: card.moved_to_column_at
                  }
                });

              if (execInsertError) {
                console.error(`❌ [Time Automations] Erro ao registrar execução:`, execInsertError);
              } else {
                console.log(`📝 [Time Automations] Execução registrada com sucesso`);
              }

              totalProcessed++;
              console.log(`✅ [Time Automations] Automation executed successfully for card ${card.id}`);
            } else {
              console.error(`❌ [Time Automations] Failed to execute automation for card ${card.id}`);
            }
          } catch (execError) {
            console.error(`❌ [Time Automations] Error executing automation for card ${card.id}:`, execError);
          }
        }
      } catch (automationError) {
        console.error(`❌ [Time Automations] Error processing automation ${automation.id}:`, automationError);
      }
    }

    console.log(`✅ [Time Automations] Check completed. Processed ${totalProcessed} cards`);

    return new Response(
      JSON.stringify({ 
        message: 'Time-based automations processed', 
        processed: totalProcessed,
        automations_checked: automations.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [Time Automations] Fatal error:', error);
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
