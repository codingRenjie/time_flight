import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { installDebugBeacon } from '@/lib/debugBeacon';

installDebugBeacon();

document.body.removeAttribute('style');
document.documentElement.removeAttribute('style');

const rootEl = document.getElementById('root');

try {
  createRoot(rootEl!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
  document.getElementById('tf-static')?.remove();
} catch (err) {
  const banner = document.getElementById('tf-static');
  if (banner) {
    banner.textContent = `启动失败：${err instanceof Error ? err.message : String(err)}`;
  }
}
