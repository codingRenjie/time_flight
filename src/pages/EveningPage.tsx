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
  const [pool, setPool] = useState(() =>
    settings.templates
      .filter((t) => t.isEnabled)
      .map((t) => ({
        id: t.id,
        type: t.type,
        title: t.title,
        minutes: t.defaultDurationMinutes,
        isDeletable: t.isDeletable,
      })),
  );
  const [newTitle, setNewTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState(20);

  const inPlanIds = new Set(drafts.map((d) => d.templateId));

  const togglePlan = (item: (typeof pool)[number]) => {
    if (item.type === 'mandatory' || item.type === 'break') return;
    if (inPlanIds.has(item.id)) {
      setDrafts((d) => d.filter((x) => x.templateId !== item.id));
      return;
    }
    const minutes = Math.min(120, Math.max(1, Math.round(item.minutes) || 1));
    const tpl: BlockTemplate = {
      id: item.id,
      type: item.type,
      title: item.title,
      defaultDurationMinutes: minutes,
      minimumDurationMinutes: minutes,
      isDeletable: item.isDeletable,
      isEnabled: true,
    };
    setDrafts((d) => [...d, templateToDraft(tpl)]);
  };

  const setPoolMinutes = (id: string, raw: string) => {
    const minutes = raw === '' ? 0 : Number(raw);
    setPool((p) => p.map((x) => (x.id === id ? { ...x, minutes } : x)));
  };

  const commitPoolMinutes = (id: string, minutes: number) => {
    const next = Math.min(120, Math.max(1, Math.round(minutes) || 1));
    setPool((p) => p.map((x) => (x.id === id ? { ...x, minutes: next } : x)));
    setDrafts((d) =>
      d.map((x) =>
        x.templateId === id
          ? { ...x, plannedDurationMinutes: next, minimumDurationMinutes: next }
          : x,
      ),
    );
    const templates = settings.templates.map((t) =>
      t.id === id ? { ...t, defaultDurationMinutes: next, minimumDurationMinutes: next } : t,
    );
    if (settings.templates.some((t) => t.id === id)) {
      void updateSettings({ ...settings, templates });
    }
  };

  const removePoolTask = (id: string) => {
    const item = pool.find((x) => x.id === id);
    if (!item?.isDeletable || item.type === 'mandatory' || item.type === 'break') return;
    setPool((p) => p.filter((x) => x.id !== id));
    setDrafts((d) => d.filter((x) => x.templateId !== id));
    void updateSettings({
      ...settings,
      templates: settings.templates.filter((t) => t.id !== id),
    });
  };

  const createPoolTask = async () => {
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
    setPool((p) => [
      ...p,
      { id: tpl.id, type: tpl.type, title, minutes, isDeletable: true },
    ]);
    setNewTitle('');
    setNewMinutes(20);
  };

  return (
    <div className="evening-plan-col">
      <p className="page-step">第 1 步 · 今晚飞哪些</p>

      <section className="card task-pool">
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>执飞任务池</h3>
        <p className="route-hint">改时长，点加入或移出。带绿色勾的就是今晚要飞的。</p>
        <div className="pool-grid">
          {pool.map((item) => {
            const inPlan = inPlanIds.has(item.id);
            return (
              <div key={item.id} className={`pool-card${inPlan ? ' in-plan' : ''}`}>
                {item.isDeletable && item.type !== 'mandatory' && item.type !== 'break' && (
                  <button
                    type="button"
                    className="pool-delete"
                    aria-label={`删除 ${item.title}`}
                    onClick={() => removePoolTask(item.id)}
                  >
                    ×
                  </button>
                )}
                <div className="pool-title">
                  <span className="pool-name-text">{item.title}</span>
                  {inPlan && (
                    <span className="pool-in-plan" aria-label="已在今天的航程里">
                      ✓
                    </span>
                  )}
                  {item.type === 'break' && <span className="badge pool-flag">刚性</span>}
                  {item.type === 'mandatory' && <span className="badge pool-flag">必做</span>}
                </div>
                <label className="pool-time">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    inputMode="numeric"
                    value={item.minutes || ''}
                    onChange={(e) => setPoolMinutes(item.id, e.target.value)}
                    onBlur={() => commitPoolMinutes(item.id, item.minutes)}
                  />
                  <span>分钟</span>
                </label>
                {item.type === 'mandatory' || item.type === 'break' ? (
                  <p className="pool-locked">不可移除</p>
                ) : (
                  <button className="btn btn-secondary btn-block" onClick={() => togglePlan(item)}>
                    {inPlan ? '移出航程' : '加入航程'}
                  </button>
                )}
              </div>
            );
          })}
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
              onClick={() => void createPoolTask()}
            >
              放入任务池
            </button>
          </div>
        </div>

        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 16 }}
          disabled={overflowMinutes > 0}
          onClick={() => navigate('/evening/order')}
        >
          {overflowMinutes > 0 ? '时间已超出，请先调整' : '确认任务清单'}
        </button>
      </section>
    </div>
  );
}
