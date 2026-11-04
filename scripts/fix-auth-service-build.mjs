import { readFileSync, writeFileSync } from 'node:fs';

const pkgPath = 'apps/auth-service/package.json';
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.dependencies['@fastify/cookie'] = '11.1.5';
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const svcPath = 'apps/auth-service/src/auth/auth.service.ts';
let svc = readFileSync(svcPath, 'utf8');

if (!svc.includes('private readonly sessions: SessionService')) {
  if (!svc.includes('SessionService')) {
    svc = svc.replace(
      /import \{ type AuthUser, TokenService \} from '@albarakah\/nest-common';/,
      "import { type AuthUser, SessionService, TokenService } from '@albarakah/nest-common';",
    );
    svc = svc.replace(
      /import \{ type AuthUser, SessionService, TokenService \} from '@albarakah\/nest-common';/,
      "import { type AuthUser, SessionService, TokenService } from '@albarakah/nest-common';",
    );
  }
  svc = svc.replace(
    /private readonly mail: MailService,\n  \) \{/,
    'private readonly mail: MailService,\n    private readonly sessions: SessionService,\n  ) {',
  );
}

if (svc.includes('this.sessions.revokeAllForUser') && !svc.includes('private readonly sessions')) {
  // constructor injection missing
  svc = svc.replace(
    /private readonly mail: MailService,\n  \) \{/,
    'private readonly mail: MailService,\n    private readonly sessions: SessionService,\n  ) {',
  );
}

writeFileSync(svcPath, svc);

// Ensure cookie types are visible
const ref = "import '@fastify/cookie';\n";
const mainPath = 'apps/auth-service/src/main.ts';
let main = readFileSync(mainPath, 'utf8');
if (!main.includes("@fastify/cookie")) {
  main = ref + main;
  writeFileSync(mainPath, main);
}

console.log('auth-service build fixes applied');
console.log('sessions field', svc.includes('private readonly sessions: SessionService'));
