import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { createDefaultPlanDrafts } from '@/lib/defaults';
import { computePlanBudget } from '@/lib/sessionLogic';
import { getWindowBounds } from '@/lib/time';
import type { PlanBlockDraft } from '@/types';

export type EveningPlanContext = {
  drafts: PlanBlockDraft[];
  setDrafts: Dispatch<SetStateAction<PlanBlockDraft[]>>;
  freeMinutes: number;
  overflowMinutes: number;
  usedMinutes: number;
  totalMinutes: number;
};

export function useEveningPlan() {
  return useOutletContext<EveningPlanContext>();
}

export function EveningLayout() {
  const { settings, session, blocks, resetToday } = useApp();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<PlanBlockDraft[]>(() => createDefaultPlanDrafts(settings));

  const { totalMinutes } = useMemo(
    () => getWindowBounds(settings.windowStart, settings.windowEnd, settings.demoMode),
    [settings],
  );

  const { freeMinutes, overflowMinutes, usedMinutes } = useMemo(
    () => computePlanBudget(totalMinutes, drafts),
    [totalMinutes, drafts],
  );

  const windowLabel = settings.demoMode
    ? '试用模式 · 从现在开始 120 分钟'
    : `${settings.windowStart} — ${settings.windowEnd}`;

  if (session && session.status !== 'dayEnd') {
    const current = blocks.find((b) => b.id === session.currentBlockId);
    return (
      <div>
        <h1 className="page-title">航程进行中</h1>
        <p className="page-subtitle">当前：{current?.title ?? '执飞中'}</p>
        <div className="card">
          <p>今晚航程已起飞。继续当前航段，或在设置中重置今日航程。</p>
          <div className="btn-row">
            {current && current.type !== 'free' && (
              <button className="btn btn-primary" onClick={() => navigate(`/fly/${current.id}`)}>
                回到执飞
              </button>
            )}
            {session.status === 'freeFly' && (
              <button className="btn btn-primary" onClick={() => navigate('/free')}>
                自由飞行
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => void resetToday()}>
              重置今日航程
            </button>
          </div>
        </div>
      </div>
    );
  }

  const fuelFill = Math.min(100, (usedMinutes / totalMinutes) * 100);

  return (
    <div className="evening-page">
      <h1 className="page-title">今晚总燃料：{totalMinutes} 分钟</h1>
      <p className="page-subtitle">
        这 {totalMinutes} 分钟里，你来排航班。{windowLabel}
      </p>

      <div className={`fuel-sticky card ${overflowMinutes > 0 ? 'is-overflow' : ''}`}>
        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">{overflowMinutes > 0 ? '时间溢出' : '预计自由飞'}</div>
            <div
              className="stat-value"
              style={{
                color:
                  overflowMinutes > 0
                    ? 'var(--danger)'
                    : freeMinutes > 0
                      ? 'var(--success)'
                      : 'var(--warn)',
              }}
            >
              {overflowMinutes > 0 ? `超出 ${overflowMinutes} 分钟` : `${freeMinutes} 分钟`}
            </div>
          </div>
        </div>
        <div className="fuel-bar">
          <div
            className={`fuel-bar-fill ${overflowMinutes > 0 ? 'danger' : ''}`}
            style={{ width: `${fuelFill}%` }}
          />
        </div>
        {overflowMinutes > 0 ? (
          <p className="fuel-overflow-hint">
            航程已超过今晚 {totalMinutes} 分钟，请先删减任务或缩短时长。
          </p>
        ) : (
          <p className="fuel-help">
            加学习块会挤占自由飞；提前进港会把省下的时间平均分给后续航段。水果经停为刚性时长（可调顺序）；自由飞恒为最后一程。
          </p>
        )}
      </div>

      <Outlet
        context={
          {
            drafts,
            setDrafts,
            freeMinutes,
            overflowMinutes,
            usedMinutes,
            totalMinutes,
          } satisfies EveningPlanContext
        }
      />
    </div>
  );
}
