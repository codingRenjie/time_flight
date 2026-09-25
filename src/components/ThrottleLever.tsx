import { useRef, useState } from 'react';
import { audioManager } from '@/lib/audio';

/** 推杆行程占底座图高度的比例（源图握把顶 y=556 → 轨道顶 ~200，970 高） */
const TRAVEL_RATIO = 0.367;
/** 推过 90% 即视为起飞：真实手指很难精确停在 100% */
const COMPLETE_THRESHOLD = 0.9;
/** 每 10% 一个机械档位，跨档时给段落感反馈 */
const DETENTS = 10;

/** 档位反馈：最初的轻量 WebAudio 咔哒。不在每档震动，避免快速来回时主线程卡顿。 */
function fireDetentFeedback(intensity: number): void {
  audioManager.tick(intensity);
}

/** 起飞确认：安卓给一段震动；登机「噔」由 TakeoffPage 在跳转前播放 */
function fireCompleteFeedback(): void {
  navigator.vibrate?.([30, 60, 80]);
}

/**
 * 页面04 起飞油门推杆（照片级：底座不动，两颗 A/T DISC 握把跟手指上移）。
 * 手指按住从下向上推；推过 90% 停顿 0.5s（或松手）即触发 onComplete；
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
  const stageRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);
  const completeTimer = useRef<number | null>(null);
  const lastDetentRef = useRef(0);
  const dragOriginY = useRef(0);
  const dragOriginP = useRef(0);

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
    const detent = Math.round(p * DETENTS);
    if (detent !== lastDetentRef.current) {
      lastDetentRef.current = detent;
      fireDetentFeedback(detent / DETENTS);
    }
    if (p >= COMPLETE_THRESHOLD && completeTimer.current === null) {
      completeTimer.current = window.setTimeout(complete, 500);
    }
    if (p < COMPLETE_THRESHOLD) {
      clearTimer();
    }
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
    dragOriginY.current = e.clientY;
    dragOriginP.current = progressRef.current;
    // 按下手势内解锁，并静音挂上背景循环（进页面05 时只开音量，不必再等一次点击）
    audioManager.unlock();
    audioManager.armBackground();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || completedRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const travel = stage.getBoundingClientRect().height * TRAVEL_RATIO;
    if (travel <= 0) return;
    const next = Math.min(1, Math.max(0, dragOriginP.current + (dragOriginY.current - e.clientY) / travel));
    applyProgress(next);
  };

  const handlePointerUp = () => {
    if (completedRef.current) return;
    setDragging(false);
    clearTimer();
    if (progressRef.current >= COMPLETE_THRESHOLD) {
      complete();
      return;
    }
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

  return (
    <div className="throttle-wrap">
      <div
        ref={stageRef}
        className={`throttle-stage ${dragging ? 'is-dragging' : ''} ${completed ? 'is-complete' : ''}`}
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
        <img className="throttle-base" src="/assets/throttle/base.jpg" alt="" draggable={false} />
        <img
          className="throttle-lever"
          src="/assets/throttle/lever.png"
          alt=""
          draggable={false}
          style={{
            transform: `translate3d(0, ${-progress * TRAVEL_RATIO * 100}%, 0)`,
            transition: dragging ? 'none' : 'transform 0.35s cubic-bezier(0.2, 0.8, 0.3, 1.2)',
          }}
        />
        {progress < 0.12 && (
          <div className="throttle-hint-arrows" aria-hidden>
            <span>⌃</span>
            <span>⌃</span>
          </div>
        )}
      </div>
      <p className="throttle-label">
        {completed ? '起飞！' : progress > 0.7 ? '继续推……' : '按住油门，向上推到底起飞'}
      </p>
    </div>
  );
}
