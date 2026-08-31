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
    title: '水果经停',
    defaultDurationMinutes: 15,
    minimumDurationMinutes: 15,
    isDeletable: false,
    isEnabled: true,
  },
  {
    id: 'tpl-math',
    type: 'study',
    title: '数学巩固',
    defaultDurationMinutes: 45,
    minimumDurationMinutes: 45,
    isDeletable: true,
    isEnabled: true,
  },
  {
    id: 'tpl-correction',
    type: 'study',
    title: '数学订正',
    defaultDurationMinutes: 15,
    minimumDurationMinutes: 15,
    isDeletable: true,
    isEnabled: true,
  },
  {
    id: 'tpl-english',
    type: 'study',
    title: '英语其他',
    defaultDurationMinutes: 20,
    minimumDurationMinutes: 20,
    isDeletable: true,
    isEnabled: true,
  },
  {
    id: 'tpl-chinese',
    type: 'study',
    title: '语文巩固',
    defaultDurationMinutes: 30,
    minimumDurationMinutes: 30,
    isDeletable: true,
    isEnabled: true,
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  windowStart: '19:30',
  windowEnd: '21:30',
  freeFlyForceStart: '21:10',
  voyageExtendMinutes: 10,
  demoMode: true,
  templates: DEFAULT_TEMPLATES,
};

export function createDefaultPlanDrafts(settings: AppSettings) {
  const math = settings.templates.find((t) => t.id === 'tpl-math');
  const reading = settings.templates.find((t) => t.id === 'tpl-reading');
  const fruit = settings.templates.find((t) => t.id === 'tpl-fruit');
  const correction = settings.templates.find((t) => t.id === 'tpl-correction');

  const drafts = [];
  if (math) drafts.push(templateToDraft(math));
  if (reading) drafts.push(templateToDraft(reading));
  if (fruit) drafts.push(templateToDraft(fruit));
  if (correction) drafts.push(templateToDraft(correction));
  return drafts;
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
