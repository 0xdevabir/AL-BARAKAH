import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

/** Sends login codes by email. Console mode logs the message so local testing needs no mailbox. */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(to: string, subject: string, text: string): Promise<void> {
    if (this.env.EMAIL_PROVIDER === 'console') {
      this.log.log(`[dev email] to ${to}: ${subject} — ${text}`);
      return;
    }
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: this.env.SMTP_HOST!,
      port: this.env.SMTP_PORT!,
      secure: this.env.SMTP_PORT === 465,
      auth: this.env.SMTP_USER ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS ?? '' } : undefined,
    });
    await transport.sendMail({ from: this.env.EMAIL_FROM!, to, subject, text });
  }
}
