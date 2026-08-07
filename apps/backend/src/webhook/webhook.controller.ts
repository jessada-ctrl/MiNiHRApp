import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Logger, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ChatbotOrchestratorService } from '../chatbot/chatbot-orchestrator.service';
import { EmployeesService } from '../employees/employees.service';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';
import { LineMessagingService } from '../line/line-messaging.service';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { LineSignatureGuard } from './line-signature.guard';

interface LineWebhookEvent {
  type: string;
  message?: { type: string; text?: string };
  postback?: { data: string };
  source?: { type: string; userId?: string };
}

interface LineWebhookBody {
  events?: LineWebhookEvent[];
}

const WELCOME_TEXT =
  'ยินดีต้อนรับสู่ LaLa\'! 👋\nกดปุ่ม "ลงทะเบียน" ที่เมนูด้านล่างแชทนี้ เพื่อผูกบัญชี LINE ของคุณเข้ากับข้อมูลพนักงาน — ใช้เวลาไม่ถึงนาที';

/**
 * Dynamic per-tenant LINE webhook endpoint (FR-1.2):
 *   POST /v1/webhook/line/:tenantId
 *
 * TenantMiddleware has already resolved tenantId into the request context,
 * and LineSignatureGuard has verified the request actually came from LINE
 * (NFR-3) by the time this handler runs.
 *
 * Routes plain-text `message` events to the HR chatbot, `follow` events
 * (someone just added the OA as a friend) to a welcome message, and
 * `postback` events (the "✅ อนุมัติ" quick-action button on an approver's
 * Flex Message) to a one-tap approve. The Rich Menu itself isn't set here —
 * the "unregistered" menu is the channel-wide default (set once by
 * scripts/setup-line-rich-menu.ts), so a new follower sees it immediately
 * without needing a per-user API call.
 *
 * TODO before this can accept the rest of real traffic:
 *  - Route the remaining `postback` events (FR-2.3 attendance check-in, etc).
 */
// Exempt from the global per-IP rate limit: every employee of a tenant
// reaches this through LINE's own servers, so all of a company's traffic
// arrives from a handful of shared source IPs and an IP-keyed limit would
// throttle legitimate use long before it stopped anything. Abuse is blocked
// by LineSignatureGuard instead — an unsigned request never gets past it.
@SkipThrottle()
@Controller('v1/webhook/line')
@UseGuards(LineSignatureGuard)
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly chatbotOrchestrator: ChatbotOrchestratorService,
    private readonly lineMessaging: LineMessagingService,
    private readonly employees: EmployeesService,
    private readonly leaveRequests: LeaveRequestsService,
  ) {}

  @Post(':tenantId')
  @HttpCode(200)
  handleLineWebhook(@Param('tenantId') tenantId: string, @Body() body: LineWebhookBody) {
    const tenantContextId = getCurrentTenantId();
    this.logger.log(`LINE webhook received for tenant ${tenantContextId} (path param: ${tenantId})`);

    for (const event of body?.events ?? []) {
      if (event.type === 'message' && event.message?.type === 'text' && event.source?.userId) {
        const lineUserId = event.source.userId;
        const text = event.message.text ?? '';

        // Not awaited: LINE requires a fast 200 OK regardless of payload
        // contents, and the chatbot reply is delivered asynchronously via
        // the Push Message API instead of blocking this response on an LLM
        // round trip. Still runs inside this request's tenant context — see
        // ChatbotOrchestratorService's doc comment.
        this.chatbotOrchestrator.handleTextMessage(lineUserId, text).catch((err) => {
          this.logger.error(
            `Chatbot handling failed for tenant ${tenantContextId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      } else if (event.type === 'follow' && event.source?.userId) {
        this.lineMessaging.pushText(tenantContextId, event.source.userId, WELCOME_TEXT).catch((err) => {
          this.logger.error(
            `Welcome push failed for tenant ${tenantContextId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      } else if (event.type === 'postback' && event.postback?.data && event.source?.userId) {
        this.handlePostback(event.source.userId, event.postback.data).catch((err) => {
          this.logger.error(
            `Postback handling failed for tenant ${tenantContextId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    }

    return { status: 'received' };
  }

  /**
   * The only postback action wired up so far is the "✅ อนุมัติ" quick-action
   * button (see leave-request-flex.ts's buildLeaveRequestFlex). It calls
   * LeaveRequestsService.approve() directly — that method already enforces
   * "are you actually the current approver" and fires every downstream
   * notification (next approver, employee decision, HR over-quota alert),
   * so this handler is just: resolve who tapped the button, call it, and
   * report the outcome back to them.
   */
  private async handlePostback(lineUserId: string, data: string): Promise<void> {
    const tenantId = getCurrentTenantId();
    const params = new URLSearchParams(data);
    if (params.get('action') !== 'quick_approve') return;

    const requestId = params.get('requestId');
    if (!requestId) return;

    const approver = await this.employees.findByLineUserId(lineUserId);
    if (!approver) {
      await this.lineMessaging.pushText(tenantId, lineUserId, 'ไม่พบข้อมูลพนักงานที่ผูกกับบัญชี LINE นี้');
      return;
    }

    try {
      await this.leaveRequests.approve(requestId, approver.id);
      await this.lineMessaging.pushText(tenantId, lineUserId, '✅ อนุมัติคำขอลาเรียบร้อยแล้ว');
    } catch (err) {
      const message =
        err instanceof NotFoundException
          ? 'ไม่พบคำขอลานี้แล้ว'
          : err instanceof ForbiddenException
            ? 'คุณไม่ใช่ผู้อนุมัติของคำขอนี้ในขั้นตอนปัจจุบัน'
            : err instanceof BadRequestException
              ? 'คำขอนี้ถูกดำเนินการไปแล้ว (อนุมัติ/ปฏิเสธ) โดยอาจเป็นคุณเองหรือคนอื่น'
              : 'เกิดข้อผิดพลาด กรุณาลองใหม่ผ่านหน้าเว็บแทน';
      await this.lineMessaging.pushText(tenantId, lineUserId, message);
    }
  }
}
