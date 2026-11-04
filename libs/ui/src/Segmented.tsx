'use client';

/** iOS segmented control: the white thumb slides between options instead of jumping. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; badge?: number }[];
  label: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="seg" role="radiogroup" aria-label={label} style={{ '--n': options.length, '--i': index } as React.CSSProperties}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : undefined}
          onClick={() => {
            if (o.value !== value) {
              try {
                navigator.vibrate?.(6);
              } catch {
                /* unsupported */
              }
              onChange(o.value);
            }
          }}
        >
          {o.label}
          {o.badge ? <span className="seg-badge">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
