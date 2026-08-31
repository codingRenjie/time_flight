import { useApp } from '@/context/AppContext';
import { getSessionSummary } from '@/lib/sessionLogic';
import type { Mood } from '@/types';

export function LandPage() {
  const { session, blocks, morningQueue, setMood, resetToday } = useApp();

  if (!session) {
    return (
      <div>
        <h1 className="page-title">今日进港</h1>
        <p className="page-subtitle">还没有今晚的航程记录。</p>
      </div>
    );
  }

  const summary = getSessionSummary(session, blocks, morningQueue);
  const todayQueue = morningQueue.filter((q) => q.date === session.date && !q.cleared);
  const incompleteBlocks = blocks.filter((b) => b.status === 'incomplete');

  const pickMood = (mood: Mood) => void setMood(mood);

  return (
    <div>
      <h1 className="page-title">今日进港</h1>
      <p className="page-subtitle">今晚航程已结束 · 中性记录如下</p>

      <div className="card">
        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">完成航段</div>
            <div className="stat-value">{summary.blocksCompleted}</div>
          </div>
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

      {(todayQueue.length > 0 || incompleteBlocks.length > 0) && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>明早队列 · {todayQueue.length} 项</h3>
          <ul>
            {todayQueue.map((q) => (
              <li key={q.id}>{q.content}</li>
            ))}
            {incompleteBlocks
              .filter((b) => !todayQueue.some((q) => q.sourceBlockId === b.id))
              .map((b) => (
                <li key={b.id}>{b.title}：记录为未完成</li>
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
        <button className="btn btn-secondary btn-block" onClick={() => void resetToday()}>
          开始新的今晚航程
        </button>
      </div>
    </div>
  );
}
