import { supabase } from '@/integrations/supabase/client';

export type AuditAction = 
  | 'agent.created' | 'agent.updated' | 'agent.deleted'
  | 'user.created' | 'user.updated' | 'user.deleted'
  | 'connection.created' | 'connection.deleted' | 'connection.connected' | 'connection.disconnected'
  | 'queue.created' | 'queue.updated' | 'queue.deleted'
  | 'pipeline.created' | 'pipeline.updated' | 'pipeline.deleted'
  | 'contact.created' | 'contact.updated' | 'contact.deleted'
  | 'automation.created' | 'automation.updated' | 'automation.deleted';

export type AuditEntityType = 
  | 'ai_agent' | 'user' | 'connection' | 'queue' | 'pipeline' | 'contact' | 'automation';

interface AuditLogParams {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  entityName: string;
  workspaceId?: string | null;
  oldData?: any;
  newData?: any;
  metadata?: any;
}

/**
 * Obtém o usuário atual do localStorage
 */
function getCurrentUser(): { id: string; email?: string } | null {
  try {
    const savedUser = localStorage.getItem('currentUser');
    if (!savedUser) return null;
    return JSON.parse(savedUser);
  } catch {
    return null;
  }
}

/**
 * Registra um log de auditoria com o usuário atual
 * Deve ser chamado após operações de criação, atualização ou exclusão
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const user = getCurrentUser();
    
    if (!user?.id) {
      console.warn('[Audit] Usuário não identificado, log será registrado sem executor');
    }

    const { error } = await supabase.rpc('register_audit_log_with_user' as any, {
      p_user_id: user?.id || null,
      p_action: params.action,
      p_entity_type: params.entityType,
      p_entity_id: params.entityId,
      p_entity_name: params.entityName,
      p_workspace_id: params.workspaceId || null,
      p_old_data: params.oldData ? JSON.stringify(params.oldData) : null,
      p_new_data: params.newData ? JSON.stringify(params.newData) : null,
      p_metadata: params.metadata ? JSON.stringify(params.metadata) : '{}',
      p_source: 'frontend',
    });

    if (error) {
      console.error('[Audit] Erro ao registrar log:', error);
    }
  } catch (error) {
    console.error('[Audit] Exceção ao registrar log:', error);
  }
}

/**
 * Helper para criar log de criação
 */
export async function logCreate(
  entityType: AuditEntityType,
  entityId: string,
  entityName: string,
  newData: any,
  workspaceId?: string | null
): Promise<void> {
  const actionMap: Record<AuditEntityType, AuditAction> = {
    'ai_agent': 'agent.created',
    'user': 'user.created',
    'connection': 'connection.created',
    'queue': 'queue.created',
    'pipeline': 'pipeline.created',
    'contact': 'contact.created',
    'automation': 'automation.created',
  };

  await logAudit({
    action: actionMap[entityType],
    entityType,
    entityId,
    entityName,
    workspaceId,
    newData,
  });
}

/**
 * Helper para criar log de atualização
 */
export async function logUpdate(
  entityType: AuditEntityType,
  entityId: string,
  entityName: string,
  oldData: any,
  newData: any,
  workspaceId?: string | null
): Promise<void> {
  const actionMap: Record<AuditEntityType, AuditAction> = {
    'ai_agent': 'agent.updated',
    'user': 'user.updated',
    'connection': 'connection.connected', // ou disconnected dependendo do caso
    'queue': 'queue.updated',
    'pipeline': 'pipeline.updated',
    'contact': 'contact.updated',
    'automation': 'automation.updated',
  };

  await logAudit({
    action: actionMap[entityType],
    entityType,
    entityId,
    entityName,
    workspaceId,
    oldData,
    newData,
  });
}

/**
 * Helper para criar log de exclusão
 */
export async function logDelete(
  entityType: AuditEntityType,
  entityId: string,
  entityName: string,
  oldData: any,
  workspaceId?: string | null
): Promise<void> {
  const actionMap: Record<AuditEntityType, AuditAction> = {
    'ai_agent': 'agent.deleted',
    'user': 'user.deleted',
    'connection': 'connection.deleted',
    'queue': 'queue.deleted',
    'pipeline': 'pipeline.deleted',
    'contact': 'contact.deleted',
    'automation': 'automation.deleted',
  };

  await logAudit({
    action: actionMap[entityType],
    entityType,
    entityId,
    entityName,
    workspaceId,
    oldData,
  });
}
