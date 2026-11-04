import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['libs/nest-common/src', 'apps/auth-service/src', 'apps/core-service/src', 'apps/gateway/src', 'web/store/src', 'web/staff/src'];
const bad = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
      const t = readFileSync(p, 'utf8');
      if (t.includes('cognitive') || t.includes('§ function') || t.includes('[lean-ctx]')) bad.push(p);
      if (!t.trim()) bad.push(`EMPTY:${p}`);
    }
  }
}

for (const r of roots) walk(r);
console.log(bad.length ? bad.join('\n') : 'all clean');
