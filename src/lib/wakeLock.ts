/**
 * 屏幕常亮（Wake Lock API）。
 * iOS Safari 16.4+ / Android Chrome 支持；不支持的浏览器静默降级。
 *
 * 注意：系统会在页面隐藏时自动释放锁，回到前台需重新申请
 * （AppContext 里的 visibilitychange 监听负责）。
 */
let sentinel: WakeLockSentinel | null = null;

export async function acquireScreenWakeLock(): Promise<void> {
  try {
    if (!('wakeLock' in navigator)) return;
    if (sentinel && !sentinel.released) return;
    sentinel = await navigator.wakeLock.request('screen');
  } catch {
    /* 低电量模式等原因被系统拒绝时静默降级 */
  }
}

export async function releaseScreenWakeLock(): Promise<void> {
  try {
    await sentinel?.release();
  } catch {
    /* 已释放 */
  }
  sentinel = null;
}
