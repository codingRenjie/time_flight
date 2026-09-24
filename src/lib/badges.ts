import type { AppSettings, AppStats, BadgeTier } from '@/types';

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

export interface EarnedBadge {
  aircraftId: string;
  tier: BadgeTier;
}

/** 全部已获得的徽章，按机型目录顺序、再按铜银金 */
export function listEarnedBadges(stats: AppStats, aircraftIds: string[]): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  for (const id of aircraftIds) {
    const n = getAircraftVoyages(stats, id);
    for (const t of BADGE_TIERS) {
      if (n >= t.required) earned.push({ aircraftId: id, tier: t.tier });
    }
  }
  return earned;
}

/**
 * 航程页上要展示的那一枚。
 * 没有徽章时为空；只有一枚时就是那一枚；多枚时用用户在徽章墙上的选择。
 * 还没选过时，回退到当前最高等级。
 */
export function resolveDisplayBadge(settings: AppSettings): EarnedBadge | null {
  const ids = settings.aircrafts.map((a) => a.id);
  const earned = listEarnedBadges(settings.stats, ids);
  if (earned.length === 0) return null;
  if (earned.length === 1) return earned[0];
  const saved = settings.displayBadge;
  if (saved && earned.some((b) => b.aircraftId === saved.aircraftId && b.tier === saved.tier)) {
    return saved;
  }
  return getGlobalTopBadge(settings.stats, ids, settings.selectedAircraftId);
}

/** 全局最高徽章：跨机型取最高等级；同级优先当前选中机型，再比航程数 */
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
