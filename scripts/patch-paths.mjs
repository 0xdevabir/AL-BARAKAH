import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const smsTest = 'apps/core-service/test/sms.test.ts';
if (existsSync(smsTest)) unlinkSync(smsTest);

const replacements = [
  [/packages\/database/g, 'libs/database'],
  [/apps\/api/g, 'apps/core-service'],
  [/apps\/store/g, 'web/store'],
  [/apps\/staff/g, 'web/staff'],
  [/@albarakah\/api/g, '@albarakah/core-service'],
];

for (const file of ['infra/compose.app.yml', '.env.example', 'docs/runbook.md', 'docs/adr/0002-deployment.md']) {
  if (!existsSync(file)) continue;
  let text = readFileSync(file, 'utf8');
  const before = text;
  for (const [rx, to] of replacements) text = text.replace(rx, to);
  if (text !== before) {
    writeFileSync(file, text);
    console.log('patched', file);
  }
}
console.log('ok');
