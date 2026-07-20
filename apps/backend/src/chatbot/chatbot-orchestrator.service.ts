import { Injectable, Logger } from '@nestjs/common';
import { EmployeesService } from '../employees/employees.service';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { ChatbotService } from './chatbot.service';
import { LineMessagingService } from '../line/line-messaging.service';

/**
 * Glues an inbound LINE text message to a chatbot answer and the outbound
 * push reply. Called from WebhookController without being awaited (LINE
 * needs its 200 OK immediately) — still runs inside the tenant context
 * TenantMiddleware set up for the request, since it's kicked off
 * synchronously from within that scope (AsyncLocalStorage follows the
 * promise chain regardless of whether the caller awaits it).
 */
@Injectable()
export class ChatbotOrchestratorService {
  private readonly logger = new Logger(ChatbotOrchestratorService.name);

  constructor(
    private readonly employees: EmployeesService,
    private readonly chatbot: ChatbotService,
    private readonly lineMessaging: LineMessagingService,
  ) {}

  async handleTextMessage(lineUserId: string, text: string): Promise<void> {
    const tenantId = getCurrentTenantId();
    const employee = await this.employees.findByLineUserId(lineUserId);

    if (!employee) {
      await this.lineMessaging.pushText(
        tenantId,
        lineUserId,
        'ไม่พบข้อมูลพนักงานที่ผูกกับบัญชี LINE นี้ กรุณาลงทะเบียนผ่านเมนู "ลงทะเบียน" ก่อนใช้งาน',
      );
      return;
    }

    if (employee.status !== 'active') {
      await this.lineMessaging.pushText(tenantId, lineUserId, 'บัญชีพนักงานนี้ถูกปิดใช้งาน กรุณาติดต่อฝ่ายบุคคล');
      return;
    }

    this.logger.log(`Chatbot question from employee ${employee.id}: "${text}"`);
    const answer = await this.chatbot.answer(employee.id, text);
    // Logged at info level (not just sent via push) so the answer is visible
    // in server logs even when a tenant has no LINE access token configured
    // yet (e.g. local dev / demo) — pushText degrades to a warning in that case.
    this.logger.log(`Chatbot answer for employee ${employee.id}: "${answer}"`);
    await this.lineMessaging.pushText(tenantId, lineUserId, answer);
  }
}
