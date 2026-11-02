import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAlphaSmsBalance, getAlphaSmsReport } from '../dist/notifications/alpha-sms.js';
import { loadEnv, type Env } from '../dist/config/env.js';
import { deliverSms } from '../dist/notifications/sms.service.js';

const env = { SMS_PROVIDER: 'alphasms', SMS_API_KEY: 'secret-key', SMS_SENDER_ID: '' } as Env;
const log = { log: vi.fn(), error: vi.fn() } as unknown as Logger;
const job = { to: '+8801712345678', text: 'Your code is 123456 & more' };

function gatewayReplies(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('Alpha SMS delivery', () => {
  it('posts a form with the number in gateway format, and logs only the request ID', async () => {
    const fetchMock = gatewayReplies({ error: 0, msg: 'Request successfully submitted', data: { request_id: 42 } });
    await deliverSms(env, job, log);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.sms.net.bd/sendsms');
    expect(init.method).toBe('POST');
    const form = init.body as URLSearchParams;
    expect(Object.fromEntries(form)).toEqual({ api_key: 'secret-key', msg: job.text, to: '8801712345678' });
    expect(vi.mocked(log.log).mock.lastCall?.[0]).toBe('SMS accepted by gateway, request 42');
  });

  it('sends the sender ID when one is set', async () => {
    const fetchMock = gatewayReplies({ error: 0, data: { request_id: 1 } });
    await deliverSms({ ...env, SMS_SENDER_ID: 'ALBARAKAH' }, job, log);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as URLSearchParams).get('sender_id')).toBe('ALBARAKAH');
  });

  it('treats an error inside an HTTP 200 as a failure and does not retry it', async () => {
    gatewayReplies({ error: 417, msg: 'Insufficient balance' });
    const failure = deliverSms(env, job, log);
    await expect(failure).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(failure).rejects.toThrow('SMS gateway error 417: Insufficient balance');
  });

  it.each([
    ['the unknown gateway error', { error: 409 }, 200],
    ['an unreadable response', '<html>Bad gateway</html>', 502],
  ])('retries %s', async (_name, body, status) => {
    gatewayReplies(body, status);
    const err = await deliverSms(env, job, log).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnrecoverableError);
  });

  it('retries when the gateway is unreachable, without leaking details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed secret-key'); }));
    const err = await deliverSms(env, job, log).catch((e: unknown) => e) as Error;
    expect(err).not.toBeInstanceOf(UnrecoverableError);
    expect(err.message).not.toContain('secret-key');
  });
});

describe('Alpha SMS account calls', () => {
  it('reads the balance', async () => {
    const fetchMock = gatewayReplies({ error: 0, msg: 'Success', data: { balance: '12.5000' } });
    await expect(getAlphaSmsBalance('k&y')).resolves.toBe('12.5000');
    expect(fetchMock.mock.calls[0]).toEqual([`https://api.sms.net.bd/user/balance/?api_key=k%26y`, expect.anything()]);
  });

  it('reads a delivery report', async () => {
    const data = { request_id: 7, request_status: 'Complete', request_charge: '0.2500', recipients: [{ number: '8801712345678', charge: '0.2500', status: 'Sent' }] };
    const fetchMock = gatewayReplies({ error: 0, msg: 'Success', data });
    await expect(getAlphaSmsReport('key', 7)).resolves.toEqual(data);
    expect(fetchMock.mock.calls[0]).toEqual(['https://api.sms.net.bd/report/request/7/?api_key=key', expect.anything()]);
  });
});

describe('SMS configuration', () => {
  const base = {
    DATABASE_URL: 'x', REDIS_URL: 'x', S3_ENDPOINT: 'x', S3_PORT: '9000', S3_ACCESS_KEY: 'x', S3_SECRET_KEY: 'x', S3_BUCKET: 'x',
    JWT_SECRET: 'a'.repeat(32), OTP_PEPPER: 'a'.repeat(32), TOTP_ENCRYPTION_KEY: 'a'.repeat(32),
    CORS_ORIGINS: 'http://x.test', PUBLIC_API_BASE: 'http://x.test', STORE_URL: 'http://x.test',
  };

  it('needs an API key for the real gateway', () => {
    expect(() => loadEnv({ ...base, SMS_PROVIDER: 'alphasms' })).toThrow('SMS_API_KEY is required');
    expect(loadEnv({ ...base, SMS_PROVIDER: 'alphasms', SMS_API_KEY: 'k' }).SMS_PROVIDER).toBe('alphasms');
  });
});
