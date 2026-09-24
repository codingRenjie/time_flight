import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { SkyBackground } from '@/components/SkyBackground';
import { CircularTimer } from '@/components/CircularTimer';
import { Modal } from '@/components/Modal';
import { Badge } from '@/components/Badge';
import { getHighestTier } from '@/lib/badges';
import { SOUND_OPTIONS, VIEW_OPTIONS } from '@/lib/defaults';
import { flyBackground } from '@/lib/aircraftMedia';
import { audioManager } from '@/lib/audio';
import { getDrainInfo } from '@/lib/sessionLogic';
import { formatDuration, getBlockOvertimeMinutes, getBlockRemainingMinutes, roundMinutes } from '@/lib/time';
import type { SoundType, ViewType } from '@/types';

/** 页面05：执飞过程页 */
export function FlyPage() {
  const { blockId } = useParams();
  const navigate = useNavigate();
  const {
    session,
    blocks,
    settings,
    updateSettings,
    landCurrentBlock,
    toggleCurrentIncomplete,
    extendVoyage,
    cancelVoyage,
  } = useApp();

  const [now, setNow] = useState(Date.now());
  const [soundOpen, setSoundOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [extendHint, setExtendHint] = useState<string | null>(null);

  const block = blocks.find((b) => b.id === blockId);

  // 1s 心跳：驱动计时显示
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 路由守卫
  useEffect(() => {
    if (!session) navigate('/start', { replace: true });
    else if (session.status === 'cancelled') navigate('/cancelled', { replace: true });
    else if (session.status === 'dayEnd') navigate('/complete', { replace: true });
    else if (session.status === 'betweenFlights') navigate('/arrived', { replace: true });
    else if (session.status === 'ready') navigate('/takeoff', { replace: true });
    else if (!block) navigate('/start', { replace: true });
  }, [session, block, navigate]);

  // 背景音生命周期：进入页面播放，离开暂停
  useEffect(() => {
    if (audioManager.isUnlocked) {
      audioManager.setVolume(settings.soundVolume);
      audioManager.play(settings.soundType);
      audioManager.resume();
    }
    // 刷新后音频未解锁：首次触摸页面时解锁并播放
    const unlockOnTouch = () => {
      if (!audioManager.isUnlocked) {
        audioManager.unlock();
        audioManager.setVolume(settings.soundVolume);
        audioManager.play(settings.soundType);
      }
    };
    window.addEventListener('pointerdown', unlockOnTouch, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnTouch);
      audioManager.setTaskInfo(null);
      audioManager.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drainInfo = useMemo(
    () => (block && session ? getDrainInfo(blocks, block, session) : null),
    [block, blocks, session],
  );

  // 锁屏媒体卡片：每秒把剩余时间写成 MM:SS。锁屏后脚本会被系统节流，卡片按系统允许的频率更新。
  useEffect(() => {
    if (!block) return;
    const budgetMin = roundMinutes(block.activeBudgetMinutes ?? block.remainingBudgetMinutes);
    const budgetSec = Math.max(1, budgetMin * 60);
    const elapsed = block.startedAt
      ? Math.max(0, Math.floor((now - new Date(block.startedAt).getTime()) / 1000))
      : 0;
    const remain = Math.max(0, budgetSec - elapsed);
    const overtime = elapsed > budgetSec;
    const label = overtime ? `+${formatDuration(elapsed - budgetSec)}` : formatDuration(remain);
    audioManager.setTaskInfo(block.title, label);
  }, [block, now]);

  if (!block || !session) return null;

  const budgetMinutes = roundMinutes(block.activeBudgetMinutes ?? block.remainingBudgetMinutes);
  const remainingMinutes = getBlockRemainingMinutes(block, now);
  const overtimeMinutes = getBlockOvertimeMinutes(block, now);
  const isOvertime = overtimeMinutes > 0;
  const elapsedSeconds = block.startedAt
    ? Math.max(0, Math.floor((now - new Date(block.startedAt).getTime()) / 1000))
    : 0;

  const aircraft =
    settings.aircrafts.find((a) => a.id === session.aircraftId) ?? settings.aircrafts[0];
  const bg = flyBackground(session.aircraftId, settings.viewType);
  // 当前机型已获得的最高徽章（航班号旁的小装饰）
  const topTier = getHighestTier(settings.stats, session.aircraftId);

  const handleLand = async () => {
    audioManager.pause();
    await landCurrentBlock();
    navigate('/arrived', { replace: true });
  };

  const handleExtend = async () => {
    const ok = await extendVoyage();
    setExtendHint(
      ok
        ? `航程已延长 ${settings.voyageExtendMinutes} 分钟，时间已分配给后续任务`
        : '本次航程已用过延长',
    );
    window.setTimeout(() => setExtendHint(null), 3000);
  };

  const handleCancelConfirm = async () => {
    audioManager.stop();
    await cancelVoyage();
    navigate('/cancelled', { replace: true });
  };

  const pickSound = (type: SoundType) => {
    void updateSettings({ ...settings, soundType: type });
    if (audioManager.isUnlocked) audioManager.play(type);
  };

  const pickView = (viewType: ViewType) => {
    void updateSettings({ ...settings, viewType });
    setViewOpen(false);
  };

  return (
    <div className="fullscreen-page fly-page">
      <SkyBackground image={bg.image} videoSrc={bg.videoSrc} dim={0.42} />

      <div className="fly-topbar">
        <div className="fly-topbar-group">
          <button className="icon-btn glass" aria-label="取消航程" onClick={() => setCancelOpen(true)}>
            ⏻
          </button>
          <button className="icon-btn glass" aria-label="音效设定" onClick={() => setSoundOpen(true)}>
            ♪
          </button>
          <button className="icon-btn glass" aria-label="视角选择" onClick={() => setViewOpen(true)}>
            ✈
          </button>
        </div>
        {settings.voyageExtendEnabled && (
          <button
            className="icon-btn glass"
            aria-label="延长航程"
            disabled={session.voyageExtended}
            onClick={() => void handleExtend()}
          >
            ＋
          </button>
        )}
      </div>

      <div className="fly-content">
        <div className="fly-flightno">
          {topTier && <Badge aircraftId={session.aircraftId} tier={topTier} size={22} />}
          {aircraft.shortName} · 航班 TP{session.date.slice(5).replace('-', '')}
        </div>
        <div className="fly-task-title">{block.title}</div>

        <CircularTimer
          remainingSeconds={remainingMinutes * 60}
          elapsedSeconds={elapsedSeconds}
          totalSeconds={budgetMinutes * 60}
          overtime={isOvertime}
        />

        <div className="fly-hint">
          {extendHint && <span className="fly-hint-ok">{extendHint}</span>}
          {isOvertime && drainInfo && (
            <span className="fly-hint-warn">
              {drainInfo.slackRemaining > 0
                ? `正在消耗余量（剩余 ${drainInfo.slackRemaining} 分钟）`
                : drainInfo.participantCount > 0
                  ? `轮询扣减 ${drainInfo.participantCount} 项后续任务${
                      drainInfo.nextTargetTitle ? `，下一项：${drainInfo.nextTargetTitle}` : ''
                    }`
                  : '后续没有可扣减的任务了'}
            </span>
          )}
        </div>

        <div className="fly-actions">
          <button
            className={`btn btn-secondary ${block.markedIncomplete ? 'is-tagged' : ''}`}
            onClick={() => void toggleCurrentIncomplete()}
          >
            {block.markedIncomplete ? '取消「未完成」标记' : '未完成'}
          </button>
          <button className="btn btn-primary btn-lg" onClick={() => void handleLand()}>
            进港
          </button>
        </div>
      </div>

      <Modal open={soundOpen} onClose={() => setSoundOpen(false)}>
        <h2>音效设定</h2>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) =>
              void updateSettings({ ...settings, soundEnabled: e.target.checked })
            }
          />
          <span>背景音</span>
        </label>
        <div style={settings.soundEnabled ? undefined : { opacity: 0.4 }}>
          <div className="sound-list">
            {SOUND_OPTIONS.map((s) => (
              <button
                key={s.type}
                className={`sound-option ${settings.soundType === s.type ? 'is-selected' : ''}`}
                onClick={() => pickSound(s.type)}
              >
                {s.label}
                {settings.soundType === s.type && <span> ✓</span>}
              </button>
            ))}
          </div>
          <label className="volume-row">
            音量
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.soundVolume * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                void updateSettings({ ...settings, soundVolume: v });
                audioManager.setVolume(v);
              }}
            />
          </label>
        </div>
      </Modal>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)}>
        <h2>背景视角</h2>
        <div className="sound-list">
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.type}
              className={`sound-option ${settings.viewType === v.type ? 'is-selected' : ''}`}
              onClick={() => pickView(v.type)}
            >
              {v.label}
              {settings.viewType === v.type && <span> ✓</span>}
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)}>
        <h2>取消整趟航程？</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          本次航程将中止，已完成的任务不会计入统计。
        </p>
        <div className="btn-row">
          <button className="btn btn-secondary" onClick={() => setCancelOpen(false)}>
            继续执飞
          </button>
          <button className="btn btn-danger" onClick={() => void handleCancelConfirm()}>
            确认取消
          </button>
        </div>
      </Modal>
    </div>
  );
}
