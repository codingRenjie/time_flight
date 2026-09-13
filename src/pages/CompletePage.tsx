import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { SkyBackground } from '@/components/SkyBackground';
import { getSessionSummary, getTaskReviews } from '@/lib/sessionLogic';

/** 页面08：全部完成页 */
export function CompletePage() {
  const navigate = useNavigate();
  const { session, blocks, resetVoyage } = useApp();

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

  return (
    <div className="fullscreen-page">
      <SkyBackground image="/assets/bg-taxiing.png" dim={0.55} />
      <div className="fullscreen-content complete-content">
        <div className="checkpoint-badge">🛬 全部进港</div>
        <h1 className="complete-title">今日航程圆满完成！</h1>

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
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {summary.completed}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">未完成</div>
              <div className="stat-value" style={{ color: 'var(--warn)' }}>
                {summary.incomplete}
              </div>
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
