'use client';

export function Stepper({
  qty,
  label,
  onChange,
}: {
  qty: number;
  label: string;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="btn small" aria-label={`Fewer ${label}`} onClick={() => onChange(qty - 1)}>
        −
      </button>
      <span className="mono qty" aria-live="polite">
        {qty}
      </span>
      <button type="button" className="btn small" aria-label={`More ${label}`} onClick={() => onChange(qty + 1)} disabled={qty >= 50}>
        +
      </button>
    </div>
  );
}
