import { Body, Controller, HttpCode, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { LineSignatureGuard } from './line-signature.guard';

/**
 * Dynamic per-tenant LINE webhook endpoint (FR-1.2):
 *   POST /v1/webhook/line/:tenantId
 *
 * TenantMiddleware has already resolved tenantId into the request context,
 * and LineSignatureGuard has verified the request actually came from LINE
 * (NFR-3) by the time this handler runs.
 *
 * TODO before this can accept real traffic:
 *  - Route each LINE event (message, postback, follow) to the relevant
 *    handler (FR-2.1 OTP binding flow, FR-2.3 attendance check-in, etc).
 * Kept as a stub for now so the local dev environment has a real,
 * signature-verified endpoint to point a LINE Developers console webhook
 * URL at during manual testing.
 */
@Controller('v1/webhook/line')
@UseGuards(LineSignatureGuard)
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  @Post(':tenantId')
  @HttpCode(200)
  handleLineWebhook(@Param('tenantId') tenantId: string, @Body() body: unknown) {
    this.logger.log(`LINE webhook received for tenant ${getCurrentTenantId()} (path param: ${tenantId})`);
    this.logger.debug(JSON.stringify(body));
    // LINE requires a fast 200 OK regardless of payload contents.
    return { status: 'received' };
  }
}
