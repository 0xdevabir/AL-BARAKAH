import { Controller, Get, Inject } from '@nestjs/common';
import { RequirePermission } from '@albarakah/nest-common';
import { AppError, conflict } from '@albarakah/nest-common';
import { ENV, type Env } from '@albarakah/nest-common';
import { BulkSmsBdError, getBulkSmsBdBalance } from './bulksmsbd.js';

/** Lets an admin check how much SMS credit is left. */
@Controller('admin/sms')
export class SmsAdminController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @RequirePermission('settings:manage')
  @Get('balance')
  async balance() {
    if (this.env.SMS_PROVIDER !== 'bulksmsbd') throw conflict('SMS_GATEWAY_OFF', 'No SMS gateway is configured');
    try {
      return { balance: await getBulkSmsBdBalance(this.env.SMS_API_KEY!) };
    } catch (err) {
      if (err instanceof BulkSmsBdError) throw new AppError(502, 'SMS_GATEWAY_ERROR', err.message);
      throw err;
    }
  }
}
