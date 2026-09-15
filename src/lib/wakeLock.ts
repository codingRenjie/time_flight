/**
 * 屏幕常亮（Wake Lock API）。
 * iOS Safari 16.4+ / Android Chrome 支持；不支持的浏览器静默降级。
 *
 * 注意：系统会在页面隐藏时自动释放锁，且申请可能被系统拒绝
 * （低电量模式等），因此调用方需要周期性重试 + 回前台时重新申请
 * （见 AppContext 的 visibilitychange 监听与重试定时器）。
 */
let sentinel: WakeLockSentinel | null = null;

/** 申请常亮；已持有锁时为幂等操作。返回是否成功持有。 */
export async function acquireScreenWakeLock(): Promise<boolean> {
  try {
    if (!('wakeLock' in navigator)) return false;
    if (sentinel && !sentinel.released) return true;
    sentinel = await navigator.wakeLock.request('screen');
    console.info('[TimePilot] 屏幕常亮：已开启');
    sentinel.addEventListener('release', () => {
      console.info('[TimePilot] 屏幕常亮：已释放');
    });
    return true;
  } catch (err) {
    console.warn('[TimePilot] 屏幕常亮：申请失败（可能处于低电量模式）', err);
    sentinel = null;
    return false;
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
