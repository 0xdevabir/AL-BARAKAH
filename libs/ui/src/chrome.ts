'use client';

import { useEffect } from 'react';

/**
 * Drives the floating chrome from scroll position, the way iOS does:
 * `data-scrolled` once content slides under the status bar, and
 * `data-compact` while scrolling down so the tab bar tucks into a smaller pill.
 * Written to <html> so plain CSS can react without re-rendering React.
 */
export function useScrollChrome() {
  useEffect(() => {
    const root = document.documentElement;
    let last = window.scrollY;
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      root.dataset.scrolled = y > 6 ? '1' : '0';
      const delta = y - last;
      // Ignore tiny jitters and the rubber-band at either end of the page.
      if (Math.abs(delta) > 6) {
        const compact = delta > 0 && y > 80 && y < max - 4;
        root.dataset.compact = compact ? '1' : '0';
        last = y;
      }
      if (y <= 80) root.dataset.compact = '0';
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.scrolled;
      delete root.dataset.compact;
    };
  }, []);
}
