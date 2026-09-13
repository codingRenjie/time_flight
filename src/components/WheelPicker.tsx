import { useEffect, useRef } from 'react';

const ITEM_H = 44;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function WheelColumn({
  values,
  selected,
  format,
  onSelect,
  ariaLabel,
}: {
  values: number[];
  selected: number;
  format: (v: number) => string;
  onSelect: (v: number) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | null>(null);
  const didInit = useRef(false);

  // 初始滚动到选中项
  useEffect(() => {
    if (didInit.current || !ref.current) return;
    didInit.current = true;
    const idx = Math.max(0, values.indexOf(selected));
    ref.current.scrollTop = idx * ITEM_H;
  }, [values, selected]);

  const handleScroll = () => {
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.min(
        values.length - 1,
        Math.max(0, Math.round(el.scrollTop / ITEM_H)),
      );
      // 吸附对齐
      el.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
      if (values[idx] !== selected) onSelect(values[idx]);
    }, 90);
  };

  return (
    <div className="wheel-col" role="listbox" aria-label={ariaLabel}>
      <div className="wheel-scroll" ref={ref} onScroll={handleScroll}>
        <div style={{ height: ITEM_H * 2 }} />
        {values.map((v) => (
          <div
            key={v}
            role="option"
            aria-selected={v === selected}
            className={`wheel-item ${v === selected ? 'is-selected' : ''}`}
            style={{ height: ITEM_H }}
            onClick={() => {
              ref.current?.scrollTo({ top: values.indexOf(v) * ITEM_H, behavior: 'smooth' });
              onSelect(v);
            }}
          >
            {format(v)}
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
      <div className="wheel-highlight" style={{ top: ITEM_H * 2, height: ITEM_H }} />
    </div>
  );
}

/** iOS 风格滚轮时间选择器（小时 + 5分钟步进） */
export function WheelPicker({
  value,
  onChange,
}: {
  value: string; // "HH:MM"
  onChange: (v: string) => void;
}) {
  // 用 ref 跟踪最新值，避免快速连续操作时读到闭包里的旧值
  const latest = useRef(value);
  latest.current = value;

  const [hStr, mStr] = latest.current.split(':');
  const hour = Number(hStr);
  const minute = Number(mStr);

  const emit = (h: number, m: number) => {
    const v = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    latest.current = v;
    onChange(v);
  };

  const currentParts = () => latest.current.split(':').map(Number);

  return (
    <div className="wheel-picker">
      <WheelColumn
        values={HOURS}
        selected={hour}
        format={(v) => String(v).padStart(2, '0')}
        onSelect={(h) => emit(h, currentParts()[1])}
        ariaLabel="小时"
      />
      <div className="wheel-sep">:</div>
      <WheelColumn
        values={MINUTES}
        selected={MINUTES.includes(minute) ? minute : MINUTES.reduce((a, b) => (Math.abs(b - minute) < Math.abs(a - minute) ? b : a))}
        format={(v) => String(v).padStart(2, '0')}
        onSelect={(m) => emit(currentParts()[0], m)}
        ariaLabel="分钟"
      />
    </div>
  );
}
