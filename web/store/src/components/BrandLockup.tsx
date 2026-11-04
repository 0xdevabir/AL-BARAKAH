import { Mark } from './Mark';

export function BrandLockup({ size = 28, tone = 'ink' }: { size?: number; tone?: 'ink' | 'light' }) {
  return (
    <span className={`lockup lockup-${tone}`}>
      <Mark size={size} />
      <span>BarakaBari</span>
    </span>
  );
}
