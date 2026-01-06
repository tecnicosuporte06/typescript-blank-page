import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface LossReason {
  id: string;
  name: string;
  workspace_id: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export const useLossReasons = (workspaceId: string | null) => {
  const [lossReasons, setLossReasons] = useState<LossReason[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const fetchSeqRef = useRef(0);
  const lastToastAtRef = useRef(0);

  const canToastNow = useMemo(() => {
    // debounce de erro para não “piscar” o toast em falhas transitórias
    return () => {
      const now = Date.now();
      if (now - lastToastAtRef.current < 2000) return false;
      lastToastAtRef.current = now;
      return true;
    };
  }, []);

  const fetchLossReasons = async () => {
    if (!workspaceId) {
      console.log('⚠️ useLossReasons: workspaceId não fornecido, pulando busca');
      // não zera a lista aqui para evitar “sumir” com dados por timing
      return;
    }
    
    console.log('🔍 useLossReasons: Buscando motivos de perda para workspace:', workspaceId);
    setIsLoading(true);
    const seq = ++fetchSeqRef.current;
    try {
      let lastError: any = null;
      let data: any[] | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await supabase
            .from('loss_reasons')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('name');

          if (res.error) throw res.error;
          data = res.data || [];
          lastError = null;
          break;
        } catch (e: any) {
          lastError = e;
          await new Promise((r) => setTimeout(r, 250 + attempt * 450));
        }
      }

      if (lastError) throw lastError;
      
      // Evitar race: só aplica se for a requisição mais recente
      if (seq === fetchSeqRef.current) {
        console.log('✅ useLossReasons: Motivos de perda carregados:', data?.length || 0, data);
        setLossReasons((data as any[]) || []);
      }
    } catch (error: any) {
      console.error('❌ useLossReasons: Erro ao carregar motivos de perda:', error);
      if (seq === fetchSeqRef.current && canToastNow()) {
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os motivos de perda. Tentaremos novamente.',
          variant: 'destructive',
        });
      }
      // não zera lossReasons em erro para não “piscar” a tabela
    } finally {
      if (seq === fetchSeqRef.current) setIsLoading(false);
    }
  };

  const createLossReason = async (name: string) => {
    if (!workspaceId) return null;

    try {
      const { data, error } = await supabase
        .from('loss_reasons')
        .insert({
          name,
          workspace_id: workspaceId,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      
      await fetchLossReasons();
      toast({
        title: 'Sucesso',
        description: 'Motivo de perda criado com sucesso',
      });
      
      return data;
    } catch (error: any) {
      console.error('Erro ao criar motivo de perda:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível criar o motivo de perda',
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateLossReason = async (id: string, name?: string, isActive?: boolean) => {
    try {
      const updateData: { name?: string; is_active?: boolean; updated_at: string } = {
        updated_at: new Date().toISOString(),
      };
      
      if (name !== undefined) {
        updateData.name = name;
      }
      
      if (isActive !== undefined) {
        updateData.is_active = isActive;
      }

      const { error } = await supabase
        .from('loss_reasons')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      
      await fetchLossReasons();
      toast({
        title: 'Sucesso',
        description: 'Motivo de perda atualizado com sucesso',
      });
    } catch (error: any) {
      console.error('Erro ao atualizar motivo de perda:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o motivo de perda',
        variant: 'destructive',
      });
    }
  };

  const deleteLossReason = async (id: string) => {
    try {
      const { error } = await supabase
        .from('loss_reasons')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      await fetchLossReasons();
      toast({
        title: 'Sucesso',
        description: 'Motivo de perda excluído com sucesso',
      });
    } catch (error: any) {
      console.error('Erro ao excluir motivo de perda:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o motivo de perda',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchLossReasons();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return {
    lossReasons,
    isLoading,
    fetchLossReasons,
    createLossReason,
    updateLossReason,
    deleteLossReason,
  };
};
