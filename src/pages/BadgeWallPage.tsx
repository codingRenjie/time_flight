import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Badge } from '@/components/Badge';
import {
  BADGE_TIERS,
  getAircraftVoyages,
  getBadgeStates,
  listEarnedBadges,
  resolveDisplayBadge,
} from '@/lib/badges';
import type { BadgeTier } from '@/types';

/** 页面11：机长徽章墙（入口：页面01左上角徽章 / 页面09机型栏链接） */
export function BadgeWallPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useApp();
  const displayBadge = resolveDisplayBadge(settings);
  const earnedCount = listEarnedBadges(
    settings.stats,
    settings.aircrafts.map((a) => a.id),
  ).length;

  const chooseBadge = (aircraftId: string, tier: BadgeTier) => {
    if (earnedCount < 2) return;
    void updateSettings({ ...settings, displayBadge: { aircraftId, tier } });
  };

  return (
    <div className="page badge-wall-page">
      <header className="page-topbar">
        <button className="icon-btn" aria-label="返回" onClick={() => navigate(-1)}>
          ‹
        </button>
        <div className="topbar-title">机长徽章墙</div>
        <div className="topbar-spacer" />
      </header>

      <div className="badge-wall-hero">
        <p className="badge-wall-stats">已完成 {settings.stats.completedVoyages} 次航程</p>
        <p className="badge-wall-rules">
          {BADGE_TIERS.map((t) => `${t.label.replace('徽章', '')} ${t.required} 次`).join(' · ')}
        </p>
        {earnedCount > 1 && (
          <p className="badge-wall-hint">点选一枚徽章，它会显示在航程页面上</p>
        )}
      </div>

      <section className="card badge-wall">
        {settings.aircrafts.map((a) => {
          const voyages = getAircraftVoyages(settings.stats, a.id);
          const states = getBadgeStates(settings.stats, a.id);
          return (
            <div key={a.id} className={`badge-row${a.unlocked ? '' : ' is-locked'}`}>
              <div className="badge-row-head">
                <span className="badge-aircraft-name">{a.shortName}</span>
                <span className="badge-aircraft-count">
                  {a.unlocked ? `已执飞 ${voyages} 次` : '未解锁'}
                </span>
              </div>
              <div className="badge-slots">
                {states.map((s) => {
                  const chosen =
                    displayBadge?.aircraftId === a.id && displayBadge.tier === s.tier;
                  const badge = (
                    <Badge
                      aircraftId={a.id}
                      tier={s.tier}
                      size={72}
                      fluid
                      locked={!s.earned}
                      label={`${a.shortName} ${s.label}`}
                    />
                  );
                  return (
                  <div key={s.tier} className={`badge-slot${chosen ? ' is-chosen' : ''}`}>
                    {s.earned && earnedCount > 1 ? (
                      <button
                        type="button"
                        className={`badge-pick${chosen ? ' is-chosen' : ''}`}
                        aria-pressed={chosen}
                        aria-label={`${chosen ? '当前展示' : '选择'}${a.shortName}${s.label}`}
                        onClick={() => chooseBadge(a.id, s.tier)}
                      >
                        {badge}
                      </button>
                    ) : (
                      <span className={chosen ? 'badge-pick is-chosen' : undefined}>{badge}</span>
                    )}
                    <span className="badge-tier-name">{s.label.replace('徽章', '')}</span>
                    {!s.earned && (
                      <span className="badge-progress">
                        {a.unlocked ? `还差 ${s.remaining} 次` : '待解锁'}
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
