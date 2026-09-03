import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { templateToDraft } from '@/lib/defaults';
import { createId } from '@/lib/id';
import { useEveningPlan } from '@/pages/EveningLayout';
import type { BlockTemplate } from '@/types';

export function EveningPage() {
  const { settings, updateSettings } = useApp();
  const { drafts, setDrafts, overflowMinutes } = useEveningPlan();
  const navigate = useNavigate();
  const [newTitle, setNewTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState(20);

  const setDraftMinutes = (templateId: string, raw: string) => {
    const minutes = raw === '' ? 0 : Number(raw);
    setDrafts((d) =>
      d.map((x) =>
        x.templateId === templateId
          ? { ...x, plannedDurationMinutes: minutes, minimumDurationMinutes: minutes }
          : x,
      ),
    );
  };

  const commitDraftMinutes = (templateId: string, minutes: number) => {
    const next = Math.min(120, Math.max(1, Math.round(minutes) || 1));
    setDrafts((d) =>
      d.map((x) =>
        x.templateId === templateId
          ? { ...x, plannedDurationMinutes: next, minimumDurationMinutes: next }
          : x,
      ),
    );
    const templates = settings.templates.map((t) =>
      t.id === templateId ? { ...t, defaultDurationMinutes: next, minimumDurationMinutes: next } : t,
    );
    if (settings.templates.some((t) => t.id === templateId)) {
      void updateSettings({ ...settings, templates });
    }
  };

  const removeTask = (templateId: string) => {
    const item = drafts.find((x) => x.templateId === templateId);
    if (!item?.isDeletable || item.type === 'mandatory' || item.type === 'break') return;
    setDrafts((d) => d.filter((x) => x.templateId !== templateId));
    void updateSettings({
      ...settings,
      templates: settings.templates.filter((t) => t.id !== templateId),
    });
  };

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const minutes = Math.min(120, Math.max(1, Math.round(Number(newMinutes)) || 20));
    const tpl: BlockTemplate = {
      id: createId(),
      type: 'study',
      title,
      defaultDurationMinutes: minutes,
      minimumDurationMinutes: minutes,
      isDeletable: true,
      isEnabled: true,
    };
    await updateSettings({ ...settings, templates: [...settings.templates, tpl] });
    setDrafts((d) => [...d, templateToDraft(tpl)]);
    setNewTitle('');
    setNewMinutes(20);
  };

  return (
    <div className="evening-plan-col">
      <p className="page-step">第 1 步 · 今晚飞哪些</p>

      <section className="card task-pool">
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>执飞任务池</h3>
        <p className="route-hint">这里的任务都会飞。改时长；学习块可点右上角 × 删除。</p>
        <div className="pool-grid">
          {drafts.map((item) => (
            <div key={item.id} className="pool-card">
              {item.isDeletable && item.type !== 'mandatory' && item.type !== 'break' && (
                <button
                  type="button"
                  className="pool-delete"
                  aria-label={`删除 ${item.title}`}
                  onClick={() => removeTask(item.templateId)}
                >
                  ×
                </button>
              )}
              <div className="pool-title">
                <span className="pool-name-text">{item.title}</span>
                {item.type === 'break' && <span className="badge pool-flag">刚性</span>}
                {item.type === 'mandatory' && <span className="badge pool-flag">必做</span>}
              </div>
              <label className="pool-time">
                <input
                  type="number"
                  min={1}
                  max={120}
                  inputMode="numeric"
                  value={item.plannedDurationMinutes || ''}
                  onChange={(e) => setDraftMinutes(item.templateId, e.target.value)}
                  onBlur={() => commitDraftMinutes(item.templateId, item.plannedDurationMinutes)}
                />
                <span>分钟</span>
              </label>
              {(item.type === 'mandatory' || item.type === 'break') && (
                <p className="pool-locked">不可移除</p>
              )}
            </div>
          ))}
          <div className="pool-card is-new">
            <div className="pool-title">新建任务</div>
            <input
              className="pool-name"
              placeholder="名称，如：英语听力"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <label className="pool-time">
              <input
                type="number"
                min={1}
                max={120}
                inputMode="numeric"
                value={newMinutes || ''}
                onChange={(e) => setNewMinutes(Number(e.target.value) || 0)}
                onBlur={() => setNewMinutes((m) => Math.min(120, Math.max(1, m || 20)))}
              />
              <span>分钟</span>
            </label>
            <button
              className="btn btn-secondary btn-block"
              disabled={!newTitle.trim()}
              onClick={() => void addTask()}
            >
              加入航程
            </button>
          </div>
        </div>

        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 16 }}
          disabled={overflowMinutes > 0}
          onClick={() => navigate('/evening/order')}
        >
          {overflowMinutes > 0 ? '时间已超出，请先调整' : '确认执飞任务'}
        </button>
      </section>
    </div>
  );
}
