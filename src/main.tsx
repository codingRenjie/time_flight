import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { installDebugBeacon } from '@/lib/debugBeacon';
import { applyOverrides } from '@/lib/uiOverrides';
import { audioManager } from '@/lib/audio';

installDebugBeacon();

document.body.removeAttribute('style');
document.documentElement.removeAttribute('style');

// 恢复 UI 试验台上次调好的设计变量（若有）；
// 必须在上面两行 removeAttribute('style') 之后执行，否则内联覆盖会被清掉
applyOverrides();

// iOS 音频策略：WebAudio 必须在用户手势中创建/恢复。
// 全局首次触摸即解锁，保证页面01转盘咔哒声在第一次滚动前就就绪
// （unlock 是幂等的；intentionalPause 期间不会因此复活背景音）。
document.addEventListener('pointerdown', () => audioManager.unlock());

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
