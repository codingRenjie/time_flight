import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UI_TOKENS,
  clearOverrides,
  exportOverrides,
  getOverrides,
  setOverride,
} from '@/lib/uiOverrides';

/** 当前生效值：覆盖值 > 默认值 */
function currentValue(key: string, fallback: number, unit: string): number {
  const raw = getOverrides()[key];
  if (!raw) return fallback;
  const n = parseFloat(raw.replace(unit, ''));
  return Number.isFinite(n) ? n : fallback;
}

/** UI 试验台：拖滑杆实时调全站按钮/卡片样式，调好后导出数值给开发固化 */
export function UiLabPage() {
  const navigate = useNavigate();
  // values 仅用于驱动滑杆受控显示；实际样式通过 setProperty 即时生效
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(UI_TOKENS.map((t) => [t.key, currentValue(t.key, t.fallback, t.unit)])),
  );
  const [copied, setCopied] = useState(false);

  const handleChange = (key: string, unit: string, v: number) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setOverride(key, `${v}${unit}`);
  };

  const handleReset = () => {
    clearOverrides();
    setValues(Object.fromEntries(UI_TOKENS.map((t) => [t.key, t.fallback])));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportOverrides());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用时用户可直接截图下方文本 */
    }
  };

  return (
    <div className="page">
      <header className="page-topbar">
        <button className="icon-btn" aria-label="返回" onClick={() => navigate(-1)}>
          ←
        </button>
        <div className="topbar-title">🧪 UI 试验台</div>
        <div style={{ width: 44 }} />
      </header>

      <p className="page-subtitle">
        拖滑杆实时预览全站样式（去其他页面也生效）。调好后点「复制数值」发给开发，或直接截图下方文本。
      </p>

      <section className="card lab-card">
        {UI_TOKENS.map((t) => (
          <div key={t.key} className="lab-row">
            <div className="lab-label">
              <span>{t.label}</span>
              <span className="lab-value">
                {values[t.key]}
                {t.unit}
              </span>
            </div>
            <input
              type="range"
              min={t.min}
              max={t.max}
              step={t.step}
              value={values[t.key]}
              onChange={(e) => handleChange(t.key, t.unit, Number(e.target.value))}
              className="lab-slider"
            />
          </div>
        ))}
      </section>

      <section className="card lab-card">
        <div className="lab-preview-title">实时预览</div>
        <div className="lab-preview">
          <button className="btn btn-primary">主按钮</button>
          <button className="btn btn-secondary">次按钮</button>
          <button className="btn btn-danger">危险按钮</button>
          <button className="btn btn-primary btn-lg btn-block">大按钮（页面主操作）</button>
        </div>
      </section>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={handleReset}>
          恢复默认
        </button>
        <button className="btn btn-primary" onClick={() => void handleCopy()}>
          {copied ? '✓ 已复制' : '复制数值'}
        </button>
      </div>

      <pre className="lab-export">{exportOverrides()}</pre>
    </div>
  );
}
