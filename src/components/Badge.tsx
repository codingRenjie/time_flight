import { badgeImage } from '@/lib/badges';
import type { BadgeTier } from '@/types';

/**
 * 机型徽章。素材是透明底的奖章或机型剪影，按高度缩放，保持原比例。
 * locked 时灰化显示（徽章墙上未获得的槽位）。
 */
export function Badge({
  aircraftId,
  tier,
  size = 40,
  locked = false,
  label,
  fluid = false,
}: {
  aircraftId: string;
  tier: BadgeTier;
  size?: number;
  locked?: boolean;
  label?: string;
  /** 在等宽格子里按比例缩放，避免宽幅机型徽章互相重叠 */
  fluid?: boolean;
}) {
  return (
    <img
      src={badgeImage(aircraftId, tier)}
      alt={label ?? `${tier} 徽章`}
      title={label}
      className={`badge-img${locked ? ' is-locked' : ''}`}
      style={
        fluid
          ? { width: '100%', height: size, objectFit: 'contain' }
          : { height: size, width: 'auto' }
      }
      draggable={false}
    />
  );
}
