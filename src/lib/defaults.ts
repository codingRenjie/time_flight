import type { Aircraft, AppSettings, FixedTaskTemplate, PlanTaskDraft } from '@/types';
import { createId } from '@/lib/id';

/** 任务时长调整规则：步进 5 分钟，最短 5 分钟，最长 180 分钟 */
export const TASK_DURATION_STEP = 5;
export const TASK_DURATION_MIN = 5;
export const TASK_DURATION_MAX = 180;

export const DEFAULT_AIRCRAFTS: Aircraft[] = [
  {
    id: 'ac-challenger650',
    name: '庞巴迪 Challenger 650',
    shortName: 'Challenger 650',
    image: '/assets/aircraft-challenger650.png',
    unlocked: true,
  },
  {
    id: 'ac-g650',
    name: '湾流 G650',
    shortName: 'G650',
    image: '/assets/aircraft-g650.png',
    unlocked: false,
    unlockHint: '完成 5 次航程解锁',
  },
  {
    id: 'ac-bell407',
    name: '贝尔 407 直升机',
    shortName: 'Bell 407',
    image: '/assets/aircraft-bell407.png',
    unlocked: false,
    unlockHint: '完成 15 次航程解锁',
  },
];

export const DEFAULT_FIXED_TASKS: FixedTaskTemplate[] = [
  { id: 'tpl-fruit', title: '吃水果', defaultDurationMinutes: 15 },
  { id: 'tpl-duolingo', title: '多邻国', defaultDurationMinutes: 15 },
];

export const DEFAULT_SETTINGS: AppSettings = {
  windowStart: '18:30',
  windowEnd: '21:30',
  aircrafts: DEFAULT_AIRCRAFTS,
  selectedAircraftId: 'ac-challenger650',
  fixedTasks: DEFAULT_FIXED_TASKS,
  voyageExtendEnabled: true,
  voyageExtendMinutes: 30,
  soundType: 'engine',
  soundVolume: 0.6,
  soundEnabled: true,
  keepScreenOn: true,
  viewType: 'cockpit',
  stats: { completedVoyages: 0, totalFlownMinutes: 0, voyagesByAircraft: {} },
};

export const SOUND_OPTIONS: { type: import('@/types').SoundType; label: string }[] = [
  { type: 'engine', label: '飞机白噪音' },
  { type: 'rain', label: '下大雨' },
  { type: 'snow', label: '暴风雪' },
  { type: 'waterfall', label: '瀑布' },
  { type: 'campfire', label: '篝火' },
  { type: 'music', label: '专注音乐' },
];

export const VIEW_OPTIONS: { type: import('@/types').ViewType; label: string }[] = [
  { type: 'cockpit', label: '驾驶舱视角' },
  { type: 'wing', label: '机翼掠云视角' },
];

export function createDefaultPlanTasks(settings: AppSettings): PlanTaskDraft[] {
  return settings.fixedTasks.map((t) => ({
    id: createId(),
    templateId: t.id,
    type: 'mandatory',
    title: t.title,
    plannedDurationMinutes: t.defaultDurationMinutes,
    isFixed: true,
  }));
}

export function clampTaskDuration(minutes: number): number {
  return Math.min(TASK_DURATION_MAX, Math.max(TASK_DURATION_MIN, minutes));
}
