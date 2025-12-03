import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CriarPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (nome: string) => void;
  isDarkMode?: boolean;
}

export function CriarPipelineModal({ isOpen, onClose, onSave, isDarkMode = false }: CriarPipelineModalProps) {
  const [nome, setNome] = useState("");

  const handleSave = () => {
    if (nome.trim()) {
      onSave(nome.trim());
      setNome("");
      onClose();
    }
  };

  const handleCancel = () => {
    setNome("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-md mx-auto border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0f0f0f] ${isDarkMode ? 'dark' : ''}`}>
        <DialogHeader>
          <DialogTitle className={`text-lg font-medium text-gray-900 dark:text-gray-100`}>
            Criar Pipeline
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="nome" className={`text-sm font-medium text-gray-700 dark:text-gray-200`}>
              Nome
            </Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Digite o nome do pipeline"
              className={`w-full dark:bg-[#1b1b1b] dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500`}
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-3 pt-4">
          <Button 
            variant="outline" 
            onClick={handleCancel}
            className="text-gray-600 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] bg-white dark:bg-[#141414]"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!nome.trim()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            Criar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}