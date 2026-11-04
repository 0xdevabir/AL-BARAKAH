import { readFileSync, writeFileSync } from 'node:fs';

const path = 'web/store/src/app/store.css';
let css = readFileSync(path, 'utf8');
if (!css.includes('.pgrid {')) {
  css += `
.pgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.pgrid-foot { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 16px; }
.sentinel { width: 1px; height: 1px; }
.ghost { aspect-ratio: 3 / 4; border-radius: var(--r); background: var(--raised); box-shadow: var(--shadow); animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.5; } }
.product { display: flex; flex-direction: column; min-width: 0; height: 100%; padding: 12px; border-radius: var(--r); background: var(--raised); box-shadow: var(--shadow); }
.product .body { display: flex; flex: 1; flex-direction: column; gap: 10px; min-width: 0; }
.product .shot { display: grid; place-items: center; width: 100%; aspect-ratio: 1; border-radius: 16px; background: #fff; box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; }
.product .shot img { width: 100%; height: 100%; padding: 10px; object-fit: contain; }
.product .text { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
.product .name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: 1rem; font-weight: 700; line-height: 1.25; }
.product .meta { max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 0.9rem; }
.product .foot { display: flex; flex-direction: column; gap: 8px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--line); }
.product .foot .btn, .product .foot .stepper { width: 100%; }
.stepper { display: flex; align-items: center; border-radius: var(--r-sm); background: var(--surface); }
.stepper .btn { width: 44px; height: 44px; min-height: 44px; padding: 0; box-shadow: none; background: none; font-size: 1.25rem; }
.stepper .qty { min-width: 22px; text-align: center; font-weight: 700; }
.form-glyph { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; background: var(--sage-soft); color: var(--accent-ink); font-weight: 700; }
.wide { max-width: 1320px; }
.find { background: var(--raised); }
.hint { margin: 4px 0 0; font-size: 0.95rem; }
.results { margin-top: 16px; }
.chips { display: flex; gap: 10px; margin: 14px -20px 0; padding: 2px 20px 6px; overflow-x: auto; scrollbar-width: none; }
.chips a { flex: none; }
.chips a:not(.primary) { background: var(--raised); }
.sbox { position: relative; }
.slist { position: absolute; z-index: 20; inset: calc(100% + 8px) 0 auto; overflow: hidden; border-radius: var(--r); background: var(--raised); box-shadow: var(--shadow), 0 12px 28px rgb(40 36 24 / 0.08); }
.sitem { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 8px 12px; }
.sitem.on, .sitem:hover { background: var(--surface); }
.sitem img, .sitem .blank { flex: none; width: 36px; height: 36px; border-radius: 10px; object-fit: contain; background: var(--sage-soft); }
.sitem .text { display: flex; flex-direction: column; min-width: 0; }
.sitem .all { justify-content: center; border-top: 1px solid var(--line); color: var(--accent-ink); font-weight: 600; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0; padding: 0; list-style: none; }
.steps li { padding-bottom: 8px; border-bottom: 2px solid var(--line); color: var(--muted); font-size: 0.95rem; font-weight: 600; }
.steps li.on { border-color: var(--accent); color: var(--accent-ink); }
.mark { flex: none; width: 22px; height: 22px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--line); }
.mark.on { background: var(--accent); box-shadow: none; }
.med-photo { flex: none; width: 112px; height: 112px; padding: 8px; border-radius: 20px; object-fit: contain; background: var(--sage-soft); }
.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.order-card { display: flex; flex-direction: column; align-items: stretch; gap: 6px; }
.order-items { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; line-height: 1.3; }
.doctor-card { text-align: left; width: 100%; border: 0; cursor: pointer; font: inherit; color: inherit; }
.timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.timeline li { display: flex; align-items: center; gap: 12px; }
.timeline .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--line); }
.timeline .dot.now { background: var(--accent); }
.dock.gone { justify-content: center; background: var(--surface); }
@media (min-width: 900px) {
  .pgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .wide { padding-inline: 24px; }
  .chips { margin-inline: -24px; padding-inline: 24px; }
}
@media (min-width: 1240px) {
  .pgrid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
`;
  writeFileSync(path, css);
  console.log('store css appended');
} else console.log('store css ok');
