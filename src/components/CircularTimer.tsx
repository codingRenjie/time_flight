import { formatDuration } from '@/lib/time';

const SIZE = 260;
const STROKE = 10;
const R = (SIZE - STROKE) / 2 - 4;
const CIRC = 2 * Math.PI * R;

/**
 * 页面05 中央圆形计时器。
 * 大字：剩余时间（MM:SS）；小字：已进行时间。
 * 超时后：圆环转满变红，大字显示 +超时。
 */
export function CircularTimer({
  remainingSeconds,
  elapsedSeconds,
  totalSeconds,
  overtime,
}: {
  remainingSeconds: number;
  elapsedSeconds: number;
  totalSeconds: number;
  overtime: boolean;
}) {
  const ratio = totalSeconds > 0 ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds)) : 0;
  const dash = CIRC * ratio;

  return (
    <div className={`circular-timer ${overtime ? 'is-overtime' : ''}`}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          className="ct-track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
        />
        <circle
          className="ct-progress"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={overtime ? 'var(--danger)' : 'currentColor'}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke-dasharray 0.5s linear, stroke 0.3s' }}
        />
      </svg>
      <div className="circular-timer-center">
        {overtime ? (
          <>
            <div className="ct-label">已超时</div>
            <div className="ct-main overtime">+{formatDuration(elapsedSeconds - totalSeconds)}</div>
            <div className="ct-sub">正在扣减后续时间</div>
          </>
        ) : (
          <>
            <div className="ct-label">剩余时间</div>
            <div className="ct-main">{formatDuration(remainingSeconds)}</div>
            <div className="ct-sub">已进行 {formatDuration(elapsedSeconds)}</div>
          </>
        )}
      </div>
    </div>
  );
}
