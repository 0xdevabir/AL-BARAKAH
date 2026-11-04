import { readFileSync } from 'node:fs';

const t = readFileSync('apps/core-service/src/consultations/consultations.module.ts', 'utf8');
console.log({
  AuthModule: t.includes('AuthModule'),
  AuthService: t.includes('AuthService'),
  SessionService: t.includes('SessionService'),
  sessions: (t.match(/this\.sessions/g) || []).length,
  auth: (t.match(/this\.auth/g) || []).length,
  moduleImports: t.match(/imports: \[[^\]]+\]/)?.[0],
});
