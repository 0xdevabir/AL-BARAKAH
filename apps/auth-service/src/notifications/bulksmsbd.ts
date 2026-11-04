/** Client for the BulkSMSBD gateway. Docs: https://bulksmsbd.net/developers (requires login). */
const BASE_URL = 'https://bulksmsbd.net/api';
const TIMEOUT_MS = 10_000;
const SUCCESS = 202;

const ERRORS: Record<number, string> = {
  1001: 'Invalid number',
  1002: 'Sender ID is incorrect or disabled',
  1003: 'Required fields are missing',
  1005: 'Internal error on the gateway',
  1006: 'Balance validity not available',
  1007: 'Insufficient balance',
  1011: 'User ID not found (check SMS_API_KEY)',
  1012: 'Masking SMS must be sent in Bengali',
  1013: 'Sender ID has no gateway for this API key',
  1014: 'Sender type not found for this sender and API key',
  1015: 'Sender ID has no valid gateway for this API key',
  1016: 'No active price found for this sender type',
  1017: 'No price found for this sender type',
  1018: 'Account owner is disabled',
  1019: 'Sender type price is disabled for this account',
  1020: 'Parent account not found',
  1021: 'No active sender type price found on the parent account',
  1031: 'Account is not verified or has no SMS access',
  1032: 'Server IP is not whitelisted',
};

/** The only documented code that a later attempt could fix. */
const RETRYABLE_CODES = new Set([1005]);

export class BulkSmsBdError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly code?: number) {
    super(message);
    this.name = 'BulkSmsBdError';
  }
}

interface GatewayBody { response_code?: unknown; message_id?: unknown; balance?: unknown; error_message?: unknown }

/** The gateway answers HTTP 200 even for failures, so `response_code` is what decides. */
async function call(path: string, params: Record<string, string>): Promise<GatewayBody> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${path}`, { method: 'POST', body: new URLSearchParams(params), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new BulkSmsBdError(`SMS gateway unreachable (${err instanceof Error ? err.name : 'unknown'})`, true);
  }
  const body = await res.json().catch(() => null) as GatewayBody | null;
  const code = Number(body?.response_code ?? NaN);
  if (Number.isNaN(code)) throw new BulkSmsBdError(`SMS gateway sent an unreadable response (HTTP ${res.status})`, true);
  if (code !== SUCCESS) {
    throw new BulkSmsBdError(`SMS gateway error ${code}: ${ERRORS[code] ?? String(body?.error_message ?? 'Unknown error')}`, RETRYABLE_CODES.has(code), code);
  }
  return body!;
}

/** Numbers arrive as +8801XXXXXXXXX; the gateway wants 8801XXXXXXXXX. Returns the gateway's message ID, if it sent one. */
export async function sendBulkSmsBd(input: { apiKey: string; senderId: string; to: string; message: string }): Promise<string | undefined> {
  const body = await call('smsapi', {
    api_key: input.apiKey, type: 'text', senderid: input.senderId, number: input.to.replace(/^\+/, ''), message: input.message,
  });
  return body.message_id === undefined ? undefined : String(body.message_id);
}

export async function getBulkSmsBdBalance(apiKey: string): Promise<string> {
  const body = await call('getBalanceApi', { api_key: apiKey });
  if (body.balance === undefined) throw new BulkSmsBdError('SMS gateway did not report a balance', true);
  return String(body.balance);
}
