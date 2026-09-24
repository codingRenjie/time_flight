import type { Aircraft, AppSettings, FixedTaskTemplate, PlanTaskDraft } from '@/types';
import { createId } from '@/lib/id';

/** 任务时长调整规则：步进 5 分钟，最短 5 分钟，最长 180 分钟 */
export const TASK_DURATION_STEP = 5;
export const TASK_DURATION_MIN = 5;
export const TASK_DURATION_MAX = 180;

export const DEFAULT_AIRCRAFTS: Aircraft[] = [
  {
    id: 'ac-c172',
    name: 'Cessna 172',
    shortName: 'Cessna 172',
    image: '/assets/aircraft/c172-thumb.jpg',
    heroImage: '/assets/aircraft/c172-hero.jpg',
    unlocked: true,
  },
  {
    id: 'ac-pc12',
    name: 'Pilatus PC-12',
    shortName: 'PC-12',
    image: '/assets/aircraft/pc12-thumb.jpg',
    heroImage: '/assets/aircraft/pc12-hero.jpg',
    unlocked: false,
    unlockHint: '完成 5 次航程解锁',
  },
  {
    id: 'ac-challenger350',
    name: 'Bombardier Challenger 350',
    shortName: 'Challenger 350',
    image: '/assets/aircraft/cl350-thumb.jpg',
    heroImage: '/assets/aircraft/cl350-hero.jpg',
    unlocked: false,
    unlockHint: '完成 15 次航程解锁',
  },
];

/** 机型百科：静态简介文案（页面02 机型卡片弹窗用），与持久化数据解耦 */
export const AIRCRAFT_INFO: Record<string, { description: string }> = {
  'ac-c172': {
    description:
      '美国赛斯纳（Cessna）公司生产的Skyhawk 172（简称C172）是全球最畅销、产量最高的单发活塞飞机，1956年首飞以来累计交付超4.4万架。它采用上单翼、四座布局，飞行平稳易操控、维护便宜，是全球飞行学校和私人爱好者入门飞行的首选机型，被誉为"飞行界的丰田"。',
  },
  'ac-pc12': {
    description:
      '瑞士皮拉图斯公司（Pilatus）生产的PC-12是全球产量最大的单发涡桨公务机，1994年投入运营，9座布局，最大航程约3000公里。它可靠性强、可在短跑道和简易跑道起降，广泛用于公务运输、货运、跳伞和医疗后送，被誉为"空中瑞士军刀"。',
  },
  'ac-challenger350': {
    description:
      '庞巴迪挑战者350（Bombardier Challenger 350）是超中型公务机，2013年首飞、2014年服役，航程约6400公里，可直达中国境内任意两点。它客舱宽敞舒适、飞行平稳，连续多年销量居同级别全球第一，是商务包机市场最受欢迎的机型之一。',
  },
};

export const DEFAULT_FIXED_TASKS: FixedTaskTemplate[] = [
  { id: 'tpl-fruit', title: '吃水果', defaultDurationMinutes: 15 },
  { id: 'tpl-duolingo', title: '多邻国', defaultDurationMinutes: 15 },
];

export const DEFAULT_SETTINGS: AppSettings = {
  windowStart: '18:30',
  windowEnd: '21:30',
  aircrafts: DEFAULT_AIRCRAFTS,
  selectedAircraftId: 'ac-c172',
  fixedTasks: DEFAULT_FIXED_TASKS,
  voyageExtendEnabled: true,
  voyageExtendMinutes: 30,
  soundType: 'engine',
  soundVolume: 0.6,
  soundEnabled: true,
  keepScreenOn: true,
  viewType: 'cockpit',
  stats: { completedVoyages: 0, totalFlownMinutes: 0, voyagesByAircraft: {} },
  displayBadge: null,
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
