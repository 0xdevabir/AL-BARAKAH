import { readFileSync, writeFileSync } from 'node:fs';

const path = 'web/store/src/app/store.css';
let css = readFileSync(path, 'utf8');

const start = css.indexOf('/* —— home full-bleed —— */');
const end = css.indexOf('/* —— login —— */');
if (start < 0 || end < 0) {
  console.error('markers missing');
  process.exit(1);
}

const next = `/* —— home —— */
.home-bleed {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

/* Banner: desktop only */
.home-banner {
  display: none;
}

.home-mobile-brand {
  display: flex;
  align-items: center;
  margin-bottom: 18px;
  padding-top: 4px;
}

.home-body {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(120px + env(safe-area-inset-bottom));
  animation: rise 0.55s var(--ease) both;
}

.home-section { margin-top: 8px; }
.home-section + .home-section { margin-top: 28px; }
.home-section .section {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 12px;
}
.home-section .section h2 {
  margin: 0;
  font-size: 1.15rem;
  letter-spacing: -0.02em;
}
.home-section .section a {
  color: var(--accent-ink);
  font-weight: 650;
  font-size: 0.95rem;
}

.cat-rail {
  display: flex;
  gap: 10px;
  margin: 0 -16px;
  padding: 2px 16px 8px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.cat-rail::-webkit-scrollbar { display: none; }

.cat-tile {
  flex: none;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  width: 118px;
  min-height: 118px;
  padding: 14px 12px;
  border-radius: 18px;
  background: var(--raised);
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  box-shadow: var(--shadow);
  color: inherit;
  text-decoration: none;
  transition: transform 0.18s var(--ease), border-color 0.18s var(--ease);
}
.cat-tile:active { transform: scale(0.98); }
.cat-tile strong {
  font-size: 0.92rem;
  line-height: 1.25;
  letter-spacing: -0.02em;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.cat-glyph {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: var(--sage-soft);
  color: var(--accent-ink);
}
.cat-glyph svg { width: 22px; height: 22px; }

.hero-packs {
  position: absolute;
  inset: 10% 4% auto auto;
  z-index: -1;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  pointer-events: none;
  animation: packs-in 1s var(--ease) 0.1s both;
}
.hero-packs img {
  width: min(18vw, 140px);
  aspect-ratio: 1;
  object-fit: contain;
  filter: drop-shadow(0 14px 24px rgb(0 0 0 / 0.24));
  opacity: 0.92;
}
.hero-packs img:nth-child(1) { transform: rotate(-8deg) translateY(14px); }
.hero-packs img:nth-child(2) { transform: rotate(2deg); width: min(20vw, 156px); }
.hero-packs img:nth-child(3) { transform: rotate(9deg) translateY(18px); }

.hero-copy {
  position: relative;
  max-width: 32rem;
  animation: rise 0.7s var(--ease) 0.08s both;
}
.hero-copy .lockup {
  font-size: clamp(1.35rem, 2.4vw, 1.7rem);
  margin-bottom: 14px;
}
.hero-copy .lockup svg { width: 1.1em; height: 1.1em; }
.hero-copy h1 {
  margin: 0;
  font-size: clamp(2rem, 4.2vw, 3rem);
  line-height: 0.98;
  letter-spacing: -0.045em;
  font-weight: 700;
  max-width: 12ch;
  text-wrap: balance;
}
.hero-copy p {
  margin-top: 12px;
  max-width: 36ch;
  font-size: 1.02rem;
  line-height: 1.45;
  color: rgb(247 244 234 / 0.82);
}
.hero-copy .cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 18px;
  min-height: 48px;
  padding: 0 20px;
  border-radius: 14px;
  background: #f7f4ea;
  color: var(--forest);
  font-weight: 700;
  font-size: 1rem;
  box-shadow: 0 10px 28px rgb(0 0 0 / 0.16);
  transition: transform 0.2s var(--ease), background-color 0.2s var(--ease);
}
.hero-copy .cta:hover { background: white; }
.hero-copy .cta:active { transform: scale(0.98); }

@media (min-width: 900px) {
  .home-mobile-brand { display: none; }

  .home-banner {
    position: relative;
    isolation: isolate;
    display: grid;
    align-content: end;
    min-height: clamp(280px, 38vh, 420px);
    margin: 0 20px 8px;
    padding: 36px 40px 32px;
    overflow: hidden;
    border-radius: 28px;
    color: #f7f4ea;
    background:
      linear-gradient(180deg, rgb(22 32 22 / 0.12) 0%, rgb(22 32 22 / 0.7) 55%, rgb(22 32 22 / 0.9) 100%),
      radial-gradient(90% 70% at 80% 10%, color-mix(in srgb, var(--sage) 45%, transparent), transparent 60%),
      linear-gradient(155deg, #1d2c1c 0%, var(--forest) 42%, #3f5a3c 78%, var(--accent) 100%);
    animation: rise 0.65s var(--ease) both;
  }

  .home-banner::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    background-image:
      radial-gradient(circle at 20% 30%, rgb(255 255 255 / 0.05) 0 1px, transparent 1.5px),
      radial-gradient(circle at 70% 60%, rgb(255 255 255 / 0.04) 0 1px, transparent 1.5px);
    background-size: 28px 28px, 36px 36px;
    animation: grain 18s linear infinite;
    opacity: 0.5;
    pointer-events: none;
  }

  .home-body {
    margin-top: 0;
    padding: 20px 24px calc(48px + env(safe-area-inset-bottom));
  }

  .cat-rail {
    margin: 0 -8px;
    padding: 2px 8px 10px;
    gap: 12px;
  }

  .cat-tile {
    width: 140px;
    min-height: 132px;
    padding: 16px 14px;
  }
  .cat-tile:hover {
    border-color: color-mix(in srgb, var(--accent) 32%, var(--line));
    transform: translateY(-2px);
  }
}

@media (min-width: 1240px) {
  .home-banner {
    max-width: 1120px;
    margin-inline: auto;
  }
}

`;

css = css.slice(0, start) + next + css.slice(end);
writeFileSync(path, css);
console.log('home css patched');
