import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SystemCustomizationProvider } from './contexts/SystemCustomizationContext'

// Aplicar tema salvo imediatamente ao carregar
const savedTheme = localStorage.getItem('theme');
if (savedTheme && savedTheme !== 'light') {
  document.documentElement.classList.add(savedTheme);
}

// Silenciar erros de carregamento de imagens do WhatsApp (403/404)
window.addEventListener('error', (event) => {
  const target = event.target as HTMLElement;
  if (target?.tagName === 'IMG') {
    const src = (target as HTMLImageElement).src || '';
    // Silenciar erros de imagens do WhatsApp
    if (src.includes('pps.whatsapp.net') || src.includes('mmg.whatsapp.net')) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }
}, true);

createRoot(document.getElementById("root")!).render(
  <SystemCustomizationProvider>
    <App />
  </SystemCustomizationProvider>
);
