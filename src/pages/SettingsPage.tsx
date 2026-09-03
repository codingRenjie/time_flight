import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { createId } from '@/lib/id';
import { isFixedModule, keepFixedModuleSettings } from '@/lib/defaults';
import type { AppSettings, BlockTemplate } from '@/types';

export function SettingsPage() {
  const { settings, updateSettings, resetToday } = useApp();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState(15);
  const [newKind, setNewKind] = useState<'mandatory' | 'break'>('mandatory');

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const fixedTemplates = draft.templates.filter(isFixedModule);

  const save = async () => {
    await updateSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateFixedMinutes = (id: string, raw: string) => {
    const val = Number(raw) || 1;
    setDraft({
      ...draft,
      templates: draft.templates.map((t) =>
        t.id === id
          ? {
              ...t,
              defaultDurationMinutes: val,
              minimumDurationMinutes: val,
            }
          : t,
      ),
    });
  };

  const removeFixed = (id: string) => {
    setDraft({
      ...draft,
      templates: draft.templates.filter((t) => t.id !== id),
    });
  };

  const addFixed = () => {
    const title = newTitle.trim();
    if (!title) return;
    const minutes = Math.min(120, Math.max(1, Math.round(Number(newMinutes)) || 15));
    const tpl: BlockTemplate = {
      id: createId(),
      type: newKind,
      title,
      defaultDurationMinutes: minutes,
      minimumDurationMinutes: minutes,
      isDeletable: false,
      isEnabled: true,
    };
    setDraft({ ...draft, templates: [...draft.templates, tpl] });
    setNewTitle('');
    setNewMinutes(15);
    setNewKind('mandatory');
  };

  return (
    <div>
      <h1 className="page-title">系统设置</h1>

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
        <h3 style={{ marginTop: 0 }}>固定执飞模块设置</h3>
        <p className="route-hint">
          这些模块每晚默认在航程里，孩子不能移出。可改时长，也可在此新增或删除。
        </p>
        {fixedTemplates.map((t) => (
          <div key={t.id} className="settings-fixed-row">
            <span className="settings-fixed-name">
              {t.title}
              <span className="badge">{t.type === 'break' ? '刚性' : '必做'}</span>
            </span>
            <input
              type="number"
              min={1}
              max={120}
              value={t.defaultDurationMinutes}
              onChange={(e) => updateFixedMinutes(t.id, e.target.value)}
            />
            <span>分钟</span>
            <button
              type="button"
              className="settings-fixed-delete"
              aria-label={`删除 ${t.title}`}
              onClick={() => removeFixed(t.id)}
            >
              ×
            </button>
          </div>
        ))}
        <div className="settings-fixed-add">
          <input
            className="pool-name"
            placeholder="名称，如：听写"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <input
            type="number"
            min={1}
            max={120}
            value={newMinutes || ''}
            onChange={(e) => setNewMinutes(Number(e.target.value) || 0)}
          />
          <span>分钟</span>
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value === 'break' ? 'break' : 'mandatory')}
          >
            <option value="mandatory">必做</option>
            <option value="break">经停（刚性）</option>
          </select>
          <button
            className="btn btn-secondary"
            disabled={!newTitle.trim()}
            onClick={addFixed}
          >
            新增模块
          </button>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => void save()}>
          保存设置
        </button>
        {saved && <span style={{ color: 'var(--success)', alignSelf: 'center' }}>已保存</span>}
        <button
          className="btn btn-danger"
          onClick={() => {
            void (async () => {
              await updateSettings(keepFixedModuleSettings(draft));
              await resetToday();
              navigate('/evening');
            })();
          }}
        >
          重置今日航程
        </button>
      </div>
    </div>
  );
}
