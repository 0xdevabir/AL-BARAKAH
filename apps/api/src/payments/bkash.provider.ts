import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';

export interface CreatedPayment { providerPaymentId: string; redirectUrl: string }
export interface ExecutedPayment { paid: boolean; trxId?: string; message?: string }

export interface PaymentProvider {
  create(input: { amountPoisha: number; invoice: string; callbackUrl: string; payerRef: string }): Promise<CreatedPayment>;
  execute(providerPaymentId: string): Promise<ExecutedPayment>;
  /** Asks bKash for the current state; used to recover payments whose callback never arrived. */
  query(providerPaymentId: string): Promise<ExecutedPayment>;
  refund(input: { providerPaymentId: string; trxId: string; amountPoisha: number; invoice: string }): Promise<{ refundTrxId: string }>;
}

const BASE = {
  sandbox: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout',
  live: 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout',
};
const taka = (poisha: number) => (poisha / 100).toFixed(2);

/** bKash Tokenized Checkout. Not yet exercised against a real account: that needs merchant credentials. */
export class BkashProvider implements PaymentProvider {
  private token?: { value: string; expiresAt: number };
  private readonly base: string;

  constructor(private readonly env: Env) {
    this.base = BASE[env.BKASH_MODE as 'sandbox' | 'live'];
  }

  private async post<T>(path: string, body: unknown, headers: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`bKash ${path} returned ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async auth(): Promise<Record<string, string>> {
    if (!this.token || this.token.expiresAt < Date.now()) {
      const r = await this.post<{ id_token?: string; expires_in?: number; statusMessage?: string }>(
        '/token/grant',
        { app_key: this.env.BKASH_APP_KEY, app_secret: this.env.BKASH_APP_SECRET },
        { username: this.env.BKASH_USERNAME!, password: this.env.BKASH_PASSWORD! },
      );
      if (!r.id_token) throw new Error(`bKash token grant failed: ${r.statusMessage}`);
      this.token = { value: r.id_token, expiresAt: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 };
    }
    return { authorization: this.token.value, 'x-app-key': this.env.BKASH_APP_KEY! };
  }

  async create(i: Parameters<PaymentProvider['create']>[0]): Promise<CreatedPayment> {
    const r = await this.post<{ paymentID?: string; bkashURL?: string; statusMessage?: string }>('/create', {
      mode: '0011', payerReference: i.payerRef, callbackURL: i.callbackUrl, amount: taka(i.amountPoisha), currency: 'BDT', intent: 'sale', merchantInvoiceNumber: i.invoice,
    }, await this.auth());
    if (!r.paymentID || !r.bkashURL) throw new Error(`bKash create failed: ${r.statusMessage}`);
    return { providerPaymentId: r.paymentID, redirectUrl: r.bkashURL };
  }

  private toResult(r: { transactionStatus?: string; trxID?: string; statusMessage?: string }): ExecutedPayment {
    return { paid: r.transactionStatus === 'Completed' && !!r.trxID, trxId: r.trxID, message: r.statusMessage };
  }

  async execute(paymentID: string) {
    return this.toResult(await this.post('/execute', { paymentID }, await this.auth()));
  }

  async query(paymentID: string) {
    return this.toResult(await this.post('/payment/status', { paymentID }, await this.auth()));
  }

  async refund(i: Parameters<PaymentProvider['refund']>[0]) {
    const r = await this.post<{ refundTrxID?: string; statusMessage?: string }>('/payment/refund', {
      paymentID: i.providerPaymentId, trxID: i.trxId, amount: taka(i.amountPoisha), sku: i.invoice, reason: 'Customer refund',
    }, await this.auth());
    if (!r.refundTrxID) throw new Error(`bKash refund failed: ${r.statusMessage}`);
    return { refundTrxId: r.refundTrxID };
  }
}

/** Development stand-in with the same flow as bKash. The env check refuses it in production. */
export class FakeBkashProvider implements PaymentProvider {
  constructor(private readonly apiBase: string) {}

  async create(i: Parameters<PaymentProvider['create']>[0]): Promise<CreatedPayment> {
    const id = `fake_${randomUUID()}`;
    const q = new URLSearchParams({ paymentID: id, callback: i.callbackUrl, amount: taka(i.amountPoisha) });
    return { providerPaymentId: id, redirectUrl: `${this.apiBase}/payments/fake-bkash?${q}` };
  }

  async execute(id: string) {
    return { paid: true, trxId: `TRX${id.slice(5, 15).toUpperCase()}` };
  }

  async query(id: string) {
    return { paid: true, trxId: `TRX${id.slice(5, 15).toUpperCase()}` };
  }

  async refund(i: Parameters<PaymentProvider['refund']>[0]) {
    return { refundTrxId: `REF${i.trxId}` };
  }
}
