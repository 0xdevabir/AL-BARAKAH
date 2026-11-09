import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { AppError } from './errors.js';

/** Sends email (login codes, doctor invitations). Console mode logs the message so local testing needs no mailbox. */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    if (this.env.EMAIL_PROVIDER === 'console') {
      this.log.log(`[dev email] to ${to}: ${subject} — ${text}`);
      return;
    }
    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        host: this.env.SMTP_HOST!,
        port: this.env.SMTP_PORT!,
        secure: this.env.SMTP_PORT === 465,
        auth: this.env.SMTP_USER ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS ?? '' } : undefined,
        connectionTimeout: 8_000,
        greetingTimeout: 8_000,
        socketTimeout: 12_000,
      });
      await transport.sendMail({ from: this.env.EMAIL_FROM!, to, subject, text, ...(html ? { html } : {}) });
    } catch (err) {
      if (err instanceof AppError) throw err;
      this.log.warn(`Email send failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Email is temporarily unavailable. Please try again in a moment.');
    }
  }
}
