import type { AppStats, BadgeTier } from '@/types';

/** 徽章等级配置：按「该机型的完成航程数」解锁 */
export const BADGE_TIERS: { tier: BadgeTier; label: string; required: number }[] = [
  { tier: 'bronze', label: '铜质徽章', required: 1 },
  { tier: 'silver', label: '银质徽章', required: 5 },
  { tier: 'gold', label: '金质徽章', required: 20 },
];

export function badgeImage(aircraftId: string, tier: BadgeTier): string {
  return `/assets/badges/badge-${aircraftId}-${tier}.png`;
}

export function getAircraftVoyages(stats: AppStats, aircraftId: string): number {
  // 可选链兜底：旧版本存储的 stats 可能还没有 voyagesByAircraft 字段
  return stats.voyagesByAircraft?.[aircraftId] ?? 0;
}

/** 该机型已获得的最高徽章等级（未获得返回 null） */
export function getHighestTier(stats: AppStats, aircraftId: string): BadgeTier | null {
  const n = getAircraftVoyages(stats, aircraftId);
  let top: BadgeTier | null = null;
  for (const t of BADGE_TIERS) {
    if (n >= t.required) top = t.tier;
  }
  return top;
}

/** 该机型各等级的获得状态与下一级差距（徽章墙用） */
export function getBadgeStates(stats: AppStats, aircraftId: string) {
  const n = getAircraftVoyages(stats, aircraftId);
  return BADGE_TIERS.map((t) => ({
    ...t,
    earned: n >= t.required,
    remaining: Math.max(0, t.required - n),
  }));
}

/** 对比前后统计，返回本趟航程新获得的徽章等级（完成页庆祝用） */
export function getNewlyEarnedTier(
  prev: AppStats,
  next: AppStats,
  aircraftId: string,
): BadgeTier | null {
  const before = getHighestTier(prev, aircraftId);
  const after = getHighestTier(next, aircraftId);
  return after !== before ? after : null;
}

export function getTierLabel(tier: BadgeTier): string {
  return BADGE_TIERS.find((t) => t.tier === tier)?.label ?? '';
}

/** 全局最高徽章（页面01左上角展示用）：跨机型取最高等级；同级优先当前选中机型，再比航程数 */
export function getGlobalTopBadge(
  stats: AppStats,
  aircraftIds: string[],
  preferredAircraftId?: string,
): { aircraftId: string; tier: BadgeTier } | null {
  const rank = (t: BadgeTier) => BADGE_TIERS.findIndex((x) => x.tier === t);
  let best: { aircraftId: string; tier: BadgeTier } | null = null;
  for (const id of aircraftIds) {
    const tier = getHighestTier(stats, id);
    if (!tier) continue;
    if (!best || rank(tier) > rank(best.tier)) {
      best = { aircraftId: id, tier };
      continue;
    }
    if (rank(tier) < rank(best.tier)) continue;
    const preferSelected = id === preferredAircraftId && best.aircraftId !== preferredAircraftId;
    const moreVoyages =
      best.aircraftId !== preferredAircraftId &&
      getAircraftVoyages(stats, id) > getAircraftVoyages(stats, best.aircraftId);
    if (preferSelected || moreVoyages) best = { aircraftId: id, tier };
  }
  return best;
}
