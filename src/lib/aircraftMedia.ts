import type { ViewType } from '@/types';

/** 页面05 两种视角，以及页面08 着陆后滑行。路径相对网站根目录。 */
const MEDIA: Record<string, { cockpit: string; wing: string; taxi: string }> = {
  'ac-c172': {
    cockpit: '/assets/video/c172-cockpit.mp4',
    wing: '/assets/video/c172-wing.mp4',
    taxi: '/assets/video/c172-taxi.mp4',
  },
  'ac-pc12': {
    cockpit: '/assets/video/pc12-cockpit.mp4',
    wing: '/assets/video/pc12-wing.mp4',
    taxi: '/assets/video/pc12-taxi.mp4',
  },
  'ac-challenger350': {
    cockpit: '/assets/video/cl350-cockpit.mp4',
    wing: '/assets/video/cl350-wing.mp4',
    taxi: '/assets/video/cl350-taxi.mp4',
  },
};

const FALLBACK = MEDIA['ac-c172'];

function row(aircraftId: string) {
  return MEDIA[aircraftId] ?? FALLBACK;
}

/** 页面05：当前机型 + 驾驶舱/机翼开关 */
export function flyBackground(aircraftId: string, view: ViewType): { image: string; videoSrc: string } {
  const media = row(aircraftId);
  const wing = view === 'wing';
  return {
    videoSrc: wing ? media.wing : media.cockpit,
    image: wing ? '/assets/bg-wing.png' : '/assets/bg-cockpit.png',
  };
}

/** 页面08：按本趟航程的机型播着陆后滑行 */
export function taxiBackground(aircraftId: string): { image: string; videoSrc: string } {
  return {
    videoSrc: row(aircraftId).taxi,
    image: '/assets/bg-taxiing.png',
  };
}
