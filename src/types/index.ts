export type BlockType = 'mandatory' | 'break' | 'study' | 'free' | 'terminal';

export type BlockStatus =
  | 'planned'
  | 'flying'
  | 'landed'
  | 'incomplete'
  | 'queued_for_morning';

export type SessionStatus = 'idle' | 'planning' | 'flying' | 'freeFly' | 'dayEnd';

export type Mood = 'happy' | 'neutral' | 'upset';

export interface BlockTemplate {
  id: string;
  type: 'mandatory' | 'break' | 'study';
  title: string;
  defaultDurationMinutes: number;
  minimumDurationMinutes: number;
  isDeletable: boolean;
  isEnabled: boolean;
}

export interface Block {
  id: string;
  sessionId: string;
  type: BlockType;
  title: string;
  order: number;
  plannedDurationMinutes: number;
  remainingBudgetMinutes: number;
  /** 本段起飞时快照的可用时长（含之前联动扣减后的剩余） */
  activeBudgetMinutes: number | null;
  minimumDurationMinutes: number;
  actualDurationMinutes: number | null;
  status: BlockStatus;
  startedAt: string | null;
  landedAt: string | null;
  extendUsed: boolean;
  queueNote: string | null;
}

export interface SessionCheckpoint {
  completedBlockId: string;
  completedTitle: string;
  nextBlockId: string | null;
  nextTitle: string;
  encouragement: string;
  earlyBonusMinutes?: number;
}

export interface MorningQueueItem {
  id: string;
  date: string;
  sourceBlockId: string;
  content: string;
  cleared: boolean;
  clearedAt: string | null;
}

export interface EveningSession {
  id: string;
  date: string;
  windowStart: string;
  windowEnd: string;
  windowStartAt: string;
  windowEndAt: string;
  status: SessionStatus;
  freeMinutesBudget: number;
  freeMinutesRemaining: number;
  earlyLandBonusMinutes: number;
  currentBlockId: string | null;
  confirmedAt: string | null;
  endedAt: string | null;
  mood: Mood | null;
  /** 本段超时已联动扣掉的整分钟数（按后续航段顺序逐项扣） */
  overtimeDrainCycleIndex: number | null;
  /** 下一分钟超时将扣减的联动航段 */
  overtimeDrainNextTargetId: string | null;
  planReminderShown: boolean;
  voyageExtended: boolean;
  checkpoint: SessionCheckpoint | null;
}

export interface AppSettings {
  windowStart: string;
  windowEnd: string;
  freeFlyForceStart: string;
  voyageExtendMinutes: number;
  demoMode: boolean;
  templates: BlockTemplate[];
}

export interface DaySummary {
  sessionId: string;
  date: string;
  blocksCompleted: number;
  mandatoryDone: boolean;
  freeFlyMinutesUsed: number;
  earlyLandBonusMinutes: number;
  morningQueueCount: number;
  mood: Mood | null;
}

export interface PlanBlockDraft {
  id: string;
  templateId: string;
  type: BlockType;
  title: string;
  plannedDurationMinutes: number;
  minimumDurationMinutes: number;
  isDeletable: boolean;
}

export interface AppState {
  settings: AppSettings;
  session: EveningSession | null;
  blocks: Block[];
  morningQueue: MorningQueueItem[];
}
