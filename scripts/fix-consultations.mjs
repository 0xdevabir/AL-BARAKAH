import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/core-service/src/consultations/consultations.module.ts';
let text = readFileSync(path, 'utf8');

text = text
  .replace(/import \{ AuthModule \} from '\.\.\/auth\/auth\.controller\.js';\n/, '')
  .replace(/import \{ AuthService \} from '\.\.\/auth\/auth\.service\.js';\n/, '')
  .replace(
    /import \{ type AuthUser, CurrentUser, Public, RequirePermission \} from '@albarakah\/nest-common';/,
    "import { type AuthUser, CurrentUser, Public, RequirePermission, SessionService } from '@albarakah/nest-common';",
  )
  .replace(
    /private readonly auth: AuthService,/,
    'private readonly sessions: SessionService,',
  )
  .replace(/this\.auth\.revokeAllForUser/g, 'this.sessions.revokeAllForUser')
  .replace(
    /imports: \[SettingsModule, AuthModule\]/,
    'imports: [SettingsModule]',
  );

writeFileSync(path, text);
console.log('consultations fixed');
