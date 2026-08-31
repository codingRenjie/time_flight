import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { getDrainCycleInfo, getDrainTargets, getRigidBreakBlocksAfter } from '@/lib/sessionLogic';
import {
  formatBudgetMinutes,
  formatClock,
  formatRemainingMinutes,
  getBlockOvertimeMinutes,
  getBlockRemainingMinutes,
  roundMinutes,
} from '@/lib/time';
import type { Block } from '@/types';

export function FlyPage() {
  const { blockId } = useParams();
  const navigate = useNavigate();
  const { session, blocks, settings, landCurrentBlock, extendVoyage, applyPriorityOrder } = useApp();
  const [now, setNow] = useState(Date.now());
  const [queueNote, setQueueNote] = useState('');
  const [showQueueInput, setShowQueueInput] = useState(false);
  const [priorityBlocks, setPriorityBlocks] = useState<Block[]>([]);
  const [priorityFirst, setPriorityFirst] = useState<string | null>(null);
  const [secondWarning, setSecondWarning] = useState<string | null>(null);

  const block = blocks.find((b) => b.id === blockId);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!session) navigate('/evening', { replace: true });
    else if (!block && !session.checkpoint) navigate('/evening', { replace: true });
  }, [session, block, navigate]);

  const budgetMinutes = roundMinutes(block?.activeBudgetMinutes ?? block?.remainingBudgetMinutes ?? 0);

  const plannedEnd = block?.startedAt
    ? new Date(
        new Date(block.startedAt).getTime() + budgetMinutes * 60000,
      )
    : null;

  const remainingMinutes = block ? getBlockRemainingMinutes(block, now) : 0;
  const overtimeMinutes = block ? getBlockOvertimeMinutes(block, now) : 0;
  const isOvertime = overtimeMinutes > 0;

  const drainInfo =
    isOvertime && block && session
      ? getDrainCycleInfo(blocks, block, overtimeMinutes, session)
      : null;

  const drainTargets = useMemo(
    () => (block ? getDrainTargets(blocks, block) : []),
    [block, blocks],
  );

  const rigidBreaks = useMemo(
    () => (block ? getRigidBreakBlocksAfter(blocks, block) : []),
    [block, blocks],
  );

  const windowProgress = session
    ? Math.min(
        100,
        ((now - new Date(session.windowStartAt).getTime()) /
          (new Date(session.windowEndAt).getTime() - new Date(session.windowStartAt).getTime())) *
          100,
      )
    : 0;

  const planReminder = session?.planReminderShown && isOvertime;

  if (!block || !session) return null;

  const isBreak = block.type === 'break';
  const budgetDrained = roundMinutes(block.plannedDurationMinutes - block.remainingBudgetMinutes);

  const handleLand = async () => {
    const { needsPriority } = await landCurrentBlock(showQueueInput ? queueNote : undefined);
    if (needsPriority.length >= 2) {
      setPriorityBlocks(needsPriority);
      return;
    }
    setShowQueueInput(false);
    setQueueNote('');
  };

  const confirmPriority = async () => {
    if (!priorityFirst) return;
    const ordered = [
      priorityFirst,
      ...priorityBlocks.filter((b) => b.id !== priorityFirst).map((b) => b.id),
    ];
    const first = priorityBlocks.find((b) => b.id === priorityFirst)!;
    const second = priorityBlocks.find((b) => b.id !== priorityFirst);
    if (second) {
      const windowRemaining = Math.max(
        0,
        Math.floor((new Date(session.windowEndAt).getTime() - Date.now()) / 60000),
      );
      const afterFirst = windowRemaining - first.remainingBudgetMinutes;
      if (afterFirst < second.minimumDurationMinutes) {
        setSecondWarning(
          `做完 ${first.title} 后只剩 ${formatBudgetMinutes(afterFirst)}，不够 ${second.title}（至少 ${second.minimumDurationMinutes} 分钟）。${second.title} 将记录为未完成。`,
        );
        return;
      }
    }
    await applyPriorityOrder(ordered, priorityFirst);
    setPriorityBlocks([]);
    setPriorityFirst(null);
    setSecondWarning(null);
  };

  const confirmSecondIncomplete = async () => {
    if (!priorityFirst) return;
    const ordered = [
      priorityFirst,
      ...priorityBlocks.filter((b) => b.id !== priorityFirst).map((b) => b.id),
    ];
    await applyPriorityOrder(ordered, priorityFirst);
    setPriorityBlocks([]);
    setPriorityFirst(null);
    setSecondWarning(null);
  };

  return (
    <div className={`fly-screen ${isBreak ? 'break-mode' : ''}`}>
      <div className="fly-title">
        {block.title} · {isBreak ? '经停' : '执飞中'}
      </div>

      {!isBreak && budgetDrained > 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          本段可用 {formatBudgetMinutes(budgetMinutes)}
          {budgetDrained > 0 && (
            <span style={{ color: 'var(--warn)' }}>
              {' '}
              （计划 {block.plannedDurationMinutes} min，已被联动扣减 {formatBudgetMinutes(budgetDrained)}）
            </span>
          )}
        </p>
      )}

      {isBreak && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          刚性 {block.plannedDurationMinutes} 分钟 · 顺序可调，时长不受联动扣减；超时仍会占用后续航段预算
        </p>
      )}

      {isOvertime ? (
        <div className="fly-timer" style={{ color: 'var(--warn)' }}>
          超时 +{formatRemainingMinutes(overtimeMinutes)}
        </div>
      ) : (
        <div className="fly-timer">{formatRemainingMinutes(remainingMinutes)}</div>
      )}

      {plannedEnd && (
        <p style={{ color: 'var(--text-muted)' }}>计划进港 {formatClock(plannedEnd)}</p>
      )}

      <div className="fly-hint">
        {planReminder &&
          drainInfo &&
          drainInfo.participantCount > 0 &&
          `本段计划时间到了。联动 ${drainInfo.participantCount} 项，每超时 1 分钟按顺序扣一项 1 分钟${
            drainInfo.nextTargetTitle ? `（下一项：${drainInfo.nextTargetTitle}）` : ''
          }`}
      </div>

      <div className="fuel-bar" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="fuel-bar-fill" style={{ width: `${windowProgress}%` }} />
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        整晚航程进度 · {session.windowEnd} 进港
        {session.voyageExtended && '（已延长航程）'}
      </p>

      {(drainTargets.length > 0 || rigidBreaks.length > 0) && (
        <div className="card budget-grid" style={{ maxWidth: 480, margin: '24px auto 0' }}>
          <h4 style={{ margin: '0 0 8px' }}>后续航段预算</h4>
          {drainTargets.map((b) => {
            const pct = b.plannedDurationMinutes
              ? (b.remainingBudgetMinutes / b.plannedDurationMinutes) * 100
              : 0;
            return (
              <div key={b.id} className={b.status === 'incomplete' ? 'incomplete' : ''}>
                <label>
                  <span>
                    {b.title}
                    {b.type === 'free' && ' · 最后一程'}
                  </span>
                  <span>
                    {formatBudgetMinutes(b.remainingBudgetMinutes)} / {b.plannedDurationMinutes} min
                    {b.status === 'incomplete' && ' · 未完成'}
                  </span>
                </label>
                <div className="budget-track">
                  <div
                    className={`budget-fill ${pct < 30 ? 'danger' : ''}`}
                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                  />
                </div>
              </div>
            );
          })}
          {rigidBreaks.map((b) => (
            <div key={b.id} className="rigid-break">
              <label>
                <span>{b.title}</span>
                <span className="badge">刚性 {b.plannedDurationMinutes} min · 不参与联动</span>
              </label>
              <div className="budget-track">
                <div className="budget-fill" style={{ width: '100%', opacity: 0.5 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="btn-row" style={{ justifyContent: 'center', maxWidth: 480, margin: '24px auto' }}>
        <button className="btn btn-primary" onClick={() => void handleLand()}>
          {isBreak ? '经停结束 · 续飞' : '本段进港'}
        </button>
        {!session.voyageExtended && !isBreak && block.type !== 'free' && (
          <button className="btn btn-secondary" onClick={() => void extendVoyage()}>
            延长航程 {settings.voyageExtendMinutes} 分钟
          </button>
        )}
        {!isBreak && (
          <button className="btn btn-secondary" onClick={() => setShowQueueInput((v) => !v)}>
            有未完成
          </button>
        )}
      </div>

      {showQueueInput && (
        <div className="card" style={{ maxWidth: 480, margin: '16px auto' }}>
          <label>
            明早队列备注（可选）
            <input
              value={queueNote}
              onChange={(e) => setQueueNote(e.target.value)}
              placeholder="例如：卷面剩 3 题"
              style={{ width: '100%', marginTop: 8, padding: 12, borderRadius: 8, border: 'none' }}
            />
          </label>
        </div>
      )}

      {priorityBlocks.length >= 2 && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>时间不够全部完成</h2>
            <p>你先做哪一项？</p>
            {priorityBlocks.map((b) => (
              <label key={b.id} style={{ display: 'block', marginBottom: 8 }}>
                <input
                  type="radio"
                  name="priority"
                  checked={priorityFirst === b.id}
                  onChange={() => setPriorityFirst(b.id)}
                />{' '}
                {b.title}（至少 {b.minimumDurationMinutes} 分钟，剩余{' '}
                {formatBudgetMinutes(b.remainingBudgetMinutes)}）
              </label>
            ))}
            <div className="btn-row">
              <button className="btn btn-primary" disabled={!priorityFirst} onClick={() => void confirmPriority()}>
                确认顺序
              </button>
            </div>
          </div>
        </div>
      )}

      {secondWarning && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>时间预告</h2>
            <p>{secondWarning}</p>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => void confirmSecondIncomplete()}>
                知道了，继续
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
