import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/auth-service/src/auth/auth.service.ts';
let text = readFileSync(path, 'utf8');

if (!text.includes('SessionService')) {
  text = text.replace(
    /import \{ type AuthUser, TokenService \} from '@albarakah\/nest-common';/,
    "import { type AuthUser, SessionService, TokenService } from '@albarakah/nest-common';",
  );
  text = text.replace(
    /private readonly mail: MailService,\n {4}\) \{/,
    'private readonly mail: MailService,\n    private readonly sessions: SessionService,\n  ) {',
  );
  text = text.replace(
    /async revokeAllForUser\(userId: string\): Promise<void> \{\n {4}await this\.prisma\.refreshToken\.updateMany\(\{ where: \{ userId, revokedAt: null \}, data: \{ revokedAt: new Date\(\) \} \}\);\n {2}\}/,
    'async revokeAllForUser(userId: string): Promise<void> {\n    await this.sessions.revokeAllForUser(userId);\n  }',
  );
  writeFileSync(path, text);
  console.log('auth.service updated');
} else {
  console.log('auth.service already updated');
}
