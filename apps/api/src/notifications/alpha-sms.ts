/** Client for the Alpha SMS gateway (sms.net.bd). Docs: https://portal.sms.net.bd */
const BASE_URL = 'https://api.sms.net.bd';
const TIMEOUT_MS = 10_000;

const ERRORS: Record<number, string> = {
  400: 'Missing or invalid parameter',
  403: 'Permission denied',
  404: 'Resource not found',
  405: 'Authorization required',
  409: 'Unknown error on the gateway',
  410: 'Account expired',
  411: 'Reseller account expired or suspended',
  412: 'Invalid schedule',
  413: 'Invalid sender ID',
  414: 'Message is empty',
  415: 'Message is too long',
  416: 'No valid number found',
  417: 'Insufficient balance',
  420: 'Content blocked',
  421: 'Can only send to the registered number until the first balance recharge',
};

/** The only documented code that a later attempt could fix. */
const RETRYABLE_CODES = new Set([409]);

export class AlphaSmsError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly code?: number) {
    super(message);
    this.name = 'AlphaSmsError';
  }
}

export interface AlphaSmsReport {
  request_id: number;
  request_status: string;
  request_charge: string;
  recipients: { number: string; charge: string; status: string }[];
}

/** The gateway reports failures in the body, usually with HTTP 200, so `error` is what decides. */
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    // Only the error name: the URL can carry the API key.
    throw new AlphaSmsError(`SMS gateway unreachable (${err instanceof Error ? err.name : 'unknown'})`, true);
  }
  const body = await res.json().catch(() => null) as { error?: unknown; msg?: unknown; data?: T } | null;
  const code = body && body.error !== undefined ? Number(body.error) : NaN;
  if (Number.isNaN(code)) throw new AlphaSmsError(`SMS gateway sent an unreadable response (HTTP ${res.status})`, true);
  if (code !== 0) {
    throw new AlphaSmsError(`SMS gateway error ${code}: ${ERRORS[code] ?? String(body?.msg ?? 'Unknown error')}`, RETRYABLE_CODES.has(code), code);
  }
  return body!.data as T;
}

/** Numbers arrive as +8801XXXXXXXXX; the gateway wants 8801XXXXXXXXX. Returns the gateway's request ID. */
export async function sendAlphaSms(input: { apiKey: string; senderId?: string; to: string; message: string }): Promise<number> {
  const form = new URLSearchParams({ api_key: input.apiKey, msg: input.message, to: input.to.replace(/^\+/, '') });
  if (input.senderId) form.set('sender_id', input.senderId);
  const data = await call<{ request_id: number }>(`${BASE_URL}/sendsms`, { method: 'POST', body: form });
  return data.request_id;
}

export function getAlphaSmsReport(apiKey: string, requestId: number): Promise<AlphaSmsReport> {
  return call<AlphaSmsReport>(`${BASE_URL}/report/request/${requestId}/?api_key=${encodeURIComponent(apiKey)}`);
}

export async function getAlphaSmsBalance(apiKey: string): Promise<string> {
  const data = await call<{ balance: string }>(`${BASE_URL}/user/balance/?api_key=${encodeURIComponent(apiKey)}`);
  return data.balance;
}
