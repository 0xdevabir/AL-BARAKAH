import { readFileSync, writeFileSync } from 'node:fs';

const path = 'libs/ui/src/styles.css';
let css = readFileSync(path, 'utf8');

if (!css.includes('btn.primary:not(:disabled):hover')) {
  css = css.replace(
    '.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 18px; border: 0; border-radius: var(--r-sm); background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; box-shadow: var(--shadow); transition: opacity 0.15s, background-color 0.15s; touch-action: manipulation; }\n.btn:active { opacity: 0.82; }\n.btn:disabled { opacity: 0.45; cursor: default; }\n.btn.primary { min-height: 52px; background: var(--accent); color: var(--on-accent); font-size: 1.0625rem; }',
    `.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 18px; border: 0; border-radius: var(--r-sm); background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; box-shadow: var(--shadow); transition: opacity 0.18s var(--ease), background-color 0.18s var(--ease), transform 0.18s var(--ease); touch-action: manipulation; }
.btn:active { opacity: 0.88; transform: scale(0.985); }
.btn:disabled { opacity: 0.45; cursor: default; transform: none; }
.btn.primary { min-height: 52px; background: var(--accent); color: var(--on-accent); font-size: 1.0625rem; }
.btn.primary:not(:disabled):hover { background: color-mix(in srgb, var(--accent) 88%, #1a1916); }`,
  );

  if (!css.includes('.input:focus {')) {
    css += `
.input:focus { outline: none; box-shadow: var(--shadow), 0 0 0 3px color-mix(in srgb, var(--accent) 26%, transparent); }
.empty { animation: empty-in 0.45s var(--ease) both; }
@keyframes empty-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .empty { animation: none !important; }
}
`;
  }
  writeFileSync(path, css);
  console.log('ui styles polished');
} else {
  console.log('ui styles already polished');
}
