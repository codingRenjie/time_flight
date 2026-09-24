import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { SkyBackground } from '@/components/SkyBackground';
import { Modal } from '@/components/Modal';
import { Badge } from '@/components/Badge';
import { getHighestTier } from '@/lib/badges';
import { peekNextBlock } from '@/lib/sessionLogic';
import { audioManager } from '@/lib/audio';

/** 页面10：再次起飞页 */
export function NextTakeoffPage() {
  const navigate = useNavigate();
  const { session, blocks, settings, startNextBlock, finishVoyage } = useApp();
  const [endOpen, setEndOpen] = useState(false);

  const next = session ? peekNextBlock(blocks) : null;

  useEffect(() => {
    if (!session) {
      navigate('/start', { replace: true });
    } else if (session.status === 'flying' && session.currentBlockId) {
      navigate(`/fly/${session.currentBlockId}`, { replace: true });
    } else if (session.status !== 'betweenFlights') {
      navigate('/start', { replace: true });
    } else if (!next) {
      // 没有下一项了：回到进港页，按钮会变为"结束航程"
      navigate('/arrived', { replace: true });
    }
  }, [session, next, navigate]);

  if (!session || session.status !== 'betweenFlights' || !next) return null;

  const handleTakeoff = async () => {
    // 页面10保持安静：这里只借按钮手势解锁音频通道（刷新后恢复航程时需要），
    // 背景音由页面05挂载时启动；intentionalPause 期间 unlock 不会补播
    audioManager.unlock();
    const started = await startNextBlock();
    if (started) navigate(`/fly/${started.id}`, { replace: true });
  };

  const handleEndEarly = async () => {
    audioManager.stop();
    const { newBadge } = await finishVoyage();
    navigate('/complete', { replace: true, state: { newBadge } });
  };

  return (
    <div className="fullscreen-page next-takeoff-page">
      <SkyBackground image="/assets/bg-cockpit.png" dim={0.5} />
      <div className="fullscreen-content next-page">
        <p className="topbar-eyebrow">下一项执飞任务</p>
        <h1 className="next-task-title">{next.title}</h1>
        <p className="next-task-duration">{next.remainingBudgetMinutes} 分钟</p>
        {(() => {
          const topTier = getHighestTier(settings.stats, session.aircraftId);
          return topTier ? (
            <p className="next-aircraft badge-inline">
              <Badge aircraftId={session.aircraftId} tier={topTier} size={20} />
            </p>
          ) : null;
        })()}

        <button className="btn btn-primary btn-lg btn-block" onClick={() => void handleTakeoff()}>
          准备好了，起飞
        </button>

        <button className="cancel-voyage-btn" onClick={() => setEndOpen(true)}>
          提前结束航程
        </button>
      </div>

      <Modal open={endOpen} onClose={() => setEndOpen(false)}>
        <h2>提前结束航程？</h2>
        <p>剩下的任务将标记为未完成，直接进入今日摘要。</p>
        <div className="btn-row">
          <button className="btn btn-secondary" onClick={() => setEndOpen(false)}>
            继续执飞
          </button>
          <button className="btn btn-danger" onClick={() => void handleEndEarly()}>
            结束航程
          </button>
        </div>
      </Modal>
    </div>
  );
}
