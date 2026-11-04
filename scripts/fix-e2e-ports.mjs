import { readFileSync, writeFileSync } from 'node:fs';

for (const file of [
  'apps/e2e/tests/theme.spec.ts',
  'apps/e2e/tests/flows.spec.ts',
  'apps/e2e/tests/demo-login.spec.ts',
]) {
  let text = readFileSync(file, 'utf8');
  text = text
    .replaceAll('http://localhost:5173', 'http://localhost:3000')
    .replaceAll('http://localhost:5174', 'http://localhost:3001');
  writeFileSync(file, text);
  console.log('updated', file);
}
