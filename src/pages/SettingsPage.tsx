import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import type { AppSettings } from '@/types';

export function SettingsPage() {
  const { settings, updateSettings, resetToday } = useApp();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await updateSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h1 className="page-title">家长设置</h1>
      <p className="page-subtitle">配置窗口、模板与试用模式</p>

      <div className="card">
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={draft.demoMode}
            onChange={(e) => setDraft({ ...draft, demoMode: e.target.checked })}
          />
          <span>
            <strong>试用模式</strong>
            <br />
            <small style={{ color: 'var(--text-muted)' }}>
              开启后：点击「确认航程」即从当前时刻起算 120 分钟，无需等到 19:30。建议首次试用保持开启。
            </small>
          </span>
        </label>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <label>
            窗口开始
            <input
              type="time"
              value={draft.windowStart}
              disabled={draft.demoMode}
              onChange={(e) => setDraft({ ...draft, windowStart: e.target.value })}
              style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: 'none' }}
            />
          </label>
          <label>
            窗口结束
            <input
              type="time"
              value={draft.windowEnd}
              disabled={draft.demoMode}
              onChange={(e) => setDraft({ ...draft, windowEnd: e.target.value })}
              style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: 'none' }}
            />
          </label>
          <label>
            延长航程（分钟，每晚一次）
            <input
              type="number"
              min={5}
              max={30}
              value={draft.voyageExtendMinutes}
              onChange={(e) =>
                setDraft({ ...draft, voyageExtendMinutes: Number(e.target.value) || 10 })
              }
              style={{ width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: 'none' }}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>块模板默认时长</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          快速试玩可把「数学巩固」改为 3 分钟，便于体验超时联动扣减。
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 12 }}>
          孩子可在执飞页（非水果经停）使用「延长航程」：整晚仅一次，进港推迟至 21:40，10 分钟全部加在当前执飞航段预算。
        </p>
        {draft.templates.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ flex: 1 }}>{t.title}</span>
            <input
              type="number"
              min={1}
              max={120}
              value={t.defaultDurationMinutes}
              onChange={(e) => {
                const val = Number(e.target.value) || t.defaultDurationMinutes;
                const templates = [...draft.templates];
                templates[i] = {
                  ...t,
                  defaultDurationMinutes: val,
                  minimumDurationMinutes: val,
                };
                setDraft({ ...draft, templates });
              }}
              style={{ width: 80, padding: 8, borderRadius: 8, border: 'none' }}
            />
            <span>min</span>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => void save()}>
          保存设置
        </button>
        {saved && <span style={{ color: 'var(--success)', alignSelf: 'center' }}>已保存</span>}
        <button className="btn btn-danger" onClick={() => void resetToday()}>
          重置今日航程
        </button>
      </div>
    </div>
  );
}
