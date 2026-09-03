import { useApp } from '@/context/AppContext';
import { formatBudgetMinutes } from '@/lib/time';
import { CancelVoyageButton } from '@/pages/CancelledPage';

export function CheckpointPage() {
  const { session, dismissCheckpoint } = useApp();

  if (!session?.checkpoint) {
    return (
      <div>
        <h1 className="page-title">航段过渡</h1>
        <p className="page-subtitle">暂无过渡信息。</p>
      </div>
    );
  }

  const cp = session.checkpoint;

  return (
    <div className="checkpoint-screen">
      <div className="checkpoint-badge">进港成功</div>
      <h1 className="page-title">{cp.completedTitle}</h1>
      <p className="checkpoint-encourage">{cp.encouragement}</p>

      {cp.earlyBonusMinutes !== undefined && cp.earlyBonusMinutes > 0 && (
        <div className="card checkpoint-card">
          <p className="checkpoint-stat">
            提前进港 <strong>+{formatBudgetMinutes(cp.earlyBonusMinutes)}</strong> 已按顺序补给后续待飞航段
          </p>
        </div>
      )}

      {cp.markedIncomplete && (
        <div className="card checkpoint-card">
          <p className="checkpoint-stat">
            本段已记下<strong>未完成</strong>，今晚全部进港后会看到实际用时和计划时间
          </p>
        </div>
      )}

      <div className="card checkpoint-card">
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>下一程</p>
        <p className="checkpoint-next">{cp.nextTitle}</p>
      </div>

      <button className="btn btn-primary btn-block checkpoint-btn" onClick={() => void dismissCheckpoint()}>
        继续下一程 · 起飞
      </button>
      <CancelVoyageButton />
    </div>
  );
}
