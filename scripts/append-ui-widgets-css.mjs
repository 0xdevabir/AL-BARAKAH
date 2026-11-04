import { readFileSync, writeFileSync } from 'node:fs';

const path = 'libs/ui/src/styles.css';
let css = readFileSync(path, 'utf8');
if (!css.includes('.seg {')) {
  css += `
.seg { display: flex; gap: 4px; padding: 4px; border-radius: var(--r-sm); background: var(--surface); }
.seg button { flex: 1; min-height: 44px; padding: 0 10px; border: 0; border-radius: 12px; background: none; color: var(--ink); font: inherit; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background-color 0.2s var(--ease), box-shadow 0.2s var(--ease); }
.seg button.on { background: var(--raised); box-shadow: var(--shadow); }

.sheet {
  position: fixed; inset: auto 0 0; width: 100%; max-width: 560px; max-height: 88dvh; margin: 0 auto; padding: 0; border: 0;
  border-radius: var(--r-lg) var(--r-lg) 0 0; background: var(--bg); color: var(--ink); overflow: hidden;
}
.sheet[open] { animation: sheet-rise 0.4s var(--ease); }
.sheet::backdrop { background: rgb(0 0 0 / 0.42); }
.sheet-body {
  max-height: 88dvh; padding: 10px 20px calc(24px + env(safe-area-inset-bottom));
  overflow-y: auto; overscroll-behavior: contain;
}
.sheet .grab { width: 36px; height: 5px; margin: 0 auto 12px; border-radius: 3px; background: var(--line); }
.sheet h2 { margin: 0 0 18px; font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; }
@keyframes sheet-rise {
  from { transform: translateY(22%); opacity: 0.55; }
  to { transform: none; opacity: 1; }
}
@media (min-width: 720px) {
  .sheet { inset: 0; margin: auto; height: fit-content; border-radius: var(--r-lg); }
}
`;
  writeFileSync(path, css);
  console.log('widget css appended');
} else console.log('already present');
