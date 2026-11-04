import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/core-service/src/catalog/catalog.module.ts';
let src = readFileSync(path, 'utf8');

const before = src;
src = src.replace(
  `    const browsing = !term;
    const size = browsing ? BROWSE_PAGE : SEARCH_PAGE;
    // Browse is intentionally page 1 only — the rest of the catalogue is reached by searching.
    const offset = browsing ? 0 : (Math.max(page, 1) - 1) * size;`,
  `    const browsing = !term;
    const size = browsing ? BROWSE_PAGE : SEARCH_PAGE;
    const offset = (Math.max(page, 1) - 1) * size;`,
);

src = src.replace(
  `        LIMIT \${browsing ? size : size + 1} OFFSET \${offset}`,
  `        LIMIT \${size + 1} OFFSET \${offset}`,
);

src = src.replace(
  `      hasMore: browsing ? false : rows.length > size,`,
  `      hasMore: rows.length > size,`,
);

if (src === before) {
  console.error('no changes applied — markers missing?');
  process.exit(1);
}

writeFileSync(path, src);
console.log('browse pagination patched');
