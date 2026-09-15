import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { SkyBackground } from '@/components/SkyBackground';
import { ThrottleLever } from '@/components/ThrottleLever';
import { Badge } from '@/components/Badge';
import { getHighestTier } from '@/lib/badges';
import { audioManager } from '@/lib/audio';

/** 页面04：起飞油门页 */
export function TakeoffPage() {
  const navigate = useNavigate();
  const { session, startFirstBlock, settings } = useApp();
  const unlocked = useRef(false);

  useEffect(() => {
    if (!session) navigate('/start', { replace: true });
    else if (session.status === 'flying' && session.currentBlockId) {
      navigate(`/fly/${session.currentBlockId}`, { replace: true });
    } else if (session.status !== 'ready') {
      navigate('/start', { replace: true });
    }
  }, [session, navigate]);

  if (!session || session.status !== 'ready') return null;

  const aircraft =
    settings.aircrafts.find((a) => a.id === session.aircraftId) ?? settings.aircrafts[0];
  const topTier = getHighestTier(settings.stats, session.aircraftId);

  const handleProgress = (p: number) => {
    // 推油门是用户手势：在此解锁音频，并让引擎声随推杆渐强
    if (!unlocked.current) {
      unlocked.current = true;
      audioManager.unlock();
      audioManager.setVolume(settings.soundVolume * 0.5);
      audioManager.play('engine');
    }
    if (p >= 0.995) {
      audioManager.setVolume(settings.soundVolume);
    }
  };

  const handleComplete = async () => {
    const started = await startFirstBlock();
    if (started) {
      navigate(`/fly/${started.id}`, { replace: true });
    }
  };

  return (
    <div className="fullscreen-page">
      <SkyBackground image="/assets/bg-cockpit.png" dim={0.45} />
      <div className="fullscreen-content">
        <div className="takeoff-header">
          <h1>准备起飞</h1>
          <p className="takeoff-aircraft badge-inline">
            {topTier && <Badge aircraftId={session.aircraftId} tier={topTier} size={20} />}
            {aircraft.shortName} · 塔台已放行，跑道畅通
          </p>
        </div>
        <ThrottleLever onComplete={() => void handleComplete()} onProgress={handleProgress} />
      </div>
    </div>
  );
}
