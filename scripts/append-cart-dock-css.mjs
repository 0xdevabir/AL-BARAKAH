import { readFileSync, writeFileSync } from 'node:fs';

const path = 'web/store/src/app/store.css';
let css = readFileSync(path, 'utf8');
if (!css.includes('.cart-dock')) {
  css += `
.cart-dock {
  z-index: 28;
  bottom: calc(84px + env(safe-area-inset-bottom));
  max-width: 600px;
  margin-inline: auto;
  padding: 12px 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--raised) 94%, transparent);
  border: 1px solid var(--line);
  box-shadow: var(--shadow), 0 14px 32px rgb(40 36 24 / 0.1);
  backdrop-filter: blur(14px);
  text-decoration: none;
  color: inherit;
}
.cart-dock .grow { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
@media (min-width: 900px) { .cart-dock { bottom: 24px; } }
`;
  writeFileSync(path, css);
  console.log('cart-dock css added');
} else {
  console.log('cart-dock already');
}
