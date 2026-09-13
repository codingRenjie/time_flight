import type {
  Block,
  FlightSession,
  PlanDraft,
  PlanTaskDraft,
} from '@/types';
import { createId } from '@/lib/id';
import { getWindowBounds, roundMinutes, todayDateString, formatMinutesToTime } from '@/lib/time';

/** 航程总时长 - 任务总时长 = 未分配余量（可为负，表示超排） */
export function computeSlackMinutes(totalWindowMinutes: number, tasks: PlanTaskDraft[]): number {
  const used = tasks.reduce((sum, t) => sum + t.plannedDurationMinutes, 0);
  return totalWindowMinutes - used;
}

function makeBlock(sessionId: string, draft: PlanTaskDraft, order: number): Block {
  return {
    id: createId(),
    sessionId,
    type: draft.type,
    title: draft.title,
    order,
    plannedDurationMinutes: draft.plannedDurationMinutes,
    remainingBudgetMinutes: draft.plannedDurationMinutes,
    activeBudgetMinutes: null,
    actualDurationMinutes: null,
    status: 'planned',
    startedAt: null,
    landedAt: null,
    markedIncomplete: false,
    originalPlannedMinutes: draft.plannedDurationMinutes,
  };
}

/** 页面03 按下"立即执飞"：创建航程，状态 ready，等待页面04 推油门 */
export function createSessionFromPlan(
  draft: PlanDraft,
  aircraftId: string,
): { session: FlightSession; blocks: Block[] } {
  const { windowStartAt, windowEndAt, totalMinutes } = getWindowBounds(
    draft.windowStart,
    draft.windowEnd,
  );
  const sessionId = createId();
  const blocks = draft.tasks.map((t, i) => makeBlock(sessionId, t, i));

  const session: FlightSession = {
    id: sessionId,
    date: todayDateString(),
    windowStart: draft.windowStart,
    windowEnd: draft.windowEnd,
    windowStartAt: windowStartAt.toISOString(),
    windowEndAt: windowEndAt.toISOString(),
    status: 'ready',
    currentBlockId: null,
    lastLandedBlockId: null,
    aircraftId,
    slackRemainingMinutes: Math.max(0, computeSlackMinutes(totalMinutes, draft.tasks)),
    slackDrainedMinutes: 0,
    overtimeDrainCycleIndex: null,
    overtimeDrainNextTargetId: null,
    voyageExtended: false,
    earlyLandBonusMinutes: 0,
    lastLandingBonus: null,
    confirmedAt: new Date().toISOString(),
    endedAt: null,
  };
  return { session, blocks };
}

export function startBlock(block: Block, session: FlightSession): void {
  block.status = 'flying';
  block.startedAt = new Date().toISOString();
  block.activeBudgetMinutes = roundMinutes(block.remainingBudgetMinutes);
  session.currentBlockId = block.id;
  session.status = 'flying';
}

/** 页面04 推油门完成：起飞第一个任务 */
export function startFirstBlock(blocks: Block[], session: FlightSession): Block | null {
  const first = [...blocks].sort((a, b) => a.order - b.order).find((b) => b.status === 'planned');
  if (!first) return null;
  startBlock(first, session);
  return first;
}

/** 页面10 "准备好了，起飞"：开始下一项任务 */
export function startNextBlock(blocks: Block[], session: FlightSession): Block | null {
  return startFirstBlock(blocks, session);
}

export function peekNextBlock(blocks: Block[]): Block | null {
  return (
    [...blocks]
      .sort((a, b) => a.order - b.order)
      .find((b) => b.status === 'planned' && b.remainingBudgetMinutes > 0) ?? null
  );
}

export function hasPendingBlocks(blocks: Block[]): boolean {
  return peekNextBlock(blocks) !== null;
}

/**
 * 时间联动目标：当前任务之后、未执飞的非固定任务。
 * 固定任务豁免一切联动（不接收补给、不被扣减）。
 */
export function getLinkageTargets(blocks: Block[], current: Block): Block[] {
  return blocks
    .filter(
      (b) =>
        b.order > current.order &&
        b.type === 'custom' &&
        b.status === 'planned' &&
        b.remainingBudgetMinutes > 0,
    )
    .sort((a, b) => a.order - b.order);
}

function addOneMinute(block: Block): void {
  block.remainingBudgetMinutes = roundMinutes(block.remainingBudgetMinutes + 1);
  block.plannedDurationMinutes = roundMinutes(block.plannedDurationMinutes + 1);
}

function deductOneMinute(block: Block): void {
  block.remainingBudgetMinutes = Math.max(0, roundMinutes(block.remainingBudgetMinutes - 1));
  block.plannedDurationMinutes = Math.max(0, roundMinutes(block.plannedDurationMinutes - 1));
  if (block.remainingBudgetMinutes <= 0) {
    block.remainingBudgetMinutes = 0;
    block.status = 'incomplete';
    block.markedIncomplete = true;
  }
}

function pickNextTarget(targets: Block[], nextTargetId: string | null): Block | null {
  if (targets.length === 0) return null;
  const idx = nextTargetId ? targets.findIndex((t) => t.id === nextTargetId) : 0;
  return targets[idx < 0 ? 0 : idx];
}

/**
 * 提前进港补给：每释放 1 分钟，按后续顺序轮询补给一项 1 分钟。
 * 轮转分配的效果即均匀分配（相差不超过 1 分钟）。
 */
export function compensateMinutesSequentially(
  totalMinutes: number,
  blocks: Block[],
  current: Block,
): number {
  const total = roundMinutes(totalMinutes);
  if (total <= 0) return 0;

  let given = 0;
  let nextId: string | null = null;
  for (let i = 0; i < total; i++) {
    const targets = getLinkageTargets(blocks, current);
    if (targets.length === 0) break;
    const target = pickNextTarget(targets, nextId);
    if (!target) break;
    addOneMinute(target);
    const remaining = getLinkageTargets(blocks, current);
    const next = remaining.find((t) => t.order > target.order) ?? remaining[0] ?? null;
    nextId = next?.id ?? null;
    given += 1;
  }
  return given;
}

/**
 * 超时扣减（每超时 1 分钟处理一次）：
 * 1. 先扣未分配余量；
 * 2. 余量耗尽后，按后续任务顺序轮询扣非固定任务，每次一项 1 分钟。
 */
export function processOvertimeDrain(
  blocks: Block[],
  current: Block,
  session: FlightSession,
  overtimeMinutes: number,
): void {
  const overtime = roundMinutes(overtimeMinutes);
  if (overtime <= 0) return;

  let applied = session.overtimeDrainCycleIndex ?? 0;
  while (applied < overtime) {
    if (session.slackRemainingMinutes > 0) {
      session.slackRemainingMinutes = Math.max(0, session.slackRemainingMinutes - 1);
      session.slackDrainedMinutes += 1;
    } else {
      const targets = getLinkageTargets(blocks, current);
      const target = pickNextTarget(targets, session.overtimeDrainNextTargetId);
      if (!target) {
        session.overtimeDrainNextTargetId = null;
        applied = overtime;
        break;
      }
      deductOneMinute(target);
      const remaining = getLinkageTargets(blocks, current);
      const next = remaining.find((t) => t.order > target.order) ?? remaining[0] ?? null;
      session.overtimeDrainNextTargetId = next?.id ?? null;
    }
    applied += 1;
    session.overtimeDrainCycleIndex = applied;
  }
}

/** 执飞页 UI：超时扣减的提示信息 */
export function getDrainInfo(
  blocks: Block[],
  current: Block,
  session: FlightSession,
): { slackRemaining: number; participantCount: number; nextTargetTitle: string | null } {
  const targets = getLinkageTargets(blocks, current);
  const next = pickNextTarget(targets, session.overtimeDrainNextTargetId);
  return {
    slackRemaining: session.slackRemainingMinutes,
    participantCount: targets.length,
    nextTargetTitle: next?.title ?? null,
  };
}

/** 页面05 进港 */
export function landBlock(
  block: Block,
  session: FlightSession,
  blocks: Block[],
): { earlyBonus: number; toSlack: number } {
  const now = new Date();
  const started = block.startedAt ? new Date(block.startedAt).getTime() : now.getTime();
  const actualMinutes = Math.max(1, roundMinutes((now.getTime() - started) / 60000));
  block.actualDurationMinutes = actualMinutes;
  block.landedAt = now.toISOString();
  block.status = 'landed';

  const budgetAllocated = roundMinutes(block.activeBudgetMinutes ?? block.remainingBudgetMinutes);
  const earlyRelease = Math.max(0, budgetAllocated - actualMinutes);
  block.activeBudgetMinutes = null;

  let distributed = 0;
  let toSlack = 0;
  if (earlyRelease > 0) {
    // 优先轮询分配给后续非固定任务；分不完的（比如只剩固定任务）存入余量池
    distributed = compensateMinutesSequentially(earlyRelease, blocks, block);
    toSlack = earlyRelease - distributed;
    if (toSlack > 0) {
      session.slackRemainingMinutes += toSlack;
    }
    session.earlyLandBonusMinutes += distributed;
  }
  session.lastLandingBonus = { toTasks: distributed, toSlack };

  session.currentBlockId = null;
  session.lastLandedBlockId = block.id;
  session.status = 'betweenFlights';
  session.overtimeDrainCycleIndex = null;
  session.overtimeDrainNextTargetId = null;
  return { earlyBonus: distributed, toSlack };
}

/**
 * 页面05 ➕ 延长航程：总时长 += minutes，并把这些时间
 * 均匀分配给除固定任务外的未执飞任务（不含执飞中的与已进港的）。
 * 每航程限一次。
 */
export function extendVoyage(
  session: FlightSession,
  blocks: Block[],
  extendMinutes: number,
): boolean {
  if (session.voyageExtended) return false;
  session.voyageExtended = true;

  const end = new Date(session.windowEndAt);
  end.setMinutes(end.getMinutes() + extendMinutes);
  session.windowEndAt = end.toISOString();
  session.windowEnd = formatMinutesToTime(end.getHours() * 60 + end.getMinutes());

  const targets = blocks
    .filter((b) => b.type === 'custom' && b.status === 'planned')
    .sort((a, b) => a.order - b.order);
  const n = targets.length;
  if (n > 0) {
    const base = Math.floor(extendMinutes / n);
    let remainder = extendMinutes % n;
    for (const block of targets) {
      let delta = base;
      if (remainder > 0) {
        delta += 1;
        remainder -= 1;
      }
      if (delta <= 0) continue;
      block.remainingBudgetMinutes = roundMinutes(block.remainingBudgetMinutes + delta);
      block.plannedDurationMinutes = roundMinutes(block.plannedDurationMinutes + delta);
    }
  }
  return true;
}

export function checkWindowEnd(session: FlightSession): boolean {
  return Date.now() >= new Date(session.windowEndAt).getTime();
}

export function finishDay(session: FlightSession): FlightSession {
  return {
    ...session,
    status: 'dayEnd',
    endedAt: new Date().toISOString(),
    currentBlockId: null,
  };
}

export function cancelVoyage(session: FlightSession): FlightSession {
  return {
    ...session,
    status: 'cancelled',
    currentBlockId: null,
    endedAt: new Date().toISOString(),
  };
}

/* ---------- 页面08 摘要 ---------- */

export interface TaskReview {
  id: string;
  title: string;
  type: Block['type'];
  plannedMinutes: number;
  actualMinutes: number | null;
  completed: boolean;
  incomplete: boolean;
  skipped: boolean;
}

export function getTaskReviews(blocks: Block[]): TaskReview[] {
  return [...blocks]
    .sort((a, b) => a.order - b.order)
    .map((b) => ({
      id: b.id,
      title: b.title,
      type: b.type,
      plannedMinutes: roundMinutes(b.originalPlannedMinutes),
      actualMinutes: b.actualDurationMinutes != null ? roundMinutes(b.actualDurationMinutes) : null,
      completed: b.status === 'landed' && !b.markedIncomplete,
      incomplete: b.markedIncomplete || b.status === 'incomplete',
      skipped: b.status === 'planned',
    }));
}

export function getSessionSummary(session: FlightSession, blocks: Block[]) {
  const reviews = getTaskReviews(blocks);
  const completed = reviews.filter((r) => r.completed).length;
  const incomplete = reviews.filter((r) => r.incomplete).length;
  const totalActual = reviews.reduce((s, r) => s + (r.actualMinutes ?? 0), 0);
  return {
    total: reviews.length,
    completed,
    incomplete,
    completionRate: reviews.length ? Math.round((completed / reviews.length) * 100) : 0,
    totalActualMinutes: totalActual,
    earlyLandBonusMinutes: session.earlyLandBonusMinutes,
  };
}
