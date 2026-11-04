'use client';

import { useId, useMemo, useState } from 'react';

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

export function Skeleton({ h = 20, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

/** A grouped-list placeholder that matches the real rows, so content does not jump in. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="group" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <div className="stack grow" style={{ gap: 8 }}>
            <Skeleton h={16} w={`${60 - (i % 3) * 12}%`} />
            <Skeleton h={12} w={`${38 + (i % 2) * 14}%`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon = '○', title, children, action }: { icon?: string; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">{icon}</span>
      <strong className="empty-title">{title}</strong>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function StatTile({ label, value, delta, hint, tone }: { label: string; value: React.ReactNode; delta?: number | null; hint?: string; tone?: 'warn' | 'bad' | 'ok' }) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {delta != null ? (
        <span className={`stat-delta ${up ? 'up' : 'down'}`}>
          {up ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}%
        </span>
      ) : hint ? (
        <span className="stat-hint">{hint}</span>
      ) : null}
    </div>
  );
}

/** Area chart with a hover/tap read-out. One series, so no legend is needed. */
export function AreaChart({
  points,
  format = String,
  height = 160,
  label,
}: {
  points: { x: string; y: number }[];
  format?: (n: number) => string;
  height?: number;
  label: string;
}) {
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const pad = 8;
  const max = Math.max(1, ...points.map((p) => p.y));
  const coords = useMemo(
    () => points.map((p, i) => ({ x: points.length < 2 ? W / 2 : pad + (i * (W - pad * 2)) / (points.length - 1), y: H - 24 - (p.y / max) * (H - 40) })),
    [points, max, H],
  );
  if (!points.length) return null;
  const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1]!.x},${H - 24} L${coords[0]!.x},${H - 24} Z`;
  const active = hover ?? points.length - 1;
  const ac = coords[active]!;

  return (
    <figure className="chart" aria-label={label}>
      <div className="chart-read">
        <strong>{format(points[active]!.y)}</strong>
        <span className="muted small">{points[active]!.x}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          coords.forEach((c, i) => {
            if (Math.abs(c.x - rel) < Math.abs(coords[best]!.x - rel)) best = i;
          });
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={0} x2={W} y1={H - 24} y2={H - 24} stroke="var(--line)" />
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1={ac.x} x2={ac.x} y1={8} y2={H - 24} stroke="var(--line)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <circle cx={ac.x} cy={ac.y} r={5} fill="var(--raised)" stroke="var(--accent)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-axis muted">
        <span>{points[0]!.x}</span>
        <span>{points[points.length - 1]!.x}</span>
      </div>
    </figure>
  );
}

/** Horizontal bars, labelled directly: for "top N" lists. */
export function BarList({ items, format = String }: { items: { label: string; value: number; sub?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="barlist">
      {items.map((i) => (
        <div key={i.label} className="barlist-row">
          <div className="barlist-track">
            <span className="barlist-fill" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} />
            <span className="barlist-label">{i.label}</span>
          </div>
          <span className="barlist-val mono">{format(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Seven small columns: a week at a glance. */
export function MiniBars({ values, labels, format = String }: { values: number[]; labels: string[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...values);
  const [on, setOn] = useState(values.length - 1);
  return (
    <div className="minibars">
      <div className="minibars-read">
        <strong>{format(values[on] ?? 0)}</strong>
        <span className="muted small">{labels[on]}</span>
      </div>
      <div className="minibars-cols">
        {values.map((v, i) => (
          <button key={i} type="button" className={`minibar${i === on ? ' on' : ''}`} onClick={() => setOn(i)} aria-label={`${labels[i]}: ${format(v)}`}>
            <span style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
            <small>{labels[i]?.slice(0, 1)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Large title + optional trailing action, like a UINavigationBar in large-title mode. */
export function LargeTitle({ children, action, sub }: { children: React.ReactNode; action?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <header className="large-title">
      <div className="grow">
        <h1 className="title">{children}</h1>
        {sub ? <p className="muted large-sub">{sub}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function SearchField({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="searchfield">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} enterKeyHint="search" />
      {value ? (
        <button type="button" aria-label="Clear" onClick={() => onChange('')}>
          ×
        </button>
      ) : null}
    </label>
  );
}
