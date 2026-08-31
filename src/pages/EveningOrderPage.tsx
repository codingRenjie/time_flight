import { useRef, useState, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { useEveningPlan } from '@/pages/EveningLayout';

export function EveningOrderPage() {
  const { confirmRoute } = useApp();
  const { drafts, setDrafts, overflowMinutes, freeMinutes } = useEveningPlan();
  const navigate = useNavigate();
  const [showOverbook, setShowOverbook] = useState(false);
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; slot: number } | null>(
    null,
  );
  const listRef = useRef<HTMLUListElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const startYRef = useRef(0);
  const fromRef = useRef(0);
  const toRef = useRef(0);
  const slotRef = useRef(76);
  const dragElRef = useRef<HTMLElement | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const moveDraftById = (id: string, to: number) => {
    setDrafts((d) => {
      const from = d.findIndex((x) => x.id === id);
      if (from < 0 || from === to || to < 0 || to >= d.length) return d;
      const next = [...d];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const onHandlePointerDown = (event: PointerEvent, id: string) => {
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const item = handle.closest('.route-item') as HTMLElement | null;
    if (!item) return;
    const from = draftsRef.current.findIndex((x) => x.id === id);
    if (from < 0) return;
    const next = item.nextElementSibling as HTMLElement | null;
    const slot = next
      ? next.getBoundingClientRect().top - item.getBoundingClientRect().top
      : item.getBoundingClientRect().height + 8;

    dragIdRef.current = id;
    startYRef.current = event.clientY;
    fromRef.current = from;
    toRef.current = from;
    slotRef.current = slot || 76;
    dragElRef.current = item;
    item.style.transition = 'none';
    item.style.transform = 'translateY(0px) scale(1.03)';
    setDrag({ id, from, to: from, slot: slotRef.current });
  };

  const onHandlePointerMove = (event: PointerEvent) => {
    const id = dragIdRef.current;
    const item = dragElRef.current;
    if (!id || !item) return;
    const dy = event.clientY - startYRef.current;
    item.style.transform = `translateY(${dy}px) scale(1.03)`;
    const last = draftsRef.current.length - 1;
    const to = Math.max(0, Math.min(last, fromRef.current + Math.round(dy / slotRef.current)));
    if (to !== toRef.current) {
      toRef.current = to;
      setDrag((current) => (current ? { ...current, to } : current));
    }
  };

  const onHandlePointerUp = (event: PointerEvent) => {
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    const item = dragElRef.current;
    if (item) {
      item.style.transition = '';
      item.style.transform = '';
    }
    const id = dragIdRef.current;
    if (id) moveDraftById(id, toRef.current);
    dragIdRef.current = null;
    dragElRef.current = null;
    setDrag(null);
  };

  const shiftForIndex = (index: number) => {
    if (!drag || index === drag.from) return 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.slot;
    if (drag.from > drag.to && index >= drag.to && index < drag.from) return drag.slot;
    return 0;
  };

  const handleConfirm = async () => {
    if (overflowMinutes > 0) return;
    if (freeMinutes <= 0) {
      setShowOverbook(true);
      return;
    }
    await confirmRoute(drafts);
  };

  const confirmOverbook = async () => {
    setShowOverbook(false);
    await confirmRoute(drafts);
  };

  return (
    <div className="evening-plan-col">
      <p className="page-step">第 2 步 · 排出今晚的顺序</p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>航程表</h3>
        <p className="route-hint">按住 ≡ 上下拖动。要增删任务或改时长，请返回上一页。</p>
        <ul className={`route-list ${drag ? 'is-sorting' : ''}`} ref={listRef}>
          {drafts.map((d, index) => {
            const shift = shiftForIndex(index);
            return (
              <li
                key={d.id}
                data-route-index={index}
                className={`route-item ${d.type} ${drag?.id === d.id ? 'dragging' : ''}`}
                style={
                  drag && d.id !== drag.id ? { transform: `translateY(${shift}px)` } : undefined
                }
              >
                <span
                  className="drag-handle"
                  role="button"
                  aria-label={`拖动调整 ${d.title} 顺序`}
                  onPointerDown={(e) => onHandlePointerDown(e, d.id)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerUp}
                >
                  ≡
                </span>
                <div className="route-meta">
                  <div className="route-title">
                    {index + 1}. {d.title}
                    {!d.isDeletable && d.type === 'break' && (
                      <span className="badge">刚性 15min</span>
                    )}
                    {!d.isDeletable && d.type !== 'break' && <span className="badge">必做</span>}
                  </div>
                  <div className="route-duration">{d.plannedDurationMinutes} 分钟</div>
                </div>
              </li>
            );
          })}
          <li className="route-item free">
            <span className="drag-handle is-static">─</span>
            <div className="route-meta">
              <div className="route-title">{drafts.length + 1}. 自由飞行 · 最后一程</div>
              <div className="route-duration">
                {overflowMinutes > 0 ? '已挤占完' : `约 ${freeMinutes} 分钟（自动）`}
              </div>
            </div>
          </li>
        </ul>

        <div className="btn-row evening-order-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/evening')}>
            返回改任务
          </button>
          <button
            className="btn btn-primary"
            disabled={overflowMinutes > 0}
            onClick={() => void handleConfirm()}
          >
            {overflowMinutes > 0 ? '时间已超出，无法起飞' : '开始执飞'}
          </button>
        </div>
      </div>

      {showOverbook && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>自由飞可能是 0 分钟</h2>
            <p>按这个排法，自由飞可能是 0 分钟。仍要这样飞吗？</p>
            <div className="btn-row">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowOverbook(false);
                  navigate('/evening');
                }}
              >
                改一下
              </button>
              <button className="btn btn-primary" onClick={() => void confirmOverbook()}>
                就这样，我今晚不玩
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
