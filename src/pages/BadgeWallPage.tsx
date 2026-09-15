import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Badge } from '@/components/Badge';
import { BADGE_TIERS, getAircraftVoyages, getBadgeStates } from '@/lib/badges';

/** 页面11：机长徽章墙（入口：页面01左上角徽章 / 页面09机型栏链接） */
export function BadgeWallPage() {
  const navigate = useNavigate();
  const { settings } = useApp();

  return (
    <div className="page">
      <header className="page-topbar">
        <button className="icon-btn" aria-label="返回" onClick={() => navigate(-1)}>
          ←
        </button>
        <div />
      </header>

      <div className="badge-wall-hero">
        <h1 className="page-title">🏅 机长徽章墙</h1>
        <p className="page-subtitle">
          已累计完成 {settings.stats.completedVoyages} 次航程 ·{' '}
          {BADGE_TIERS.map((t) => `${t.label} ${t.required} 次`).join(' / ')}解锁
        </p>
      </div>

      <section className="card badge-wall">
        {settings.aircrafts.map((a) => {
          const voyages = getAircraftVoyages(settings.stats, a.id);
          const states = getBadgeStates(settings.stats, a.id);
          return (
            <div key={a.id} className="badge-row">
              <div className="badge-row-head">
                <span className="badge-aircraft-name">{a.shortName}</span>
                <span className="badge-aircraft-count">
                  {a.unlocked ? `已执飞 ${voyages} 次` : '🔒 未解锁'}
                </span>
              </div>
              <div className="badge-slots">
                {states.map((s) => (
                  <div key={s.tier} className="badge-slot">
                    <Badge
                      aircraftId={a.id}
                      tier={s.tier}
                      size={56}
                      locked={!s.earned}
                      label={`${a.shortName} ${s.label}`}
                    />
                    <span className="badge-tier-name">{s.label.replace('徽章', '')}</span>
                    {!s.earned && (
                      <span className="badge-progress">
                        {a.unlocked ? `还差 ${s.remaining} 次` : '待解锁'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
