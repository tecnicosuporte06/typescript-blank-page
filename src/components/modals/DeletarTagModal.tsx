import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Tag {
  id: string;
  name: string;
}

interface DeletarTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTagDeleted: () => void;
  tag: Tag | null;
}

export function DeletarTagModal({ isOpen, onClose, onTagDeleted, tag }: DeletarTagModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!tag?.id) return;

    setIsLoading(true);
    try {
      // Primeiro deletar todos os registros de contact_tags associados
      const { error: contactTagsError } = await supabase
        .from('contact_tags')
        .delete()
        .eq('tag_id', tag.id);

      if (contactTagsError) throw contactTagsError;

      // Depois deletar a tag
      const { error: tagError } = await supabase
        .from('tags')
        .delete()
        .eq('id', tag.id);

      if (tagError) throw tagError;

      toast({
        title: "Tag deletada",
        description: `A tag "${tag.name}" foi deletada com sucesso.`,
      });

      onTagDeleted();
      onClose();
    } catch (error: any) {
      console.error('Erro ao deletar tag:', error);
      toast({
        title: "Erro",
        description: "Não foi possível deletar a tag. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="bg-white text-gray-900 dark:bg-[#0b0b0b] dark:text-gray-100 dark:border-gray-700">
        <AlertDialogHeader>
          <AlertDialogTitle>Deletar Tag</AlertDialogTitle>
          <AlertDialogDescription className="dark:text-gray-300">
            Tem certeza que deseja deletar a tag "{tag?.name}"? 
            Esta ação removerá a tag de todos os contatos associados e não poderá ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading} className="rounded-none border border-[#d4d4d4] text-gray-800 bg-white hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:bg-transparent dark:hover:bg-[#1f1f1f]">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white rounded-none"
          >
            {isLoading ? "Deletando..." : "Deletar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}