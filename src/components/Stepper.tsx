/** 时长步进器：− / ＋，步进 5 分钟 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        aria-label="减少"
      >
        −
      </button>
      <span className="stepper-value">{value}分钟</span>
      <button
        type="button"
        className="stepper-btn"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        aria-label="增加"
      >
        ＋
      </button>
    </div>
  );
}
