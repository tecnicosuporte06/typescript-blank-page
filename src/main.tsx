import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SystemCustomizationProvider } from './contexts/SystemCustomizationContext'

// Remover favicons padrão do Lovable imediatamente
const existingFavicons = document.querySelectorAll("link[rel*='icon'], link[rel*='shortcut']");
existingFavicons.forEach(link => link.remove());
// Adicionar favicon customizado após remover os padrões
const link = document.createElement('link');
link.rel = 'icon';
link.type = 'image/x-icon';
link.href = '/favicon.ico';
document.head.appendChild(link);

// Aplicar tema salvo imediatamente ao carregar
const savedTheme = localStorage.getItem('theme');
if (savedTheme && savedTheme !== 'light') {
  document.documentElement.classList.add(savedTheme);
}

createRoot(document.getElementById("root")!).render(
  <SystemCustomizationProvider>
    <App />
  </SystemCustomizationProvider>
);
