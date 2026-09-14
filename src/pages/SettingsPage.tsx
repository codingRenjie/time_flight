import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Stepper } from '@/components/Stepper';
import {
  TASK_DURATION_MAX,
  TASK_DURATION_MIN,
  TASK_DURATION_STEP,
  clampTaskDuration,
} from '@/lib/defaults';
import { createId } from '@/lib/id';

/** 页面09：系统设置页 */
export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSettings, session } = useApp();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskMinutes, setNewTaskMinutes] = useState(15);

  const addFixedTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    void updateSettings({
      ...settings,
      fixedTasks: [
        ...settings.fixedTasks,
        { id: createId(), title, defaultDurationMinutes: clampTaskDuration(newTaskMinutes) },
      ],
    });
    setNewTaskTitle('');
    setNewTaskMinutes(15);
  };

  const removeFixedTask = (id: string) => {
    void updateSettings({
      ...settings,
      fixedTasks: settings.fixedTasks.filter((t) => t.id !== id),
    });
  };

  const updateFixedMinutes = (id: string, minutes: number) => {
    void updateSettings({
      ...settings,
      fixedTasks: settings.fixedTasks.map((t) =>
        t.id === id ? { ...t, defaultDurationMinutes: clampTaskDuration(minutes) } : t,
      ),
    });
  };

  return (
    <div className="page settings-page">
      <header className="page-topbar">
        <button
          className="icon-btn"
          aria-label="返回"
          onClick={() => navigate(session ? '/takeoff' : '/start')}
        >
          ‹
        </button>
        <div className="topbar-title">系统设置</div>
        <div style={{ width: 44 }} />
      </header>

      <div className="settings-hero">
        <img src="/assets/captain-avatar.png" alt="机长头像" className="settings-avatar" />
        <div>
          <div className="settings-name">时光机长</div>
          <div className="settings-stats">
            已完成 {settings.stats.completedVoyages} 次航程 · 累计飞行{' '}
            {settings.stats.totalFlownMinutes} 分钟
          </div>
        </div>
      </div>

      <section className="card">
        <h3 className="settings-section-title">✈️ 飞机机型配置</h3>
        <div className="aircraft-list">
          {settings.aircrafts.map((a) => (
            <button
              key={a.id}
              className={`aircraft-option ${a.id === settings.selectedAircraftId ? 'is-selected' : ''} ${a.unlocked ? '' : 'is-locked'}`}
              disabled={!a.unlocked}
              onClick={() => void updateSettings({ ...settings, selectedAircraftId: a.id })}
            >
              <img src={a.image} alt={a.name} />
              <div>
                <div className="aircraft-name">{a.name}</div>
                {!a.unlocked && <div className="aircraft-lock">🔒 {a.unlockHint}</div>}
              </div>
              {a.id === settings.selectedAircraftId && a.unlocked && (
                <span className="aircraft-check">✓</span>
              )}
            </button>
          ))}
        </div>
        <p className="settings-hint">完成更多航程，即可解锁新机型</p>
      </section>

      <section className="card">
        <h3 className="settings-section-title">📌 默认固定执飞任务</h3>
        <p className="settings-hint">每次规划航程时自动加入任务池，不可移除</p>
        {settings.fixedTasks.map((t) => (
          <div key={t.id} className="settings-fixed-row">
            <span className="settings-fixed-name">{t.title}</span>
            <Stepper
              value={t.defaultDurationMinutes}
              onChange={(v) => updateFixedMinutes(t.id, v)}
              min={TASK_DURATION_MIN}
              max={TASK_DURATION_MAX}
              step={TASK_DURATION_STEP}
            />
            <button
              className="settings-fixed-delete"
              aria-label={`删除 ${t.title}`}
              onClick={() => removeFixedTask(t.id)}
            >
              ×
            </button>
          </div>
        ))}
        <div className="settings-fixed-add">
          <input
            className="pool-name"
            placeholder="新任务名称"
            maxLength={12}
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
          />
          <Stepper
            value={newTaskMinutes}
            onChange={setNewTaskMinutes}
            min={TASK_DURATION_MIN}
            max={TASK_DURATION_MAX}
            step={TASK_DURATION_STEP}
          />
          <button className="btn btn-primary" disabled={!newTaskTitle.trim()} onClick={addFixedTask}>
            添加
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="settings-section-title">🔆 陪伴体验</h3>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.keepScreenOn}
            onChange={(e) =>
              void updateSettings({ ...settings, keepScreenOn: e.target.checked })
            }
          />
          <span>执飞期间保持屏幕常亮</span>
        </label>
        <p className="settings-hint">
          常亮时计时器全程可见，较耗电；关闭后手机会自动锁屏，白噪音仍在后台继续播放
        </p>
      </section>

      <section className="card">
        <h3 className="settings-section-title">⏱ 延长航程</h3>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.voyageExtendEnabled}
            onChange={(e) =>
              void updateSettings({ ...settings, voyageExtendEnabled: e.target.checked })
            }
          />
          <span>允许执飞过程中延长航程总时间</span>
        </label>
        {settings.voyageExtendEnabled && (
          <div className="settings-extend-row">
            <span>每次延长</span>
            <Stepper
              value={settings.voyageExtendMinutes}
              onChange={(v) => void updateSettings({ ...settings, voyageExtendMinutes: v })}
              min={10}
              max={60}
              step={10}
            />
            <span className="settings-hint">每航程限用一次</span>
          </div>
        )}
      </section>
    </div>
  );
}
