import type {
  AppSettings,
  Block,
  EveningSession,
  MorningQueueItem,
  PlanBlockDraft,
} from '@/types';
import { createId } from '@/lib/id';
import { getWindowBounds, roundMinutes, todayDateString, formatMinutesToTime } from '@/lib/time';

export function computePlanBudget(totalWindowMinutes: number, drafts: PlanBlockDraft[]) {
  const usedMinutes = drafts
    .filter((d) => d.type !== 'terminal' && d.type !== 'free')
    .reduce((sum, d) => sum + d.plannedDurationMinutes, 0);
  const remaining = totalWindowMinutes - usedMinutes;
  return {
    usedMinutes,
    freeMinutes: Math.max(0, remaining),
    overflowMinutes: Math.max(0, -remaining),
  };
}

export function computeFreeMinutesBudget(
  totalWindowMinutes: number,
  drafts: PlanBlockDraft[],
): number {
  return computePlanBudget(totalWindowMinutes, drafts).freeMinutes;
}

function makeBlock(
  sessionId: string,
  type: Block['type'],
  title: string,
  order: number,
  plannedDurationMinutes: number,
  minimumDurationMinutes: number,
): Block {
  return {
    id: createId(),
    sessionId,
    type,
    title,
    order,
    plannedDurationMinutes,
    remainingBudgetMinutes: plannedDurationMinutes,
    activeBudgetMinutes: null,
    minimumDurationMinutes,
    actualDurationMinutes: null,
    status: 'planned',
    startedAt: null,
    landedAt: null,
    extendUsed: false,
    queueNote: null,
    markedIncomplete: false,
    originalPlannedMinutes: plannedDurationMinutes,
  };
}

export function createSessionFromPlan(
  settings: AppSettings,
  drafts: PlanBlockDraft[],
): { session: EveningSession; blocks: Block[] } {
  const { windowStartAt, windowEndAt, totalMinutes } = getWindowBounds(
    settings.windowStart,
    settings.windowEnd,
    settings.demoMode,
  );
  const freeBudget = computeFreeMinutesBudget(totalMinutes, drafts);
  const sessionId = createId();
  const now = new Date().toISOString();

  const blocks: Block[] = drafts.map((draft, index) =>
    makeBlock(
      sessionId,
      draft.type,
      draft.title,
      index,
      draft.plannedDurationMinutes,
      draft.minimumDurationMinutes,
    ),
  );
  blocks.push(makeBlock(sessionId, 'free', '自由飞行', blocks.length, freeBudget, 0));
  blocks.push(makeBlock(sessionId, 'terminal', `${settings.windowEnd} 进港`, blocks.length, 0, 0));

  const session: EveningSession = {
    id: sessionId,
    date: todayDateString(),
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    windowStartAt: windowStartAt.toISOString(),
    windowEndAt: windowEndAt.toISOString(),
    status: 'flying',
    freeMinutesBudget: freeBudget,
    freeMinutesRemaining: freeBudget,
    earlyLandBonusMinutes: 0,
    currentBlockId: null,
    confirmedAt: now,
    endedAt: null,
    mood: null,
    overtimeDrainCycleIndex: null,
    overtimeDrainNextTargetId: null,
    planReminderShown: false,
    checkpoint: null,
    voyageExtended: false,
  };

  const firstFlyable = blocks.find(
    (b) => b.type !== 'free' && b.type !== 'terminal' && b.status === 'planned',
  );
  if (firstFlyable) {
    startBlock(firstFlyable, session);
    session.currentBlockId = firstFlyable.id;
  }

  return { session, blocks };
}

export function startBlock(block: Block, session: EveningSession): void {
  block.status = 'flying';
  block.startedAt = new Date().toISOString();
  if (block.type === 'break') {
    block.remainingBudgetMinutes = roundMinutes(block.plannedDurationMinutes);
  }
  block.activeBudgetMinutes = roundMinutes(block.remainingBudgetMinutes);
  session.currentBlockId = block.id;
  session.status = block.type === 'free' ? 'freeFly' : 'flying';
  session.checkpoint = null;
}

function syncFreeFlySession(block: Block, session: EveningSession): void {
  if (block.type === 'free') {
    session.freeMinutesRemaining = roundMinutes(block.remainingBudgetMinutes);
  }
}

/**
 * 当前航段之后、待执飞的联动项（含自由飞，不含水果经停、进港终点）
 * 自由飞在顺序上恒为最后一程（terminal 之前）
 */
export function getPendingDistributionTargets(blocks: Block[], current: Block): Block[] {
  return blocks
    .filter(
      (b) =>
        b.order > current.order &&
        b.type !== 'terminal' &&
        b.type !== 'break' &&
        b.remainingBudgetMinutes > 0 &&
        b.status !== 'incomplete' &&
        b.status !== 'landed',
    )
    .sort((a, b) => a.order - b.order);
}

/** @alias getPendingDistributionTargets */
export function getDrainTargets(blocks: Block[], current: Block): Block[] {
  return getPendingDistributionTargets(blocks, current);
}

/** 当前航段之后、不受联动影响的刚性经停 */
export function getRigidBreakBlocksAfter(blocks: Block[], current: Block): Block[] {
  return blocks.filter(
    (b) =>
      b.order > current.order &&
      b.type === 'break' &&
      b.status !== 'incomplete' &&
      b.status !== 'landed',
  );
}

export function getSubsequentBlocks(blocks: Block[], current: Block): Block[] {
  return getDrainTargets(blocks, current);
}

const ENCOURAGEMENTS: Record<string, string[]> = {
  study: ['一段搞定！节奏不错，继续保持。', '本段进港成功，准备下一程。', '很好，又完成一程航班。'],
  mandatory: ['必做项完成，这颗星点亮了。', '朗读进港，做得很棒。', '重要航段已完成。'],
  break: ['经停结束，补充完能量了。', '休息好了，继续出发。'],
  free: ['自由飞时间，好好放松。', '这是你挣来的时间，尽情玩吧。'],
};

function pickEncouragement(block: Block): string {
  if (block.markedIncomplete) {
    return '本段已进港，并记下未完成。今晚全部结束后可以一起看实际用时。';
  }
  const key = block.type === 'mandatory' ? 'mandatory' : block.type;
  const list = ENCOURAGEMENTS[key] ?? ENCOURAGEMENTS.study;
  return list[Math.floor(Math.random() * list.length)];
}

export function peekNextBlock(blocks: Block[]): Block | null {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const next = sorted.find(
    (b) =>
      b.type !== 'terminal' &&
      b.type !== 'free' &&
      b.status === 'planned' &&
      b.remainingBudgetMinutes > 0,
  );
  if (next) return next;

  const freeBlock = sorted.find(
    (b) => b.type === 'free' && b.status === 'planned' && b.remainingBudgetMinutes > 0,
  );
  return freeBlock ?? null;
}

export function buildCheckpoint(
  landedBlock: Block,
  blocks: Block[],
  _session: EveningSession,
  earlyBonusMinutes: number,
): import('@/types').SessionCheckpoint {
  const next = peekNextBlock(blocks);
  return {
    completedBlockId: landedBlock.id,
    completedTitle: landedBlock.title,
    nextBlockId: next?.id ?? null,
    nextTitle: next?.title ?? '今日进港',
    encouragement: pickEncouragement(landedBlock),
    earlyBonusMinutes: earlyBonusMinutes > 0 ? earlyBonusMinutes : undefined,
    markedIncomplete: landedBlock.markedIncomplete || undefined,
  };
}

function addOneMinuteToBlock(block: Block, session: EveningSession): void {
  block.remainingBudgetMinutes = roundMinutes(block.remainingBudgetMinutes + 1);
  block.plannedDurationMinutes = roundMinutes(block.plannedDurationMinutes + 1);
  syncFreeFlySession(block, session);
}

/**
 * 提前进港：每释放 1 分钟，按后续待飞顺序补给一项 1 分钟（与超时扣减对称）。
 * 从第一项起轮转；某项若中途被移出参与集合，则跳到当时仍可补给的下一项。
 */
export function compensateMinutesSequentially(
  totalMinutes: number,
  blocks: Block[],
  current: Block,
  session: EveningSession,
): number {
  const total = roundMinutes(totalMinutes);
  if (total <= 0) return 0;

  let given = 0;
  let nextId: string | null = null;
  for (let i = 0; i < total; i++) {
    const targets = getPendingDistributionTargets(blocks, current);
    if (targets.length === 0) break;
    const target = pickNextDrainTarget(targets, nextId);
    if (!target) break;
    addOneMinuteToBlock(target, session);
    const remaining = getPendingDistributionTargets(blocks, current);
    const next = remaining.find((t) => t.order > target.order) ?? remaining[0] ?? null;
    nextId = next?.id ?? null;
    given += 1;
  }
  return given;
}

/**
 * @deprecated 提前进港已改为 compensateMinutesSequentially；保留均分算法仅供对照。
 */
export function distributeMinutesEvenly(
  totalMinutes: number,
  targets: Block[],
  session: EveningSession,
): number {
  const total = roundMinutes(totalMinutes);
  if (total <= 0 || targets.length === 0) return 0;

  const n = targets.length;
  const base = Math.floor(total / n);
  let remainder = total % n;

  for (const block of targets) {
    let delta = base;
    if (remainder > 0) {
      delta += 1;
      remainder -= 1;
    }
    if (delta <= 0) continue;

    block.remainingBudgetMinutes = roundMinutes(block.remainingBudgetMinutes + delta);
    block.plannedDurationMinutes = roundMinutes(block.plannedDurationMinutes + delta);
    syncFreeFlySession(block, session);
  }
  return total;
}

/**
 * 扣减：与 distribute 对称，每项整分钟减少
 */
export function deductMinutesEvenly(
  totalMinutes: number,
  targets: Block[],
  session: EveningSession,
  morningQueue: MorningQueueItem[],
  sessionDate: string,
): MorningQueueItem[] {
  const total = roundMinutes(totalMinutes);
  if (total <= 0 || targets.length === 0) return morningQueue;

  let queue = [...morningQueue];
  const n = targets.length;
  const base = Math.floor(total / n);
  let remainder = total % n;

  for (const block of targets) {
    let delta = base;
    if (remainder > 0) {
      delta += 1;
      remainder -= 1;
    }
    if (delta <= 0) continue;

    block.remainingBudgetMinutes = Math.max(0, roundMinutes(block.remainingBudgetMinutes - delta));
    syncFreeFlySession(block, session);
    if (block.remainingBudgetMinutes <= 0) {
      block.remainingBudgetMinutes = 0;
      block.status = 'incomplete';
      block.markedIncomplete = true;
      queue.push({
        id: createId(),
        date: sessionDate,
        sourceBlockId: block.id,
        content: `${block.title}：时间已用完，记录为未完成`,
        cleared: false,
        clearedAt: null,
      });
    }
  }
  return queue;
}

function deductOneMinuteFromBlock(
  block: Block,
  session: EveningSession,
  morningQueue: MorningQueueItem[],
  sessionDate: string,
): MorningQueueItem[] {
  const queue = [...morningQueue];
  block.remainingBudgetMinutes = Math.max(0, roundMinutes(block.remainingBudgetMinutes - 1));
  syncFreeFlySession(block, session);
  if (block.remainingBudgetMinutes <= 0) {
    block.remainingBudgetMinutes = 0;
    block.status = 'incomplete';
    block.markedIncomplete = true;
    queue.push({
      id: createId(),
      date: sessionDate,
      sourceBlockId: block.id,
      content: `${block.title}：时间已用完，记录为未完成`,
      cleared: false,
      clearedAt: null,
    });
  }
  return queue;
}

function pickNextDrainTarget(targets: Block[], nextTargetId: string | null): Block | null {
  if (targets.length === 0) return null;
  const idx = nextTargetId ? targets.findIndex((t) => t.id === nextTargetId) : 0;
  return targets[idx < 0 ? 0 : idx];
}

/** 超时 1 分钟：按顺序扣后续一项 1 分钟 */
export function applyDrainCycle(
  blocks: Block[],
  current: Block,
  session: EveningSession,
  morningQueue: MorningQueueItem[],
): MorningQueueItem[] {
  const targets = getDrainTargets(blocks, current);
  const target = pickNextDrainTarget(targets, session.overtimeDrainNextTargetId);
  if (!target) {
    session.overtimeDrainNextTargetId = null;
    return morningQueue;
  }
  const queue = deductOneMinuteFromBlock(target, session, morningQueue, session.date);
  const remaining = getDrainTargets(blocks, current);
  const next = remaining.find((t) => t.order > target.order) ?? remaining[0] ?? null;
  session.overtimeDrainNextTargetId = next?.id ?? null;
  return queue;
}

export function processOvertimeDrain(
  blocks: Block[],
  current: Block,
  session: EveningSession,
  morningQueue: MorningQueueItem[],
  overtimeMinutes: number,
): MorningQueueItem[] {
  const overtime = roundMinutes(overtimeMinutes);
  if (overtime <= 0) return morningQueue;

  let applied = session.overtimeDrainCycleIndex ?? 0;
  if (overtime <= applied) return morningQueue;

  let queue = morningQueue;
  while (applied < overtime) {
    const targets = getDrainTargets(blocks, current);
    if (targets.length === 0) {
      session.overtimeDrainCycleIndex = overtime;
      session.overtimeDrainNextTargetId = null;
      break;
    }
    queue = applyDrainCycle(blocks, current, session, queue);
    applied += 1;
    session.overtimeDrainCycleIndex = applied;
  }
  return queue;
}

/** 执飞 UI：下一项将扣谁、距下次扣减还有多久 */
export function getDrainCycleInfo(
  blocks: Block[],
  current: Block,
  overtimeMinutes: number,
  session?: Pick<EveningSession, 'overtimeDrainCycleIndex' | 'overtimeDrainNextTargetId'>,
) {
  const targets = getDrainTargets(blocks, current);
  const participantCount = targets.length;
  if (participantCount === 0) {
    return {
      participantCount: 0,
      cycleLength: 1,
      minutesUntilNextDrain: 0,
      nextTargetTitle: null as string | null,
    };
  }
  const applied = session?.overtimeDrainCycleIndex ?? 0;
  const next = pickNextDrainTarget(targets, session?.overtimeDrainNextTargetId ?? null);
  return {
    participantCount,
    cycleLength: 1,
    minutesUntilNextDrain: overtimeMinutes > applied ? 0 : 1,
    nextTargetTitle: next?.title ?? null,
  };
}

/** @deprecated 使用 processOvertimeDrain */
export function applyParallelDrain(
  blocks: Block[],
  current: Block,
  session: EveningSession,
  morningQueue: MorningQueueItem[],
): MorningQueueItem[] {
  return applyDrainCycle(blocks, current, session, morningQueue);
}

export function getFlyableBlocks(blocks: Block[]): Block[] {
  return blocks.filter((b) => b.type !== 'terminal' && b.type !== 'free');
}

export function landBlock(
  block: Block,
  session: EveningSession,
  blocks: Block[],
  morningQueue: MorningQueueItem[],
  queueNote?: string,
): { session: EveningSession; blocks: Block[]; morningQueue: MorningQueueItem[]; earlyBonus: number } {
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
  if (earlyRelease > 0 && block.type !== 'free') {
    distributed = compensateMinutesSequentially(earlyRelease, blocks, block, session);
    session.earlyLandBonusMinutes += distributed;
  }

  if (queueNote?.trim()) {
    block.queueNote = queueNote.trim();
    morningQueue = [
      ...morningQueue,
      {
        id: createId(),
        date: session.date,
        sourceBlockId: block.id,
        content: `${block.title}：${queueNote.trim()}`,
        cleared: false,
        clearedAt: null,
      },
    ];
  }

  session.overtimeDrainCycleIndex = null;
  session.overtimeDrainNextTargetId = null;
  session.planReminderShown = false;
  const earlyBonus = block.type !== 'free' ? distributed : 0;
  return { session, blocks, morningQueue, earlyBonus };
}

/** 延长航程一次：进港时刻推迟 voyageExtendMinutes（默认 +10 → 21:40），额外时间全部加在当前执飞航段 */
export function extendVoyage(
  session: EveningSession,
  blocks: Block[],
  currentBlockId: string,
  extendMinutes: number,
): boolean {
  if (session.voyageExtended) return false;

  const current = blocks.find((b) => b.id === currentBlockId);
  if (!current || current.status !== 'flying') return false;
  if (current.type === 'break' || current.type === 'free' || current.type === 'terminal') return false;

  session.voyageExtended = true;
  const end = new Date(session.windowEndAt);
  end.setMinutes(end.getMinutes() + extendMinutes);
  session.windowEndAt = end.toISOString();
  session.windowEnd = formatMinutesToTime(end.getHours() * 60 + end.getMinutes());

  current.plannedDurationMinutes = roundMinutes(current.plannedDurationMinutes + extendMinutes);
  current.remainingBudgetMinutes = roundMinutes(current.remainingBudgetMinutes + extendMinutes);
  if (current.activeBudgetMinutes != null) {
    current.activeBudgetMinutes = roundMinutes(current.activeBudgetMinutes + extendMinutes);
  }

  const terminal = blocks.find((b) => b.type === 'terminal');
  if (terminal) {
    terminal.title = `${session.windowEnd} 进港`;
  }
  return true;
}

export function getPendingBlocks(blocks: Block[]): Block[] {
  return blocks.filter(
    (b) =>
      b.type !== 'terminal' &&
      b.type !== 'free' &&
      (b.status === 'planned' || b.status === 'flying') &&
      b.remainingBudgetMinutes > 0,
  );
}

export function needsPrioritySelection(
  blocks: Block[],
  session: EveningSession,
): Block[] {
  const pending = getPendingBlocks(blocks);
  if (pending.length < 2) return [];

  const windowRemaining = Math.max(
    0,
    Math.floor((new Date(session.windowEndAt).getTime() - Date.now()) / 60000),
  );
  const minSum = pending.reduce((s, b) => s + b.minimumDurationMinutes, 0);
  if (windowRemaining >= minSum) return [];
  return pending;
}

export function reorderBlocksByPriority(blocks: Block[], orderedIds: string[]): Block[] {
  const flyable = getFlyableBlocks(blocks).filter((b) => b.status !== 'landed' && b.status !== 'incomplete');
  const ordered = orderedIds
    .map((id) => flyable.find((b) => b.id === id))
    .filter((b): b is Block => !!b);
  const rest = flyable.filter((b) => !orderedIds.includes(b.id));
  const sequence = [...ordered, ...rest];
  const free = blocks.find((b) => b.type === 'free');
  const terminal = blocks.find((b) => b.type === 'terminal');
  const landed = blocks.filter((b) => b.status === 'landed');
  const incomplete = blocks.filter((b) => b.status === 'incomplete');

  const merged = [...landed, ...sequence, ...incomplete];
  merged.forEach((b, i) => {
    b.order = i;
  });
  const result = [...merged];
  if (free) {
    free.order = result.length;
    result.push(free);
  }
  if (terminal) {
    terminal.order = result.length;
    result.push(terminal);
  }
  return result.sort((a, b) => a.order - b.order);
}

export function markSecondIncompleteAfterPriority(
  blocks: Block[],
  firstBlockId: string,
  session: EveningSession,
  morningQueue: MorningQueueItem[],
): MorningQueueItem[] {
  const pending = getPendingBlocks(blocks).filter((b) => b.id !== firstBlockId);
  if (pending.length === 0) return morningQueue;

  const first = blocks.find((b) => b.id === firstBlockId);
  if (!first) return morningQueue;

  const windowRemaining = Math.max(
    0,
    Math.floor((new Date(session.windowEndAt).getTime() - Date.now()) / 60000),
  );
  const afterFirst = windowRemaining - first.remainingBudgetMinutes;
  const second = pending[0];
  if (afterFirst < second.minimumDurationMinutes) {
    second.status = 'incomplete';
    second.remainingBudgetMinutes = 0;
    second.markedIncomplete = true;
    return [
      ...morningQueue,
      {
        id: createId(),
        date: session.date,
        sourceBlockId: second.id,
        content: `${second.title}：做完 ${first.title} 后时间不够（至少 ${second.minimumDurationMinutes} 分钟），记录为未完成`,
        cleared: false,
        clearedAt: null,
      },
    ];
  }
  return morningQueue;
}

export function advanceToNextBlock(
  blocks: Block[],
  session: EveningSession,
): Block | null {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const next = sorted.find(
    (b) =>
      b.type !== 'terminal' &&
      b.type !== 'free' &&
      b.status === 'planned' &&
      b.remainingBudgetMinutes > 0,
  );

  if (next) {
    startBlock(next, session);
    return next;
  }

  const freeBlock = blocks.find((b) => b.type === 'free' && b.status === 'planned');
  if (freeBlock && freeBlock.remainingBudgetMinutes > 0) {
    startBlock(freeBlock, session);
    return freeBlock;
  }

  return null;
}

export function checkWindowEnd(session: EveningSession): boolean {
  return Date.now() >= new Date(session.windowEndAt).getTime();
}

export function finishDay(session: EveningSession): EveningSession {
  return {
    ...session,
    status: 'dayEnd',
    endedAt: new Date().toISOString(),
    currentBlockId: null,
  };
}

/** 取消当晚全部航程：不进港、不统计，只留下取消状态 */
export function cancelVoyage(session: EveningSession): EveningSession {
  return {
    ...session,
    status: 'cancelled',
    checkpoint: null,
    currentBlockId: null,
    endedAt: new Date().toISOString(),
  };
}

export function getBlockPlannedEnd(block: Block): Date | null {
  if (!block.startedAt) return null;
  return new Date(new Date(block.startedAt).getTime() + block.plannedDurationMinutes * 60000);
}

export function isTaskIncomplete(block: Block): boolean {
  return block.markedIncomplete || block.status === 'incomplete';
}

export function isTaskCompleted(block: Block): boolean {
  return block.status === 'landed' && !isTaskIncomplete(block);
}

export function getDayTaskReviews(blocks: Block[]) {
  return [...blocks]
    .filter((b) => b.type !== 'terminal')
    .sort((a, b) => a.order - b.order)
    .map((b) => {
      const plannedMinutes = roundMinutes(b.originalPlannedMinutes ?? b.plannedDurationMinutes);
      const actualMinutes =
        b.actualDurationMinutes != null
          ? roundMinutes(b.actualDurationMinutes)
          : b.startedAt
            ? Math.max(1, roundMinutes((Date.now() - new Date(b.startedAt).getTime()) / 60000))
            : 0;
      return {
        id: b.id,
        title: b.type === 'free' ? `${b.title} · 最后一程` : b.title,
        type: b.type,
        plannedMinutes,
        actualMinutes,
        completed: isTaskCompleted(b),
        incomplete: isTaskIncomplete(b),
      };
    });
}

export function getSessionSummary(
  session: EveningSession,
  blocks: Block[],
  morningQueue: MorningQueueItem[],
) {
  const flyable = getFlyableBlocks(blocks);
  const completed = flyable.filter((b) => isTaskCompleted(b)).length;
  const reading = blocks.find((b) => b.title === '英语朗读');
  const mandatoryDone = reading ? isTaskCompleted(reading) : false;
  const freeBlock = blocks.find((b) => b.type === 'free');
  const freeUsed = freeBlock?.actualDurationMinutes ?? 0;

  return {
    blocksCompleted: completed,
    mandatoryDone,
    freeFlyMinutesUsed: freeUsed,
    earlyLandBonusMinutes: session.earlyLandBonusMinutes,
    morningQueueCount: morningQueue.filter((q) => !q.cleared && q.date === session.date).length,
  };
}
