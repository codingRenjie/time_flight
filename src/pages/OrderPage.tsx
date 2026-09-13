import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { DragList } from '@/components/DragList';
import { getWindowBounds } from '@/lib/time';

/** 页面03：任务顺序页 */
export function OrderPage() {
  const navigate = useNavigate();
  const { planDraft, setPlanTasks, confirmPlan, settings } = useApp();

  useEffect(() => {
    if (!planDraft) navigate('/start', { replace: true });
  }, [planDraft, navigate]);

  if (!planDraft) return null;

  const totalMinutes = getWindowBounds(planDraft.windowStart, planDraft.windowEnd).totalMinutes;
  const aircraft =
    settings.aircrafts.find((a) => a.id === settings.selectedAircraftId) ?? settings.aircrafts[0];
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  const handleConfirm = async () => {
    await confirmPlan();
    navigate('/takeoff');
  };

  return (
    <div className="page order-page">
      <header className="page-topbar">
        <div style={{ width: 44 }} />
        <div className="topbar-title">任务顺序</div>
        <div style={{ width: 44 }} />
      </header>

      <div className="card order-summary">
        <img src={aircraft.image} alt={aircraft.name} className="aircraft-img" />
        <div>
          <div className="aircraft-name">{aircraft.name}</div>
          <div className="order-total">
            执飞总时长 {h > 0 ? `${h}小时` : ''}
            {m > 0 ? `${m}分钟` : ''} · 共 {planDraft.tasks.length} 项任务
          </div>
        </div>
      </div>

      <p className="route-hint">拖动胶囊，安排执飞顺序（固定任务也可以排序）</p>

      <DragList
        items={planDraft.tasks}
        keyOf={(t) => t.id}
        onReorder={setPlanTasks}
        renderItem={(t, handleProps) => (
          <div className={`route-item ${t.isFixed ? 'mandatory' : ''}`}>
            <span className="drag-handle" {...handleProps}>
              ⠿
            </span>
            <div className="route-meta">
              <div className="route-title">
                {t.title} {t.isFixed && <span className="badge">固定</span>}
              </div>
              <div className="route-duration">{t.plannedDurationMinutes} 分钟</div>
            </div>
          </div>
        )}
      />

      <div className="page-actions btn-row">
        <button className="btn btn-secondary" onClick={() => navigate('/plan')}>
          返回修改任务
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={() => void handleConfirm()}
        >
          立即执飞 ✈️
        </button>
      </div>
    </div>
  );
}
