import { Body, Controller, HttpCode, Logger, Param, Post } from '@nestjs/common';
import { getCurrentTenantId } from '../tenant/tenant-context';

/**
 * Dynamic per-tenant LINE webhook endpoint (FR-1.2):
 *   POST /v1/webhook/line/:tenantId
 *
 * TenantMiddleware has already resolved tenantId into the request context
 * by the time this handler runs (see tenant/tenant.middleware.ts).
 *
 * TODO before this can accept real traffic:
 *  - Verify the `x-line-signature` header (HMAC-SHA256 with the tenant's
 *    Channel Secret) per NFR-3 — right now this accepts any payload.
 *  - Route each LINE event (message, postback, follow) to the relevant
 *    handler (FR-2.1 OTP binding flow, FR-2.3 attendance check-in, etc).
 * Kept as a stub for now so the local dev environment has a real endpoint
 * to point a LINE Developers console webhook URL at during manual testing.
 */
@Controller('v1/webhook/line')
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
