import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Badge } from '@/components/Badge';
import { getHighestTier } from '@/lib/badges';
import { hasPendingBlocks } from '@/lib/sessionLogic';

/** 页面06：任务进港页 */
export function ArrivedPage() {
  const navigate = useNavigate();
  const { session, blocks, settings, finishVoyage } = useApp();

  useEffect(() => {
    if (!session) navigate('/start', { replace: true });
    else if (session.status === 'dayEnd') navigate('/complete', { replace: true });
    else if (session.status === 'cancelled') navigate('/cancelled', { replace: true });
    else if (session.status === 'flying' && session.currentBlockId) {
      navigate(`/fly/${session.currentBlockId}`, { replace: true });
    } else if (session.status !== 'betweenFlights') {
      navigate('/start', { replace: true });
    }
  }, [session, navigate]);

  if (!session || session.status !== 'betweenFlights') return null;

  const landed = blocks.find((b) => b.id === session.lastLandedBlockId);
  const hasNext = hasPendingBlocks(blocks);
  const next = [...blocks]
    .sort((a, b) => a.order - b.order)
    .find((b) => b.status === 'planned' && b.remainingBudgetMinutes > 0);

  const handleFinish = async () => {
    const { newBadge } = await finishVoyage();
    navigate('/complete', { replace: true, state: { newBadge } });
  };

  return (
    <div className="fullscreen-page arrived-page">
      <div className="arrived-content">
        <img
          src="/assets/captain-thumbsup.jpg"
          alt="机长点赞"
          className="arrived-captain"
        />
        {(() => {
          const topTier = getHighestTier(settings.stats, session.aircraftId);
          const aircraft = settings.aircrafts.find((a) => a.id === session.aircraftId);
          return topTier && aircraft ? (
            <p className="arrived-aircraft badge-inline">
              <Badge aircraftId={session.aircraftId} tier={topTier} size={20} />
              {aircraft.shortName} 执飞中
            </p>
          ) : null;
        })()}
        <h1 className="arrived-title">
          <span>{landed?.title ?? '本段任务'}</span>
          <span className="arrived-status">已进港</span>
        </h1>

        <div className="card arrived-card">
          <div className="stat-row">
            <div className="stat">
              <div className="stat-label">计划用时</div>
              <div className="stat-value">{landed?.originalPlannedMinutes ?? 0} 分钟</div>
            </div>
            <div className="stat">
              <div className="stat-label">实际用时</div>
              <div className="stat-value">{landed?.actualDurationMinutes ?? 0} 分钟</div>
            </div>
          </div>
          {landed?.markedIncomplete && (
            <p className="arrived-flag">已标记「未完成」，会在今日摘要中展示</p>
          )}
          {session.lastLandingBonus &&
            session.lastLandingBonus.toTasks + session.lastLandingBonus.toSlack > 0 && (
              <p className="arrived-bonus">
                提前进港释放 +{session.lastLandingBonus.toTasks + session.lastLandingBonus.toSlack}{' '}
                分钟
                {session.lastLandingBonus.toTasks > 0 &&
                  `，${session.lastLandingBonus.toTasks} 分钟已分配给后续任务`}
                {session.lastLandingBonus.toSlack > 0 &&
                  `，${session.lastLandingBonus.toSlack} 分钟已存入余量池`}
              </p>
            )}
          {hasNext && next && (
            <p className="arrived-next">
              下一项：{next.title} · {next.remainingBudgetMinutes} 分钟
            </p>
          )}
        </div>

        {hasNext ? (
          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={() => navigate('/next')}
          >
            开始下一个执飞任务
          </button>
        ) : (
          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={() => void handleFinish()}
          >
            已完成所有任务，结束航程
          </button>
        )}
      </div>
    </div>
  );
}
