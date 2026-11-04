import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['apps/core-service', 'apps/auth-service', 'apps/worker'];

const patterns = [
  [/from '(\.\.\/)+common\/[^']+'/g, "from '@albarakah/nest-common'"],
  [/from '(\.\.\/)+config\/[^']+'/g, "from '@albarakah/nest-common'"],
  [/from '\.\/common\/[^']+'/g, "from '@albarakah/nest-common'"],
  [/from '\.\/config\/[^']+'/g, "from '@albarakah/nest-common'"],
  [/from '@albarakah\/nest-common\/[^']+'/g, "from '@albarakah/nest-common'"],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

let n = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    let text = readFileSync(file, 'utf8');
    const before = text;
    for (const [rx, repl] of patterns) text = text.replace(rx, repl);
    if (text !== before) {
      writeFileSync(file, text);
      console.log('updated', file);
      n++;
    }
  }
}
console.log(`fixed ${n} files`);
