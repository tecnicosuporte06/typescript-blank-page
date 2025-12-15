import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Clock, Info } from 'lucide-react';

interface BusinessHoursConfigProps {
  workspaceId: string;
}

interface BusinessHour {
  id?: string;
  day_of_week: number;
  is_enabled: boolean;
  start_time: string;
  end_time: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

export function BusinessHoursConfig({ workspaceId }: BusinessHoursConfigProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);

  useEffect(() => {
    loadBusinessHours();
  }, [workspaceId]);

  const loadBusinessHours = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('workspace_business_hours')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('day_of_week', { ascending: true });

      if (error) throw error;

      // Se não houver dados, criar estrutura vazia
      if (!data || data.length === 0) {
        const emptyHours: BusinessHour[] = DAYS_OF_WEEK.map(day => ({
          day_of_week: day.value,
          is_enabled: false,
          start_time: '08:00',
          end_time: '18:00',
        }));
        setBusinessHours(emptyHours);
      } else {
        // Preencher com dados existentes e adicionar dias faltantes
        const existingDays = new Set(data.map((bh: any) => bh.day_of_week));
        const allHours: BusinessHour[] = DAYS_OF_WEEK.map(day => {
          const existing = data.find((bh: any) => bh.day_of_week === day.value);
          if (existing) {
            return {
              id: existing.id,
              day_of_week: day.value,
              is_enabled: existing.is_enabled,
              start_time: existing.start_time.substring(0, 5), // Remove segundos
              end_time: existing.end_time.substring(0, 5),
            };
          }
          return {
            day_of_week: day.value,
            is_enabled: false,
            start_time: '08:00',
            end_time: '18:00',
          };
        });
        setBusinessHours(allHours);
      }
    } catch (error: any) {
      console.error('Erro ao carregar horários:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar horários de funcionamento',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateDay = (dayOfWeek: number, field: keyof BusinessHour, value: any) => {
    setBusinessHours(prev =>
      prev.map(bh =>
        bh.day_of_week === dayOfWeek ? { ...bh, [field]: value } : bh
      )
    );
  };

  const validateTime = (startTime: string, endTime: string): boolean => {
    if (!startTime || !endTime) return false;
    
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    const startTotal = startHours * 60 + startMinutes;
    const endTotal = endHours * 60 + endMinutes;
    
    // Permitir horário que cruza meia-noite
    if (endTotal < startTotal) {
      return true; // Horário que cruza meia-noite é válido
    }
    
    return endTotal > startTotal;
  };

  const handleSave = async () => {
    // Validar todos os horários habilitados
    const enabledDays = businessHours.filter(bh => bh.is_enabled);
    for (const day of enabledDays) {
      if (!validateTime(day.start_time, day.end_time)) {
        toast({
          title: 'Erro de validação',
          description: `Horário inválido para ${DAYS_OF_WEEK.find(d => d.value === day.day_of_week)?.label}. O horário de fim deve ser maior que o de início.`,
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setSaving(true);

      // Fazer upsert de todos os dias
      const upsertPromises = businessHours.map(async (bh) => {
        const { error } = await supabase
          .from('workspace_business_hours')
          .upsert(
            {
              id: bh.id,
              workspace_id: workspaceId,
              day_of_week: bh.day_of_week,
              is_enabled: bh.is_enabled,
              start_time: `${bh.start_time}:00`,
              end_time: `${bh.end_time}:00`,
            },
            {
              onConflict: 'workspace_id,day_of_week',
            }
          );

        if (error) throw error;
      });

      await Promise.all(upsertPromises);

      toast({
        title: 'Sucesso',
        description: 'Horários de funcionamento salvos com sucesso!',
      });

      // Recarregar dados
      await loadBusinessHours();
    } catch (error: any) {
      console.error('Erro ao salvar horários:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar horários de funcionamento',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const hasAnyConfig = businessHours.some(bh => bh.is_enabled);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {hasAnyConfig
            ? 'Configure os horários de funcionamento para cada dia da semana. Mensagens automáticas serão bloqueadas fora desses horários.'
            : 'Nenhum horário configurado. Mensagens automáticas serão enviadas em qualquer horário. Configure os horários abaixo para ativar a restrição.'}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Horários de Funcionamento
          </CardTitle>
          <CardDescription>
            Configure os dias e horários em que as automações podem enviar mensagens.
            Fuso horário: America/Sao_Paulo (UTC-3)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Dia da Semana</TableHead>
                  <TableHead className="w-[120px]">Ativo</TableHead>
                  <TableHead className="w-[150px]">Horário Início</TableHead>
                  <TableHead className="w-[150px]">Horário Fim</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businessHours.map((bh) => {
                  const dayInfo = DAYS_OF_WEEK.find(d => d.value === bh.day_of_week);
                  const isValid = !bh.is_enabled || validateTime(bh.start_time, bh.end_time);
                  
                  return (
                    <TableRow key={bh.day_of_week}>
                      <TableCell className="font-medium">
                        {dayInfo?.label}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={bh.is_enabled}
                          onCheckedChange={(checked) =>
                            updateDay(bh.day_of_week, 'is_enabled', checked)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="time"
                          value={bh.start_time}
                          onChange={(e) =>
                            updateDay(bh.day_of_week, 'start_time', e.target.value)
                          }
                          disabled={!bh.is_enabled}
                          className={!isValid ? 'border-red-500' : ''}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="time"
                          value={bh.end_time}
                          onChange={(e) =>
                            updateDay(bh.day_of_week, 'end_time', e.target.value)
                          }
                          disabled={!bh.is_enabled}
                          className={!isValid ? 'border-red-500' : ''}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar Horários
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

