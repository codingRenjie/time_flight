import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Modal } from '@/components/Modal';
import { Stepper } from '@/components/Stepper';
import {
  TASK_DURATION_MAX,
  TASK_DURATION_MIN,
  TASK_DURATION_STEP,
  clampTaskDuration,
} from '@/lib/defaults';
import { computeSlackMinutes } from '@/lib/sessionLogic';
import { getWindowBounds } from '@/lib/time';
import { createId } from '@/lib/id';
import type { PlanTaskDraft } from '@/types';

function fmt(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const text = h > 0 ? `${h}小时${m > 0 ? `${m}分钟` : ''}` : `${m}分钟`;
  return minutes < 0 ? `-${text}` : text;
}

/** 页面02：航程设定页 */
export function PlanPage() {
  const navigate = useNavigate();
  const { planDraft, setPlanTasks, settings, updateSettings } = useApp();
  const [aircraftModal, setAircraftModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState(30);

  useEffect(() => {
    if (!planDraft) navigate('/start', { replace: true });
  }, [planDraft, navigate]);

  const totalMinutes = useMemo(
    () => (planDraft ? getWindowBounds(planDraft.windowStart, planDraft.windowEnd).totalMinutes : 0),
    [planDraft],
  );

  if (!planDraft) return null;

  const tasks = planDraft.tasks;
  const remaining = computeSlackMinutes(totalMinutes, tasks);
  const overflow = remaining < 0;
  const aircraft =
    settings.aircrafts.find((a) => a.id === settings.selectedAircraftId) ?? settings.aircrafts[0];

  const updateTask = (id: string, minutes: number) => {
    setPlanTasks(
      tasks.map((t) =>
        t.id === id ? { ...t, plannedDurationMinutes: clampTaskDuration(minutes) } : t,
      ),
    );
  };

  const removeTask = (id: string) => {
    setPlanTasks(tasks.filter((t) => t.id !== id));
  };

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    const draft: PlanTaskDraft = {
      id: createId(),
      templateId: null,
      type: 'custom',
      title,
      plannedDurationMinutes: clampTaskDuration(newMinutes),
      isFixed: false,
    };
    setPlanTasks([...tasks, draft]);
    setNewTitle('');
    setNewMinutes(30);
  };

  return (
    <div className="page plan-page">
      <header className="page-topbar">
        <button className="icon-btn" aria-label="返回" onClick={() => navigate('/start')}>
          ‹
        </button>
        <div className="topbar-title">航程设定</div>
        <div style={{ width: 44 }} />
      </header>

      <button className="aircraft-card" onClick={() => setAircraftModal(true)}>
        <img src={aircraft.image} alt={aircraft.name} className="aircraft-img" />
        <div className="aircraft-meta">
          <div className="aircraft-label">执飞机型</div>
          <div className="aircraft-name">{aircraft.name}</div>
        </div>
        <span className="aircraft-change">更换 ›</span>
      </button>

      <div className={`fuel-summary card ${overflow ? 'is-overflow' : ''}`}>
        <div className="fuel-line">
          可规划航程时长 <strong>{fmt(totalMinutes)}</strong>
        </div>
        <div className={`fuel-line ${overflow ? 'danger' : ''}`}>
          {overflow ? (
            <>
              超出 <strong>{fmt(-remaining)}</strong>，装不下这么多任务，请调整
            </>
          ) : (
            <>
              剩余 <strong>{fmt(remaining)}</strong> 可规划
            </>
          )}
        </div>
      </div>

      <div className="pool-grid">
        <div className="pool-card is-new">
          <div className="pool-title">＋ 新建任务</div>
          <input
            className="pool-name"
            placeholder="任务名称"
            value={newTitle}
            maxLength={12}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <Stepper
            value={newMinutes}
            onChange={setNewMinutes}
            min={TASK_DURATION_MIN}
            max={TASK_DURATION_MAX}
            step={TASK_DURATION_STEP}
          />
          <button className="btn btn-primary" disabled={!newTitle.trim()} onClick={addTask}>
            添加到航程
          </button>
        </div>

        {tasks.map((t) => (
          <div key={t.id} className={`pool-card ${t.isFixed ? 'is-fixed' : ''}`}>
            <div className="pool-title">
              <span className="pool-name-text">{t.title}</span>
              {t.isFixed && <span className="badge">固定</span>}
            </div>
            <Stepper
              value={t.plannedDurationMinutes}
              onChange={(v) => updateTask(t.id, v)}
              min={TASK_DURATION_MIN}
              max={TASK_DURATION_MAX}
              step={TASK_DURATION_STEP}
            />
            {t.isFixed ? (
              <p className="pool-locked">固定任务 · 不可移除</p>
            ) : (
              <button className="btn btn-secondary" onClick={() => removeTask(t.id)}>
                移出航程
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="page-actions">
        <button
          className="btn btn-primary btn-block btn-lg"
          disabled={overflow || tasks.length === 0}
          onClick={() => navigate('/order')}
        >
          {tasks.length === 0 ? '请先添加任务' : '准备执飞'}
        </button>
      </div>

      <Modal open={aircraftModal} onClose={() => setAircraftModal(false)}>
        <h2>选择机型</h2>
        <div className="aircraft-list">
          {settings.aircrafts.map((a) => (
            <button
              key={a.id}
              className={`aircraft-option ${a.id === settings.selectedAircraftId ? 'is-selected' : ''} ${a.unlocked ? '' : 'is-locked'}`}
              disabled={!a.unlocked}
              onClick={() => {
                void updateSettings({ ...settings, selectedAircraftId: a.id });
                setAircraftModal(false);
              }}
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
      </Modal>
    </div>
  );
}
