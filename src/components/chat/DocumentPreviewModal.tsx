import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { X, Download, FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName?: string;
  fileType?: string;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  fileType,
}) => {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName || 'documento';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isPdf = fileType?.toLowerCase().includes('pdf') || fileName?.toLowerCase().endsWith('.pdf');
  const isImage = fileType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName || '');
  const isText = fileType?.includes('text/') || /\.(txt|csv|json|xml|md)$/i.test(fileName || '');

  // Determine preview method
  const renderPreview = () => {
    if (isPdf || isText) {
      return (
        <iframe
          src={fileUrl}
          className="w-full h-[70vh] border-none bg-white"
          title={fileName || "Documento"}
        />
      );
    } else if (isImage) {
      return (
        <div className="flex items-center justify-center h-[70vh]">
           <img
            src={fileUrl}
            alt={fileName || 'Imagem'}
            className="max-w-full max-h-full object-contain border border-gray-300 bg-white shadow-sm"
          />
        </div>
      );
    } else {
      // Fallback for Office docs or unknown types: Google Docs Viewer or generic message
      // Using Google Docs Viewer for office documents might be better if URLs are public
      // But for now, let's show a message and a button to open externally if it's not directly embeddable
      return (
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4 bg-white">
          <FileText className="h-24 w-24 text-gray-300" />
          <div className="text-center space-y-2">
            <h3 className="font-semibold text-gray-900">Visualização indisponível</h3>
            <p className="text-sm text-gray-500 max-w-xs mx-auto">
              Este tipo de arquivo não pode ser visualizado diretamente.
              Por favor, baixe o arquivo ou abra em uma nova aba.
            </p>
          </div>
          <div className="flex gap-3">
             <Button variant="outline" onClick={() => window.open(fileUrl, '_blank')}>
               <ExternalLink className="h-4 w-4 mr-2" />
               Abrir em nova aba
             </Button>
             <Button onClick={handleDownload}>
               <Download className="h-4 w-4 mr-2" />
               Baixar arquivo
             </Button>
          </div>
        </div>
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full p-0 gap-0 border-gray-300 bg-white rounded-none shadow-lg [&>button]:hidden">
        <div className="flex flex-row items-center justify-between px-4 py-2 bg-[#f8f9fa] border-b border-gray-300">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <DialogTitle className="text-sm font-semibold text-gray-800 truncate max-w-[300px] p-0">
              {fileName || 'Visualização de Documento'}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(fileUrl, '_blank')}
              className="h-7 w-7 rounded-none hover:bg-gray-200 text-gray-600"
              title="Abrir em nova aba"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="h-7 w-7 rounded-none hover:bg-gray-200 text-gray-600"
              title="Baixar"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 rounded-none hover:bg-red-100 hover:text-red-600 text-gray-500"
              title="Fechar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="bg-[#e6e6e6] flex flex-col min-h-[300px]">
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
};





