import Fastify from 'fastify';
import proxy from '@fastify/http-proxy';

const port = Number(process.env.GATEWAY_PORT ?? process.env.PORT ?? 4000);
const authUrl = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:4010';
const coreUrl = process.env.CORE_SERVICE_URL ?? 'http://127.0.0.1:4020';

const app = Fastify({ logger: true });

app.get('/gateway/health', async () => ({ ok: true, authUrl, coreUrl }));

await app.register(proxy, {
  upstream: authUrl,
  prefix: '/auth',
  rewritePrefix: '/auth',
});

// SMS logs and settings live with the OTP sender in auth-service.
await app.register(proxy, {
  upstream: authUrl,
  prefix: '/admin/sms',
  rewritePrefix: '/admin/sms',
});

await app.register(proxy, {
  upstream: coreUrl,
  prefix: '/',
});

await app.listen({ port, host: '0.0.0.0' });
console.log(`gateway listening on :${port} → auth ${authUrl}, core ${coreUrl}`);
