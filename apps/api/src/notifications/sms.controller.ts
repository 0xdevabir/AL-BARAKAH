import { Controller, Get, Inject, Param, ParseIntPipe } from '@nestjs/common';
import { RequirePermission } from '../common/auth.js';
import { AppError, conflict, notFound } from '../common/errors.js';
import { ENV, type Env } from '../config/env.js';
import { AlphaSmsError, getAlphaSmsBalance, getAlphaSmsReport } from './alpha-sms.js';

/** Lets an admin check remaining credit and whether a message (by the request ID in the worker log) arrived. */
@Controller('admin/sms')
export class SmsAdminController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private async gateway<T>(request: (apiKey: string) => Promise<T>): Promise<T> {
    if (this.env.SMS_PROVIDER !== 'alphasms') throw conflict('SMS_GATEWAY_OFF', 'No SMS gateway is configured');
    try {
      return await request(this.env.SMS_API_KEY!);
    } catch (err) {
      if (!(err instanceof AlphaSmsError)) throw err;
      if (err.code === 404) throw notFound('No such SMS request');
      throw new AppError(502, 'SMS_GATEWAY_ERROR', err.message);
    }
  }

  @RequirePermission('settings:manage')
  @Get('balance')
  async balance() {
    return { balance: await this.gateway(getAlphaSmsBalance) };
  }

  @RequirePermission('settings:manage')
  @Get('reports/:id')
  report(@Param('id', ParseIntPipe) id: number) {
    return this.gateway((apiKey) => getAlphaSmsReport(apiKey, id));
  }
}
