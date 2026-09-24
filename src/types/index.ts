/** 任务类型：mandatory = 固定任务（不可移除、不参与时间联动）；custom = 用户自建任务 */
export type BlockType = 'mandatory' | 'custom';

export type BlockStatus = 'planned' | 'flying' | 'landed' | 'incomplete';

/**
 * ready          航程已创建（页面03 按下"立即执飞"），等待页面04 推油门
 * flying         有任务正在执飞（页面05）
 * betweenFlights 一项任务刚进港，处于页面06/10 之间
 * dayEnd         全部完成（页面08）
 * cancelled      航程取消（页面07）
 */
export type SessionStatus = 'ready' | 'flying' | 'betweenFlights' | 'dayEnd' | 'cancelled';

export type SoundType = 'engine' | 'rain' | 'snow' | 'waterfall' | 'campfire' | 'music';

export type ViewType = 'cockpit' | 'wing';

/** 徽章等级（按机型完成航程数解锁：铜 1 / 银 5 / 金 20） */
export type BadgeTier = 'bronze' | 'silver' | 'gold';

export interface Aircraft {
  id: string;
  /** 展示全名，如 庞巴迪 Challenger 650 */
  name: string;
  /** 短名，如 Challenger 350 */
  shortName: string;
  /** 列表与卡片上的缩略图 */
  image: string;
  /** 机型介绍弹窗里的大图 */
  heroImage: string;
  unlocked: boolean;
  unlockHint?: string;
}

export interface FixedTaskTemplate {
  id: string;
  title: string;
  defaultDurationMinutes: number;
}

export interface Block {
  id: string;
  sessionId: string;
  type: BlockType;
  title: string;
  order: number;
  /** 当前预算（随联动增减改写） */
  plannedDurationMinutes: number;
  remainingBudgetMinutes: number;
  /** 本段起飞时快照的可用时长 */
  activeBudgetMinutes: number | null;
  actualDurationMinutes: number | null;
  status: BlockStatus;
  startedAt: string | null;
  landedAt: string | null;
  markedIncomplete: boolean;
  /** 排航程时的计划分钟，不随联动改写 */
  originalPlannedMinutes: number;
}

export interface FlightSession {
  id: string;
  date: string;
  windowStart: string;
  windowEnd: string;
  windowStartAt: string;
  windowEndAt: string;
  status: SessionStatus;
  currentBlockId: string | null;
  /** 刚进港的任务（页面06 展示用） */
  lastLandedBlockId: string | null;
  aircraftId: string;
  /** 未分配余量：起飞时 航程总时长 - 任务总时长 */
  slackRemainingMinutes: number;
  /** 超时已吃掉的余量 */
  slackDrainedMinutes: number;
  /** 余量耗尽后，超时轮询扣减的进度 */
  overtimeDrainCycleIndex: number | null;
  overtimeDrainNextTargetId: string | null;
  voyageExtended: boolean;
  earlyLandBonusMinutes: number;
  /** 刚进港任务的提前释放去向（页面06 展示用） */
  lastLandingBonus: { toTasks: number; toSlack: number } | null;
  confirmedAt: string;
  endedAt: string | null;
}

export interface AppStats {
  completedVoyages: number;
  totalFlownMinutes: number;
  /** 每个机型各自累计完成的航程数（徽章系统由此派生） */
  voyagesByAircraft: Record<string, number>;
}

export interface AppSettings {
  /** 页面01 的默认时间 */
  windowStart: string;
  windowEnd: string;
  aircrafts: Aircraft[];
  selectedAircraftId: string;
  fixedTasks: FixedTaskTemplate[];
  voyageExtendEnabled: boolean;
  voyageExtendMinutes: number;
  soundType: SoundType;
  soundVolume: number;
  /** 背景音总开关（关闭时推杆短音效仍保留） */
  soundEnabled: boolean;
  /** 执飞期间保持屏幕常亮（Wake Lock） */
  keepScreenOn: boolean;
  viewType: ViewType;
  stats: AppStats;
}

/** 页面01→02→03 期间的规划草稿（仅内存，不落库） */
export interface PlanTaskDraft {
  id: string;
  templateId: string | null;
  type: BlockType;
  title: string;
  plannedDurationMinutes: number;
  isFixed: boolean;
}

export interface PlanDraft {
  windowStart: string;
  windowEnd: string;
  tasks: PlanTaskDraft[];
}

export interface AppState {
  settings: AppSettings;
  session: FlightSession | null;
  blocks: Block[];
}
