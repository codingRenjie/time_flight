import { useRef, useState } from 'react';
import { audioManager } from '@/lib/audio';

const TRACK_H = 280;
/** 推过 90% 即视为起飞：真实手指很难精确停在 100% */
const COMPLETE_THRESHOLD = 0.9;
/** 每 10% 一个机械档位，跨档时给段落感反馈 */
const DETENTS = 10;

/**
 * 档位反馈：Android Chrome 震动；iOS Safari 无震动 API，用咔哒声替代。
 * （桌面 Chrome 的 vibrate 返回 false，同样落到音效分支，方便开发时验证）
 */
function fireDetentFeedback(intensity: number): void {
  if (navigator.vibrate?.(12) !== true) {
    audioManager.tick(intensity);
  }
}

/** 起飞确认反馈：安卓三段震动 / iOS 低沉「哐」声 */
function fireCompleteFeedback(): void {
  if (navigator.vibrate?.([30, 60, 80]) !== true) {
    audioManager.thunk();
  }
}

/**
 * 页面04 起飞油门推杆。
 * 手指按住推杆从下向上推；推过 90% 停顿 0.5s（或松手）即触发 onComplete；
 * 未到阈值松手则弹回底部。
 * 同时支持键盘（↑/↓）操作，role="slider" 保证可访问性。
 *
 * 注意：progress 同时维护 ref 副本——pointerdown/up 可能在同一个
 * 事件循环任务内连续触发，此时 React 尚未重渲染，闭包里的 state 是旧值。
 */
export function ThrottleLever({
  onComplete,
  onProgress,
}: {
  onComplete: () => void;
  onProgress?: (progress: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);
  const completeTimer = useRef<number | null>(null);
  const lastDetentRef = useRef(0);

  const setP = (p: number) => {
    progressRef.current = p;
    setProgress(p);
  };

  const complete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setCompleted(true);
    fireCompleteFeedback();
    onComplete();
  };

  const clearTimer = () => {
    if (completeTimer.current !== null) {
      window.clearTimeout(completeTimer.current);
      completeTimer.current = null;
    }
  };

  const applyProgress = (p: number) => {
    setP(p);
    onProgress?.(p);
    // 跨过档位时给段落感反馈（震动或咔哒声，音调随档位升高）
    const detent = Math.round(p * DETENTS);
    if (detent !== lastDetentRef.current) {
      lastDetentRef.current = detent;
      fireDetentFeedback(detent / DETENTS);
    }
    if (p >= COMPLETE_THRESHOLD && completeTimer.current === null) {
      // 推到阈值后停顿 0.5s 自动起飞
      completeTimer.current = window.setTimeout(complete, 500);
    }
    if (p < COMPLETE_THRESHOLD) {
      clearTimer();
    }
  };

  const updateFromPointer = (clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
    applyProgress(p);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (completedRef.current) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 合成事件或个别浏览器不支持时忽略 */
    }
    setDragging(true);
    updateFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || completedRef.current) return;
    updateFromPointer(e.clientY);
  };

  const handlePointerUp = () => {
    if (completedRef.current) return;
    setDragging(false);
    clearTimer();
    if (progressRef.current >= COMPLETE_THRESHOLD) {
      // 推过阈值后松手：直接起飞，不再弹回
      complete();
      return;
    }
    // 弹回底部（CSS transition 生效），静默复位档位，不触发反馈
    setP(0);
    lastDetentRef.current = 0;
    onProgress?.(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (completedRef.current) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      applyProgress(Math.min(1, progressRef.current + 0.1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      applyProgress(Math.max(0, progressRef.current - 0.1));
    }
  };

  const leverY = (1 - progress) * (TRACK_H - 72);

  return (
    <div className="throttle-wrap">
      <div className="throttle-hint-arrows" aria-hidden>
        <span>⌃</span>
        <span>⌃</span>
      </div>
      <div
        ref={trackRef}
        className={`throttle-track ${dragging ? 'is-dragging' : ''} ${completed ? 'is-complete' : ''}`}
        style={{ height: TRACK_H }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="slider"
        aria-label="起飞油门"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="throttle-fill" style={{ height: progress * TRACK_H }} />
        <div
          className="throttle-knob"
          style={{
            top: leverY,
            transition: dragging ? 'none' : 'top 0.35s cubic-bezier(0.2, 0.8, 0.3, 1.2)',
          }}
        >
          <div className="throttle-knob-grip" />
        </div>
      </div>
      <p className="throttle-label">
        {completed ? '起飞！' : progress > 0.7 ? '继续推……' : '按住推杆，向上推到底起飞'}
      </p>
    </div>
  );
}
