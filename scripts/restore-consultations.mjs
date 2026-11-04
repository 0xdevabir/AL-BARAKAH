import { readFileSync, writeFileSync } from 'node:fs';

let text = readFileSync('/tmp/consultations.module.ts', 'utf8');

text = text
  .replace(/import \{ AuthModule \} from '\.\.\/auth\/auth\.controller\.js';\n/, '')
  .replace(/import \{ AuthService \} from '\.\.\/auth\/auth\.service\.js';\n/, '')
  .replace(
    /import \{ type AuthUser, CurrentUser, Public, RequirePermission \} from '\.\.\/common\/auth\.js';/,
    "import { type AuthUser, CurrentUser, Public, RequirePermission, SessionService } from '@albarakah/nest-common';",
  )
  .replace(
    /import \{ badRequest, conflict, notFound, ZodPipe \} from '\.\.\/common\/errors\.js';/,
    "import { badRequest, conflict, notFound, ZodPipe } from '@albarakah/nest-common';",
  )
  .replace(
    /import \{ PRISMA \} from '\.\.\/common\/infra\.module\.js';/,
    "import { PRISMA } from '@albarakah/nest-common';",
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

writeFileSync(
  '/Users/mdabirhossain/Documents/WebDevelopment/AL-BARAKAH/apps/core-service/src/consultations/consultations.module.ts',
  text,
);
console.log('restored', text.split('\n').length, 'lines');
console.log('AuthModule', text.includes('AuthModule'));
console.log('SessionService', text.includes('SessionService'));
console.log('common/', text.includes('../common/'));
