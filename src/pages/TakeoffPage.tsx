import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { SkyBackground } from '@/components/SkyBackground';
import { ThrottleLever } from '@/components/ThrottleLever';
import { Badge } from '@/components/Badge';
import { resolveDisplayBadge } from '@/lib/badges';
import { audioManager } from '@/lib/audio';

/** 页面04：起飞油门页 */
export function TakeoffPage() {
  const navigate = useNavigate();
  const { session, startFirstBlock, settings } = useApp();
  const unlocked = useRef(false);

  useEffect(() => {
    audioManager.prepareBackground(settings.soundType);
  }, [settings.soundType]);

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
  const displayBadge = resolveDisplayBadge(settings);

  const handleProgress = () => {
    // 推杆手势只解锁音频通道，让档位咔哒能响；不播引擎轰鸣
    if (!unlocked.current) {
      unlocked.current = true;
      audioManager.unlock();
    }
  };

  const handleComplete = async () => {
    audioManager.setVolume(settings.soundVolume);
    await audioManager.playBoarding();
    const started = await startFirstBlock();
    if (started) {
      navigate(`/fly/${started.id}`, { replace: true });
    }
  };

  return (
    <div className="fullscreen-page takeoff-page">
      <SkyBackground image="/assets/bg-cockpit.png" dim={0.45} />
      <div className="fullscreen-content">
        <div className="takeoff-header">
          <p className="topbar-eyebrow">CLEARED FOR TAKEOFF</p>
          <h1>准备起飞</h1>
          <p className="takeoff-aircraft badge-inline">
            {displayBadge && (
              <Badge aircraftId={displayBadge.aircraftId} tier={displayBadge.tier} size={20} />
            )}
            {aircraft.shortName} · 塔台已放行，跑道畅通
          </p>
        </div>
        <ThrottleLever onComplete={() => void handleComplete()} onProgress={handleProgress} />
      </div>
    </div>
  );
}
