/**
 * Sanitiza o nome de um arquivo para ser compatível com Supabase Storage
 * Remove acentos, substitui espaços por underscores e remove caracteres especiais
 * 
 * @param fileName - Nome original do arquivo
 * @returns Nome sanitizado seguro para uso no storage
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName) return '';
  
  // Separar nome e extensão
  const lastDotIndex = fileName.lastIndexOf('.');
  const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
  const extension = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';
  
  // Normalizar acentos (NFD = Normalized Form Decomposed)
  let sanitized = nameWithoutExt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove diacríticos (acentos)
  
  // Substituir espaços por underscores
  sanitized = sanitized.replace(/\s+/g, '_');
  
  // Remover caracteres especiais, mantendo apenas letras, números, hífens e underscores
  sanitized = sanitized.replace(/[^a-zA-Z0-9_-]/g, '');
  
  // Remover underscores múltiplos consecutivos
  sanitized = sanitized.replace(/_+/g, '_');
  
  // Remover underscores no início e fim
  sanitized = sanitized.replace(/^_+|_+$/g, '');
  
  // Se ficou vazio após sanitização, usar nome padrão
  if (!sanitized) {
    sanitized = 'arquivo';
  }
  
  // Limitar tamanho (máximo 200 caracteres para o nome)
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }
  
  // Retornar nome sanitizado + extensão
  return sanitized + extension;
}

