import '@fastify/cookie';
import { createNestApp, loadEnv } from '@albarakah/nest-common';
import { AppModule } from './app.module.js';

if (!process.env.PORT) process.env.PORT = process.env.AUTH_PORT ?? '4010';
const env = loadEnv();
const app = await createNestApp(env, AppModule);
await app.listen(env.PORT, '0.0.0.0');
console.log(`auth-service listening on :${env.PORT}`);
