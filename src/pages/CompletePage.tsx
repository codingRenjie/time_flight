import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { SkyBackground } from '@/components/SkyBackground';
import { Badge } from '@/components/Badge';
import { getTierLabel } from '@/lib/badges';
import { getSessionSummary, getTaskReviews } from '@/lib/sessionLogic';
import { taxiBackground } from '@/lib/aircraftMedia';
import type { BadgeTier } from '@/types';

/** 页面08：全部完成页 */
export function CompletePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, blocks, settings, resetVoyage } = useApp();
  // 本趟航程新获得的徽章（由进港页/再次起飞页通过路由 state 传入）
  const newBadge =
    (location.state as { newBadge?: BadgeTier | null } | null)?.newBadge ?? null;

  useEffect(() => {
    if (!session) navigate('/start', { replace: true });
  }, [session, navigate]);

  if (!session) return null;

  const summary = getSessionSummary(session, blocks);
  const reviews = getTaskReviews(blocks);

  const handleRestart = async () => {
    await resetVoyage();
    navigate('/start', { replace: true });
  };

  const taxi = taxiBackground(session.aircraftId);

  return (
    <div className="fullscreen-page complete-page">
      <SkyBackground image={taxi.image} videoSrc={taxi.videoSrc} dim={0.62} />
      <div className="fullscreen-content complete-content">
        <p className="topbar-eyebrow">全部进港</p>
        <h1 className="complete-title">今日航程圆满完成！</h1>

        {newBadge &&
          (() => {
            const aircraft = settings.aircrafts.find((a) => a.id === session.aircraftId);
            return (
              <div className="badge-celebration">
                <Badge
                  aircraftId={session.aircraftId}
                  tier={newBadge}
                  size={110}
                  label={getTierLabel(newBadge)}
                />
                <div className="badge-celebration-text">
                  获得{aircraft ? `${aircraft.shortName} ` : ''}
                  {getTierLabel(newBadge)}
                </div>
              </div>
            );
          })()}

        <div className="card complete-card">
          <div className="complete-rate">
            <div className="complete-rate-value">{summary.completionRate}%</div>
            <div className="stat-label">完成率</div>
          </div>
          <div className="stat-row complete-stats">
            <div className="stat">
              <div className="stat-label">总任务</div>
              <div className="stat-value">{summary.total}</div>
            </div>
            <div className="stat">
              <div className="stat-label">已完成</div>
              <div className="stat-value is-done">{summary.completed}</div>
            </div>
            <div className="stat">
              <div className="stat-label">未完成</div>
              <div className="stat-value is-incomplete">{summary.incomplete}</div>
            </div>
            <div className="stat">
              <div className="stat-label">总用时</div>
              <div className="stat-value">{summary.totalActualMinutes}分</div>
            </div>
          </div>

          <ul className="review-list">
            {reviews.map((r) => (
              <li
                key={r.id}
                className={`review-item ${r.completed ? 'is-done' : ''} ${r.incomplete ? 'is-incomplete' : ''}`}
              >
                <div className="review-main">
                  <span className="review-title">{r.title}</span>
                  <span className="review-time">
                    计划 {r.plannedMinutes} 分钟
                    {r.actualMinutes != null && ` · 实际 ${r.actualMinutes} 分钟`}
                  </span>
                </div>
                <span className="review-flag">
                  {r.completed ? '✓ 完成' : r.incomplete ? '✗ 未完成' : '⊘ 未执飞'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <button className="btn btn-primary btn-lg btn-block" onClick={() => void handleRestart()}>
          开始新的航程
        </button>
      </div>
    </div>
  );
}
