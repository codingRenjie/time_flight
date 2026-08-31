export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getWindowBounds(
  windowStart: string,
  windowEnd: string,
  demoMode: boolean,
  reference = new Date(),
): { windowStartAt: Date; windowEndAt: Date; totalMinutes: number } {
  if (demoMode) {
    const windowStartAt = new Date(reference);
    const windowEndAt = new Date(reference.getTime() + 120 * 60 * 1000);
    return { windowStartAt, windowEndAt, totalMinutes: 120 };
  }

  const startMin = parseTimeToMinutes(windowStart);
  const endMin = parseTimeToMinutes(windowEnd);
  const windowStartAt = new Date(reference);
  windowStartAt.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  const windowEndAt = new Date(reference);
  windowEndAt.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
  if (windowEndAt <= windowStartAt) {
    windowEndAt.setDate(windowEndAt.getDate() + 1);
  }
  return {
    windowStartAt,
    windowEndAt,
    totalMinutes: endMin - startMin,
  };
}

export function minutesUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - now) / 60000));
}

export function secondsUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** 所有时间增减以整分钟计，四舍五入 */
export function roundMinutes(value: number): number {
  return Math.max(0, Math.round(value));
}

/** 展示航段剩余预算（整分钟） */
export function formatBudgetMinutes(minutes: number): string {
  return `${roundMinutes(minutes)} 分钟`;
}

/** 执飞倒计时：仅显示整分钟，不出现秒 */
export function formatRemainingMinutes(minutes: number): string {
  return `${roundMinutes(minutes)} 分钟`;
}

export function budgetToSeconds(minutes: number): number {
  return roundMinutes(minutes) * 60;
}

/** 当前航段剩余分钟（整） */
export function getBlockRemainingMinutes(
  block: { startedAt: string | null; activeBudgetMinutes: number | null; remainingBudgetMinutes: number },
  now = Date.now(),
): number {
  const budget = roundMinutes(block.activeBudgetMinutes ?? block.remainingBudgetMinutes);
  if (!block.startedAt) return budget;
  const elapsedMin = (now - new Date(block.startedAt).getTime()) / 60000;
  return Math.max(0, roundMinutes(budget - elapsedMin));
}

/** 当前航段超时分钟（整，四舍五入） */
export function getBlockOvertimeMinutes(
  block: { startedAt: string | null; activeBudgetMinutes: number | null; remainingBudgetMinutes: number },
  now = Date.now(),
): number {
  if (!block.startedAt) return 0;
  const budget = roundMinutes(block.activeBudgetMinutes ?? block.remainingBudgetMinutes);
  const elapsedMin = (now - new Date(block.startedAt).getTime()) / 60000;
  return Math.max(0, roundMinutes(elapsedMin - budget));
}
