import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { formatRemainingMinutes, roundMinutes } from '@/lib/time';
import { CancelVoyageButton } from '@/pages/CancelledPage';

export function FreePage() {
  const { session, blocks, finishFreeFly } = useApp();
  const [now, setNow] = useState(Date.now());

  const freeBlock = blocks.find((b) => b.type === 'free');

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  if (!session || !freeBlock) {
    return (
      <div>
        <h1 className="page-title">自由飞行</h1>
        <p className="page-subtitle">当前没有可执行的自由飞行。</p>
      </div>
    );
  }

  const windowRemainingMin = Math.max(
    0,
    roundMinutes((new Date(session.windowEndAt).getTime() - now) / 60000),
  );
  const freeBudgetMin = roundMinutes(freeBlock.remainingBudgetMinutes);
  const displayMin = Math.min(windowRemainingMin, freeBudgetMin);

  return (
    <div className="fly-screen">
      <h1 className="page-title">自由飞行中</h1>
      <p className="page-subtitle">
        这是你挣来的时间 · {session.windowEnd} 今日进港
        {session.voyageExtended && '（已延长航程）'}
      </p>
      <div className="fly-timer" style={{ color: 'var(--success)' }}>
        {formatRemainingMinutes(displayMin)}
      </div>
      <p style={{ color: 'var(--text-muted)' }}>
        自由飞预算 {freeBudgetMin} 分钟 · 窗口剩余 {windowRemainingMin} 分钟
      </p>
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => void finishFreeFly()}>
          结束自由飞 · 准备进港
        </button>
      </div>
      <CancelVoyageButton />
    </div>
  );
}
