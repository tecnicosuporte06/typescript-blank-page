import React, { forwardRef, useImperativeHandle, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { parseActionText } from "@/lib/action-parser";
import { ActionBadge } from "./action-badge";

export interface ActionBadgeData {
  id: string;
  type: string;
  label: string;
  data: Record<string, any>;
  position: number;
}

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export interface PromptEditorRef {
  getCursorPosition: () => number;
  insertText: (text: string) => void;
}

export const PromptEditor = forwardRef<PromptEditorRef, PromptEditorProps>(({
  value,
  onChange,
  placeholder,
  className,
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const getCursorPosition = (): number => {
    if (!textareaRef.current) return 0;
    return textareaRef.current.selectionStart;
  };

  const insertText = (text: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = textarea.value;

    // Inserir texto na posição do cursor
    const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
    
    onChange(newValue);

    // Mover cursor para depois do texto inserido
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = start + text.length;
        textareaRef.current.setSelectionRange(newPosition, newPosition);
        textareaRef.current.focus();
      }
    }, 0);
  };

  useImperativeHandle(ref, () => ({
    getCursorPosition,
    insertText,
  }));

  // Parsear ações do texto
  const actions = useMemo(() => parseActionText(value), [value]);

  // Função para remover ação do texto
  const handleRemoveAction = (actionMatch: string, actionPosition: number) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const beforeAction = value.substring(0, actionPosition);
    const afterAction = value.substring(actionPosition + actionMatch.length);
    
    // Remover quebras de linha extras que possam ter sido adicionadas
    const newValue = (beforeAction + afterAction)
      .replace(/\n\n\n+/g, '\n\n') // Máximo 2 quebras de linha consecutivas
      .trim();
    
    onChange(newValue);
    
    // Restaurar foco e posição do cursor
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = Math.min(actionPosition, newValue.length);
        textareaRef.current.setSelectionRange(newPosition, newPosition);
        textareaRef.current.focus();
      }
    }, 0);
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          "w-full min-h-[400px] p-4 rounded-md border border-input bg-background",
          "font-mono text-sm resize-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "placeholder:text-muted-foreground",
          "dark:bg-[#1a1a1a] dark:text-gray-100 dark:border-gray-700 dark:placeholder:text-gray-500 dark:focus-visible:ring-offset-[#1a1a1a]",
          "relative z-0",
          className
        )}
        style={{ color: actions.length > 0 ? 'transparent' : undefined }}
      />
      
      {/* Overlay com badges renderizadas - apenas visual, não afeta o textarea */}
      {actions.length > 0 && (
        <div 
          className="absolute inset-0 p-4 pointer-events-none z-10 text-sm whitespace-pre-wrap break-words overflow-hidden"
          style={{ 
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          }}
        >
          {(() => {
            let lastIndex = 0;
            const elements: React.ReactNode[] = [];
            
            actions.forEach((action, idx) => {
              // Adicionar texto antes da ação
              if (action.position > lastIndex) {
                const beforeText = value.substring(lastIndex, action.position);
                if (beforeText) {
                  elements.push(
                    <span 
                      key={`text-${idx}`}
                      className="text-gray-900 dark:text-gray-100"
                    >
                      {beforeText}
                    </span>
                  );
                }
              }
              
              // Adicionar badge visual
              elements.push(
                <span
                  key={`action-${idx}`}
                  className="pointer-events-auto"
                  style={{ display: 'inline-block', margin: '0 2px' }}
                >
                  <ActionBadge
                    actionText={action.match}
                    onRemove={() => handleRemoveAction(action.match, action.position)}
                    showRemoveButton={true}
                  />
                </span>
              );
              
              lastIndex = action.position + action.match.length;
            });
            
            // Adicionar texto restante
            if (lastIndex < value.length) {
              const remainingText = value.substring(lastIndex);
              if (remainingText) {
                elements.push(
                  <span 
                    key="text-end"
                    className="text-gray-900 dark:text-gray-100"
                  >
                    {remainingText}
                  </span>
                );
              }
            }
            
            return elements;
          })()}
        </div>
      )}
    </div>
  );
});
