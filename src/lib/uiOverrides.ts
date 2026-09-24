/**
 * UI 试验台的设计变量覆盖层。
 *
 * 原理：全局样式由 :root 上的 CSS 变量驱动，试验台拖滑杆时
 * 直接 document.documentElement.style.setProperty() 内联覆盖，
 * 全站即时生效；同时写入 localStorage，刷新/重启后自动恢复。
 * 调好后把导出数值发给开发，写回 global.css 的 :root 即固化。
 */

export interface UiToken {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: 'px' | 'rem';
  fallback: number;
}

/** 试验台可调的设计变量（新增变量在这里注册即可） */
export const UI_TOKENS: UiToken[] = [
  { key: '--btn-radius', label: '按钮圆角', min: 0, max: 24, step: 1, unit: 'px', fallback: 12 },
  { key: '--touch', label: '按钮高度', min: 40, max: 64, step: 1, unit: 'px', fallback: 48 },
  { key: '--btn-padding-x', label: '按钮横向留白', min: 12, max: 32, step: 1, unit: 'px', fallback: 20 },
  { key: '--btn-font', label: '按钮字号', min: 0.85, max: 1.2, step: 0.01, unit: 'rem', fallback: 1 },
  { key: '--radius', label: '卡片圆角', min: 8, max: 28, step: 1, unit: 'px', fallback: 16 },
];

const STORAGE_KEY = 'ui-lab-overrides-v1';

export function getOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** 应用启动时调用：把上次试验台调好的数值恢复到 :root */
export function applyOverrides(): void {
  const saved = getOverrides();
  for (const [key, value] of Object.entries(saved)) {
    document.documentElement.style.setProperty(key, value);
  }
}

export function setOverride(key: string, cssValue: string): void {
  document.documentElement.style.setProperty(key, cssValue);
  const saved = getOverrides();
  saved[key] = cssValue;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

export function clearOverrides(): void {
  const saved = getOverrides();
  for (const key of Object.keys(saved)) {
    document.documentElement.style.removeProperty(key);
  }
  localStorage.removeItem(STORAGE_KEY);
}

/** 导出为「变量: 值」文本，方便截图/粘贴给开发固化 */
export function exportOverrides(): string {
  const saved = getOverrides();
  const lines = UI_TOKENS.map((t) => {
    const v = saved[t.key];
    return `${t.label} ${t.key}: ${v ?? `${t.fallback}${t.unit}`}（默认 ${t.fallback}${t.unit}）`;
  });
  return lines.join('\n');
}
