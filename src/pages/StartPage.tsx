import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { WheelPicker } from '@/components/WheelPicker';
import { Badge } from '@/components/Badge';
import { getGlobalTopBadge } from '@/lib/badges';
import { getWindowBounds } from '@/lib/time';

function formatTotal(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}小时${m > 0 ? `${m}分钟` : ''}` : `${m}分钟`;
}

/** 页面01：航程开始页 */
export function StartPage() {
  const navigate = useNavigate();
  const { settings, updateSettings, beginPlan } = useApp();
  const [start, setStart] = useState(settings.windowStart);
  const [end, setEnd] = useState(settings.windowEnd);
  const [saveDefault, setSaveDefault] = useState(false);

  const totalMinutes = useMemo(() => getWindowBounds(start, end).totalMinutes, [start, end]);
  const tooShort = totalMinutes < 30;
  const endPassed = useMemo(() => {
    const { windowEndAt } = getWindowBounds(start, end);
    return windowEndAt.getTime() <= Date.now();
  }, [start, end]);

  const handleStart = async () => {
    if (saveDefault) {
      await updateSettings({ ...settings, windowStart: start, windowEnd: end });
    }
    beginPlan(start, end);
    navigate('/plan');
  };

  // 全局最高徽章：左上角展示，点击进入徽章墙；零基础用户显示虚线占位框
  const topBadge = getGlobalTopBadge(
    settings.stats,
    settings.aircrafts.map((a) => a.id),
    settings.selectedAircraftId,
  );

  return (
    <div className="page start-page">
      <header className="page-topbar">
        <button
          className="icon-btn badge-entry"
          aria-label="机长徽章墙"
          onClick={() => navigate('/badges')}
        >
          {topBadge ? (
            <Badge aircraftId={topBadge.aircraftId} tier={topBadge.tier} size={28} />
          ) : (
            <span className="badge-empty" aria-hidden="true" />
          )}
        </button>
        <button
          className="icon-btn"
          aria-label="系统设置"
          onClick={() => navigate('/settings')}
        >
          ⚙️
        </button>
      </header>

      <div className="start-hero">
        <div className="start-plane">✈️</div>
        <h1 className="page-title">Time Pilot</h1>
        <p className="page-subtitle">今晚的航程，从这里开始</p>
      </div>

      <div className="card">
        <div className="wheel-row">
          <div className="wheel-field">
            <div className="wheel-label">开始时间</div>
            <WheelPicker value={start} onChange={setStart} />
          </div>
          <div className="wheel-field">
            <div className="wheel-label">结束时间</div>
            <WheelPicker value={end} onChange={setEnd} />
          </div>
        </div>

        <div className="start-total">
          航程总时长 <strong>{formatTotal(totalMinutes)}</strong>
          {endPassed && <div className="start-warning">结束时间已经过了，请重新选择</div>}
          {!endPassed && tooShort && (
            <div className="start-warning">航程太短啦，至少 30 分钟</div>
          )}
        </div>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={saveDefault}
            onChange={(e) => setSaveDefault(e.target.checked)}
          />
          <span>设为默认时间</span>
        </label>
      </div>

      <button
        className="btn btn-primary btn-block btn-lg"
        disabled={tooShort || endPassed}
        onClick={() => void handleStart()}
      >
        开始规划航程
      </button>
    </div>
  );
}
