import { useRef, useState, type ReactNode } from 'react';

interface DragState {
  id: string;
  startY: number;
  offsetY: number;
  fromIndex: number;
  overIndex: number;
  heights: number[];
  tops: number[];
}

/**
 * 垂直拖拽排序列表（Pointer Events，触屏/鼠标通用）。
 * 拖动时实时预览位置，松开后提交新顺序。
 */
export function DragList<T>({
  items,
  keyOf,
  onReorder,
  renderItem,
}: {
  items: T[];
  keyOf: (item: T) => string;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, handleProps: React.HTMLAttributes<HTMLElement>, dragging: boolean) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const handlePointerDown = (e: React.PointerEvent, id: string, index: number) => {
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 合成事件或个别浏览器不支持时忽略 */
    }
    const container = containerRef.current;
    if (!container) return;
    const children = Array.from(container.querySelectorAll('[data-drag-item]'));
    const rects = children.map((c) => c.getBoundingClientRect());
    setDrag({
      id,
      startY: e.clientY,
      offsetY: 0,
      fromIndex: index,
      overIndex: index,
      heights: rects.map((r) => r.height),
      tops: rects.map((r) => r.top),
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const offsetY = e.clientY - drag.startY;
    const itemCenter = drag.tops[drag.fromIndex] + offsetY + drag.heights[drag.fromIndex] / 2;
    let over = drag.fromIndex;
    for (let i = 0; i < drag.tops.length; i++) {
      const mid = drag.tops[i] + drag.heights[i] / 2;
      if (itemCenter > mid) over = i;
    }
    setDrag({ ...drag, offsetY, overIndex: over });
  };

  const handlePointerUp = () => {
    if (!drag) return;
    if (drag.overIndex !== drag.fromIndex) {
      const next = [...items];
      const [moved] = next.splice(drag.fromIndex, 1);
      next.splice(drag.overIndex, 0, moved);
      onReorder(next);
    }
    setDrag(null);
  };

  // 计算每项的位移预览
  const shiftFor = (index: number): number => {
    if (!drag) return 0;
    if (index === drag.fromIndex) return drag.offsetY;
    const itemH = drag.heights[drag.fromIndex];
    const gapH = drag.tops.length > 1 ? drag.tops[1] - drag.tops[0] : itemH;
    if (drag.fromIndex < drag.overIndex) {
      if (index > drag.fromIndex && index <= drag.overIndex) return -gapH;
    } else if (drag.fromIndex > drag.overIndex) {
      if (index < drag.fromIndex && index >= drag.overIndex) return gapH;
    }
    return 0;
  };

  return (
    <div
      ref={containerRef}
      className={`drag-list ${drag ? 'is-sorting' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {items.map((item, index) => {
        const id = keyOf(item);
        const dragging = drag?.id === id;
        return (
          <div
            key={id}
            data-drag-item
            className={`drag-item ${dragging ? 'dragging' : ''}`}
            style={{
              transform: `translateY(${dragging ? drag.offsetY : shiftFor(index)}px)`,
              transition: drag ? (dragging ? 'none' : 'transform 0.18s ease') : undefined,
              zIndex: dragging ? 10 : undefined,
            }}
          >
            {renderItem(
              item,
              {
                onPointerDown: (e: React.PointerEvent) => handlePointerDown(e, id, index),
                style: { touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' },
              },
              dragging,
            )}
          </div>
        );
      })}
    </div>
  );
}
