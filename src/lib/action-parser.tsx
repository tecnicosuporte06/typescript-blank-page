import { 
  Tag, 
  ArrowRightLeft, 
  Shuffle, 
  FolderKanban, 
  ArrowRight, 
  Database, 
  ListFilter 
} from "lucide-react";
import { ReactNode } from "react";

export interface ActionDisplayInfo {
  type: string;
  label: string;
  icon: ReactNode;
  color: string;
  values: Record<string, string>;
}

/**
 * Verifica se um texto é uma ação [ADD_ACTION]
 */
export function isActionText(text: string): boolean {
  return text.trim().startsWith('[ADD_ACTION]:');
}

/**
 * Extrai valores dos parâmetros de uma ação
 */
function extractActionValues(actionText: string): Record<string, string> {
  const values: Record<string, string> = {};
  const paramMatches = actionText.match(/\[([^\]]+)\]/g);
  
  if (paramMatches) {
    paramMatches.forEach(param => {
      const paramText = param.replace(/[\[\]]/g, '');
      const colonIndex = paramText.indexOf(':');
      
      if (colonIndex > 0) {
        const key = paramText.substring(0, colonIndex).trim();
        const value = paramText.substring(colonIndex + 1).trim();
        values[key] = value;
      }
    });
  }
  
  return values;
}

/**
 * Parseia uma ação e retorna informações para exibição
 */
export function getActionDisplayInfo(actionText: string): ActionDisplayInfo | null {
  if (!isActionText(actionText)) {
    return null;
  }

  const values = extractActionValues(actionText);

  // Adicionar Tag
  const tagMatch = actionText.match(/\[ADD_ACTION\]:\s*\[tag_name:\s*(.*?)\]\s*,\s*\[tag_id:\s*(.*?)\]\s*,\s*\[contact_id:\s*CONTACT_ID\]/);
  if (tagMatch) {
    return {
      type: 'adicionar_tag',
      label: `Adicionar Tag: ${tagMatch[1]}`,
      icon: <Tag className="w-3.5 h-3.5" />,
      color: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
      values: { tag_name: tagMatch[1], tag_id: tagMatch[2] }
    };
  }

  // Transferir Coluna CRM
  const colunaMatch = actionText.match(/\[ADD_ACTION\]:\s*\[pipeline_id:\s*(.*?)\]\s*,\s*\[coluna_id:\s*(.*?)\]\s*,\s*\[card_id:\s*ID_DO_CARD\]\s*,\s*\[contact_id:\s*CONTACT_ID\]/);
  if (colunaMatch) {
    return {
      type: 'transferir_coluna_crm',
      label: 'Transferir Coluna CRM',
      icon: <ArrowRight className="w-3.5 h-3.5" />,
      color: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700',
      values: { pipeline_id: colunaMatch[1], coluna_id: colunaMatch[2] }
    };
  }

  // Transferir Conexão
  const conexaoMatch = actionText.match(/\[ADD_ACTION\]:\s*\[conection_name:\s*(.*?)\]\s*,\s*\[conection_id:\s*(.*?)\]\s*,\s*\[contact_id:\s*CONTACT_ID\](?:\s*,\s*\[instabce_phone:\s*INSTANCE_PHONE\])?/);
  if (conexaoMatch) {
    return {
      type: 'transferir_conexao',
      label: `Transferir Conexão: ${conexaoMatch[1]}`,
      icon: <Shuffle className="w-3.5 h-3.5" />,
      color: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
      values: { conection_name: conexaoMatch[1], conection_id: conexaoMatch[2] }
    };
  }

  // Transferir Fila
  const filaMatch = actionText.match(/\[ADD_ACTION\]:\s*\[fila_id:\s*(.*?)\]\s*,\s*\[contact_id:\s*CONTACT_ID\]\s*,\s*\[conversation_id:\s*CONVERSATION_ID\](?:\s*,\s*\[instabce_phone:\s*INSTANCE_PHONE\])?/);
  if (filaMatch) {
    return {
      type: 'transferir_fila',
      label: 'Transferir Fila',
      icon: <ArrowRightLeft className="w-3.5 h-3.5" />,
      color: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700',
      values: { fila_id: filaMatch[1] }
    };
  }

  // Criar Card CRM
  const criarCardMatch = actionText.match(/\[ADD_ACTION\]:\s*\[pipeline_id:\s*(.*?)\]\s*,\s*\[coluna_id:\s*(.*?)\]\s*,\s*\[contact_id:\s*CONTACT_ID\]\s*,\s*\[conversation_id:\s*CONVERSATION_ID\](?:\s*,\s*\[instabce_phone:\s*INSTANCE_PHONE\])?/);
  if (criarCardMatch) {
    return {
      type: 'criar_card',
      label: 'Criar Card no CRM',
      icon: <FolderKanban className="w-3.5 h-3.5" />,
      color: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
      values: { pipeline_id: criarCardMatch[1], coluna_id: criarCardMatch[2] }
    };
  }

  // Salvar Informações Adicionais
  const salvarInfoMatch = actionText.match(/\[ADD_ACTION\]:\s*\[workspace_id:\s*WORKSPACE_ID\]\s*,\s*\[contact_id:\s*CONTACT_ID\]\s*,\s*\[field_name:\s*(.*?)\]\s*,\s*\[field_value:\s*(.*?)\]/);
  if (salvarInfoMatch) {
    return {
      type: 'salvar_informacoes',
      label: `Salvar campo ${salvarInfoMatch[1]}`,
      icon: <Database className="w-3.5 h-3.5" />,
      color: 'bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-700',
      values: { field_name: salvarInfoMatch[1], field_value: salvarInfoMatch[2] }
    };
  }

  // Enviar Funil
  const funnelMatch = actionText.match(/\[ADD_ACTION\]:\s*\[funnel_id:\s*(.*?)\]\s*,\s*\[funnel_title:\s*(.*?)\]\s*,\s*\[contact_id:\s*CONTACT_ID\]\s*,\s*\[conversation_id:\s*CONVERSATION_ID\](?:\s*,\s*\[instabce_phone:\s*INSTANCE_PHONE\])?/);
  if (funnelMatch) {
    return {
      type: 'enviar_funil',
      label: `Enviar Funil: ${funnelMatch[2]}`,
      icon: <ListFilter className="w-3.5 h-3.5" />,
      color: 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700',
      values: { funnel_id: funnelMatch[1], funnel_title: funnelMatch[2] }
    };
  }

  // Ação genérica não reconhecida
  return {
    type: 'action_generica',
    label: 'Ação',
    icon: <Database className="w-3.5 h-3.5" />,
    color: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    values: {}
  };
}

/**
 * Parseia o texto completo e retorna array de ações encontradas
 */
export function parseActionText(text: string): Array<{ match: string; position: number; info: ActionDisplayInfo }> {
  const actions: Array<{ match: string; position: number; info: ActionDisplayInfo }> = [];
  const actionRegex = /\[ADD_ACTION\]:[^\n]*/g;
  let match;

  while ((match = actionRegex.exec(text)) !== null) {
    const actionText = match[0].trim();
    const info = getActionDisplayInfo(actionText);
    
    if (info) {
      actions.push({
        match: actionText,
        position: match.index,
        info
      });
    }
  }

  return actions;
}

