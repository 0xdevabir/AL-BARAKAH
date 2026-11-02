import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBulkSmsBdBalance } from '../dist/notifications/bulksmsbd.js';
import { loadEnv, type Env } from '../dist/config/env.js';
import { deliverSms } from '../dist/notifications/sms.service.js';

const env = { SMS_PROVIDER: 'bulksmsbd', SMS_API_KEY: 'secret-key', SMS_SENDER_ID: '8809617000000' } as Env;
const log = { log: vi.fn(), error: vi.fn() } as unknown as Logger;
const job = { to: '+8801712345678', text: 'Your code is 123456 & more' };

function gatewayReplies(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('BulkSMSBD delivery', () => {
  it('posts a form with the number in gateway format, and logs only the message ID', async () => {
    const fetchMock = gatewayReplies({ response_code: 202, message_id: 42, success_message: 'SMS Submitted Successfully', error_message: '' });
    await deliverSms(env, job, log);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://bulksmsbd.net/api/smsapi');
    expect(init.method).toBe('POST');
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      api_key: 'secret-key', type: 'text', senderid: '8809617000000', number: '8801712345678', message: job.text,
    });
    expect(vi.mocked(log.log).mock.lastCall?.[0]).toBe('SMS accepted by gateway, message 42');
  });

  it('treats a code inside an HTTP 200 as a failure and does not retry it', async () => {
    gatewayReplies({ response_code: 1007, error_message: 'Insufficient balance' });
    const failure = deliverSms(env, job, log);
    await expect(failure).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(failure).rejects.toThrow('SMS gateway error 1007: Insufficient balance');
  });

  it('reports an undocumented code using the gateway message', async () => {
    gatewayReplies({ response_code: 1099, error_message: 'Something new' });
    await expect(deliverSms(env, job, log)).rejects.toThrow('SMS gateway error 1099: Something new');
  });

  it.each([
    ['the gateway internal error', { response_code: 1005 }, 200],
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

describe('BulkSMSBD balance', () => {
  it('reads the balance, keeping the key out of the URL', async () => {
    const fetchMock = gatewayReplies({ response_code: 202, balance: 49.65 });
    await expect(getBulkSmsBdBalance('key')).resolves.toBe('49.65');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://bulksmsbd.net/api/getBalanceApi');
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ api_key: 'key' });
  });
});

describe('SMS configuration', () => {
  const base = {
    DATABASE_URL: 'x', REDIS_URL: 'x', S3_ENDPOINT: 'x', S3_PORT: '9000', S3_ACCESS_KEY: 'x', S3_SECRET_KEY: 'x', S3_BUCKET: 'x',
    JWT_SECRET: 'a'.repeat(32), OTP_PEPPER: 'a'.repeat(32), TOTP_ENCRYPTION_KEY: 'a'.repeat(32),
    CORS_ORIGINS: 'http://x.test', PUBLIC_API_BASE: 'http://x.test', STORE_URL: 'http://x.test',
  };

  it('needs an API key and sender ID for the real gateway', () => {
    expect(() => loadEnv({ ...base, SMS_PROVIDER: 'bulksmsbd', SMS_SENDER_ID: 's' })).toThrow('SMS_API_KEY and SMS_SENDER_ID are required');
    expect(() => loadEnv({ ...base, SMS_PROVIDER: 'bulksmsbd', SMS_API_KEY: 'k' })).toThrow('SMS_API_KEY and SMS_SENDER_ID are required');
    expect(loadEnv({ ...base, SMS_PROVIDER: 'bulksmsbd', SMS_API_KEY: 'k', SMS_SENDER_ID: 's' }).SMS_PROVIDER).toBe('bulksmsbd');
  });
});
