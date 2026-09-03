import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { getDayTaskReviews, getSessionSummary } from '@/lib/sessionLogic';
import type { Mood } from '@/types';

export function LandPage() {
  const { session, blocks, morningQueue, setMood, resetToday } = useApp();
  const navigate = useNavigate();

  if (!session) {
    return (
      <div>
        <h1 className="page-title">今日进港</h1>
        <p className="page-subtitle">还没有今晚的航程记录。</p>
      </div>
    );
  }

  const summary = getSessionSummary(session, blocks, morningQueue);
  const reviews = getDayTaskReviews(blocks);
  const todayQueue = morningQueue.filter((q) => q.date === session.date && !q.cleared);
  const completedCount = reviews.filter((r) => r.completed).length;

  const pickMood = (mood: Mood) => void setMood(mood);

  return (
    <div>
      <h1 className="page-title">今日进港</h1>
      <p className="page-subtitle">今晚航程已结束 · 用实际用时对照计划，看看自己的节奏</p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>今晚任务回顾</h3>
        <p className="route-hint">
          完成 {completedCount} / {reviews.length} 项 · 实际 / 计划（分钟）
        </p>
        <ul className="review-list">
          {reviews.map((item) => (
            <li key={item.id} className={`review-item ${item.completed ? 'is-done' : 'is-incomplete'}`}>
              <div className="review-main">
                <span className="review-title">{item.title}</span>
                <span className="review-time">
                  {item.actualMinutes} / {item.plannedMinutes} 分钟
                </span>
              </div>
              <span className="review-flag">{item.completed ? '完成' : '未完成'}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">朗读</div>
            <div className="stat-value">{summary.mandatoryDone ? '✓' : '未完成'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">自由飞</div>
            <div className="stat-value">{summary.freeFlyMinutesUsed} min</div>
          </div>
          <div className="stat">
            <div className="stat-label">提前进港奖励</div>
            <div className="stat-value">+{summary.earlyLandBonusMinutes} min</div>
          </div>
        </div>
      </div>

      {todayQueue.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>明早队列 · {todayQueue.length} 项</h3>
          <ul>
            {todayQueue.map((q) => (
              <li key={q.id}>{q.content}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>今天感觉</h3>
        <div className="mood-row">
          {(
            [
              ['happy', '😊'],
              ['neutral', '😐'],
              ['upset', '😫'],
            ] as const
          ).map(([mood, emoji]) => (
            <button
              key={mood}
              className={`mood-btn ${session.mood === mood ? 'selected' : ''}`}
              onClick={() => pickMood(mood)}
            >
              {emoji}
            </button>
          ))}
        </div>
        <button
          className="btn btn-secondary btn-block"
          onClick={() => {
            void (async () => {
              await resetToday();
              navigate('/evening');
            })();
          }}
        >
          开始新的今晚航程
        </button>
      </div>
    </div>
  );
}
