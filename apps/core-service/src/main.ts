import { createNestApp, loadEnv } from '@albarakah/nest-common';
import { AppModule } from './app.module.js';

const env = loadEnv();
const role = env.SERVICE_ROLE === 'worker' ? 'worker' : env.SERVICE_ROLE === 'all' ? 'all' : 'api';
const app = await createNestApp(env, AppModule.forRole(role));
await app.listen(env.PORT, '0.0.0.0');
console.log(`core-service (${role}) listening on :${env.PORT}`);
