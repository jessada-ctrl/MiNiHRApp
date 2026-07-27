import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';
import { LeaveTypesService } from '../leave-types/leave-types.service';
import { HolidaysService } from '../holidays/holidays.service';

const MODEL = 'claude-haiku-4-5';
const MAX_TOOL_TURNS = 4;

const SYSTEM_PROMPT = `You are the HR assistant for a company's LINE Official Account, part of the LaLa' leave & attendance system — talking to an HR admin (tenant_admin), not a regular employee.

Scope — company-wide, READ-ONLY summaries only:
- how many leave requests are currently pending approval, and how many have been stuck for a while
- the company's leave types and policies
- upcoming company holidays
- who is on approved leave today, and which department they're in

Rules:
- Never invent numbers. Always call a tool to get real data before answering.
- You cannot approve, reject, or modify anything through this chat, and you cannot see any single employee's personal leave details or attachments here — this is a summary view only. Approvals still go through the normal Flex Message / LIFF Review flow so there's a proper audit trail. If asked to approve/reject/change something, tell the admin to use the approval flow or the web dashboard instead.
- If a tool call fails or returns nothing useful, say so plainly.
- Respond in Thai, in plain text suitable for a LINE chat bubble: short paragraphs, no markdown headers or tables.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_pending_approvals_summary',
    description:
      "Get a company-wide count of leave requests currently pending approval, and how many of those have been pending more than 3 days. Call this whenever the HR admin asks how many requests are waiting, or about approval backlog/aging.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_leave_types',
    description:
      'List all leave types configured for this company: name, default annual quota, whether hourly leave is allowed, and after how many cumulative days a medical certificate is required.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_upcoming_holidays',
    description: 'List the company holidays from today onward, nearest first.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_who_is_on_leave_today',
    description: "List every employee currently on approved leave today, with their department and leave type. Call this whenever asked who is out/on leave today.",
    input_schema: { type: 'object', properties: {} },
  },
];

/** Same tool-use-loop shape as ChatbotService, but scoped to company-wide read-only data for tenant_admin users instead of one employee's own data. */
@Injectable()
export class HrChatbotService {
  private readonly logger = new Logger(HrChatbotService.name);
  private readonly client = new Anthropic();

  constructor(
    private readonly leaveRequests: LeaveRequestsService,
    private readonly leaveTypes: LeaveTypesService,
    private readonly holidays: HolidaysService,
  ) {}

  async answer(question: string): Promise<string> {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages,
        });
      } catch (err) {
        this.logger.error(`Claude API call failed: ${err instanceof Error ? err.message : String(err)}`);
        return 'ขออภัย ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง';
      }

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

      if (toolUses.length === 0) {
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
        return textBlock?.text?.trim() || 'ขออภัย ไม่สามารถตอบคำถามนี้ได้';
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const result = await this.runTool(toolUse.name);
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return 'ขออภัย คำถามนี้ต้องใช้ข้อมูลหลายส่วนเกินไป กรุณาเข้าเว็บแดชบอร์ดแทน';
  }

  private async runTool(name: string): Promise<unknown> {
    try {
      switch (name) {
        case 'get_pending_approvals_summary':
          return await this.leaveRequests.getPendingAgingSummary();
        case 'get_leave_types': {
          const types = await this.leaveTypes.list();
          return types.map((t) => ({
            name: t.name,
            defaultAnnualQuota: t.defaultQuota.toNumber(),
            allowHourly: t.allowHourly,
            isPaid: t.isPaid,
            requiresAttachmentAfterDays: t.requiresAttachmentAfterDays,
          }));
        }
        case 'get_upcoming_holidays': {
          const all = await this.holidays.list();
          const today = new Date(new Date().toDateString());
          return all
            .filter((h) => h.holidayDate >= today)
            .map((h) => ({ name: h.name, date: h.holidayDate.toISOString().slice(0, 10) }));
        }
        case 'get_who_is_on_leave_today':
          return await this.leaveRequests.getEmployeesOnLeaveToday();
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      this.logger.error(`Tool "${name}" failed: ${err instanceof Error ? err.message : String(err)}`);
      return { error: 'This tool failed to fetch data.' };
    }
  }
}
