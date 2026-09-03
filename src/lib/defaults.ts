import type { BlockTemplate, AppSettings } from '@/types';
import { createId } from '@/lib/id';

export const DEFAULT_TEMPLATES: BlockTemplate[] = [
  {
    id: 'tpl-reading',
    type: 'mandatory',
    title: '英语朗读',
    defaultDurationMinutes: 15,
    minimumDurationMinutes: 15,
    isDeletable: false,
    isEnabled: true,
  },
  {
    id: 'tpl-fruit',
    type: 'break',
    title: '吃水果',
    defaultDurationMinutes: 15,
    minimumDurationMinutes: 15,
    isDeletable: false,
    isEnabled: true,
  },
];

/** 旧版预置学习块，加载时从本机设置里清掉，避免任务池一打开就挤满 */
export const LEGACY_STUDY_TEMPLATE_IDS = new Set([
  'tpl-math',
  'tpl-correction',
  'tpl-english',
  'tpl-chinese',
]);

export const DEFAULT_SETTINGS: AppSettings = {
  windowStart: '19:30',
  windowEnd: '21:30',
  freeFlyForceStart: '21:10',
  voyageExtendMinutes: 10,
  demoMode: true,
  templates: DEFAULT_TEMPLATES,
};

export function isFixedModule(template: BlockTemplate) {
  return template.type === 'mandatory' || template.type === 'break';
}

/** 重置今日：去掉当晚加入的学习块，只保留设置里的固定执飞模块 */
export function keepFixedModuleSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    templates: settings.templates.filter(isFixedModule),
  };
}

export function createDefaultPlanDrafts(settings: AppSettings) {
  return settings.templates.filter((t) => t.isEnabled).map((t) => templateToDraft(t));
}

export function templateToDraft(template: BlockTemplate) {
  return {
    id: createId(),
    templateId: template.id,
    type: template.type as 'mandatory' | 'break' | 'study',
    title: template.title,
    plannedDurationMinutes: template.defaultDurationMinutes,
    minimumDurationMinutes: template.minimumDurationMinutes,
    isDeletable: template.isDeletable,
  };
}
