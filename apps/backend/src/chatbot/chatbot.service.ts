import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';
import { LeaveTypesService } from '../leave-types/leave-types.service';
import { HolidaysService } from '../holidays/holidays.service';

const MODEL = 'claude-haiku-4-5';
const MAX_TOOL_TURNS = 4;

const BASE_SYSTEM_PROMPT = `You are the HR assistant for a company's LINE Official Account, part of the LaLa' leave & attendance system.

Scope — only answer questions about the employee's OWN data:
- their leave quota / remaining leave days
- the company's leave types and policies (e.g. document requirements, whether hourly leave is allowed)
- upcoming company holidays

Rules:
- Never invent numbers. Always call a tool to get real data before answering a question about quota, policy, or holidays.
- You cannot approve, reject, or modify anything, and you cannot see or discuss any other employee's data{{WHO_IS_ON_LEAVE_EXCEPTION}}. If asked to do any of that, or asked something outside your scope, tell the employee to contact HR directly.
- If a tool call fails or returns nothing useful, say so plainly and suggest contacting HR — do not guess.
- Respond in Thai, in plain text suitable for a LINE chat bubble: short paragraphs, no markdown headers or tables.`;

const WHO_IS_ON_LEAVE_EXCEPTION =
  ', except you MAY answer "who is on leave today" — the company has explicitly opted into sharing that specific summary';

const BASE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_leave_quota_summary',
    description:
      "Get the employee's own leave quota summary for a given year: total, used, pending, and remaining days per leave type. Call this whenever the employee asks how many leave days they have left, or about their leave balance.",
    input_schema: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: 'Calendar year (e.g. 2026). Defaults to the current year if omitted.' },
      },
    },
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
];

const WHO_IS_ON_LEAVE_TOOL: Anthropic.Tool = {
  name: 'get_who_is_on_leave_today',
  description: "List every employee currently on approved leave today, with their department and leave type. Call this whenever asked who is out/on leave today.",
  input_schema: { type: 'object', properties: {} },
};

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly client = new Anthropic();

  constructor(
    private readonly leaveRequests: LeaveRequestsService,
    private readonly leaveTypes: LeaveTypesService,
    private readonly holidays: HolidaysService,
  ) {}

  /**
   * Answers one employee question. `employeeId` is resolved by the caller
   * from the LINE-bound employee record — it is never taken from the model,
   * and none of the tools below accept a tenant/employee id as a parameter,
   * so there is no way for a crafted question to make Claude ask for
   * another employee's data (NFR-1).
   *
   * `canAskWhoIsOnLeave` is decided by the caller (ChatbotOrchestratorService)
   * from the tenant's `chatbotWhoIsOnLeaveVisibility` setting plus this
   * employee's role — approver only when the setting is 'hr_and_approver' or
   * 'everyone', a plain employee only when it's 'everyone'. Threaded through
   * as a plain boolean so this service doesn't need its own Tenant lookup.
   */
  async answer(employeeId: string, question: string, canAskWhoIsOnLeave: boolean): Promise<string> {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
    const tools = canAskWhoIsOnLeave ? [...BASE_TOOLS, WHO_IS_ON_LEAVE_TOOL] : BASE_TOOLS;
    const systemPrompt = BASE_SYSTEM_PROMPT.replace(
      '{{WHO_IS_ON_LEAVE_EXCEPTION}}',
      canAskWhoIsOnLeave ? WHO_IS_ON_LEAVE_EXCEPTION : '',
    );

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          tools,
          messages,
        });
      } catch (err) {
        this.logger.error(`Claude API call failed: ${err instanceof Error ? err.message : String(err)}`);
        return 'ขออภัย ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง หรือติดต่อฝ่ายบุคคล';
      }

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

      if (toolUses.length === 0) {
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
        return textBlock?.text?.trim() || 'ขออภัย ไม่สามารถตอบคำถามนี้ได้ กรุณาติดต่อฝ่ายบุคคล';
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const result = await this.runTool(employeeId, toolUse.name, toolUse.input);
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return 'ขออภัย คำถามนี้ต้องใช้ข้อมูลหลายส่วนเกินไป กรุณาติดต่อฝ่ายบุคคลโดยตรง';
  }

  private async runTool(employeeId: string, name: string, input: unknown): Promise<unknown> {
    try {
      switch (name) {
        case 'get_leave_quota_summary': {
          const year = this.readYear(input);
          const summary = await this.leaveRequests.myQuotaSummary(employeeId, year);
          return summary.map((s) => ({
            leaveType: s.name,
            allowHourly: s.allowHourly,
            requiresAttachmentAfterDays: s.requiresAttachmentAfterDays,
            totalDays: s.total,
            usedDays: s.used,
            pendingDays: s.pending,
            remainingDays: s.remaining,
          }));
        }
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
      return { error: 'This tool failed to fetch data. Tell the employee to contact HR.' };
    }
  }

  private readYear(input: unknown): number | undefined {
    if (input && typeof input === 'object' && 'year' in input) {
      const year = (input as { year?: unknown }).year;
      if (typeof year === 'number' && Number.isInteger(year)) return year;
    }
    return undefined;
  }
}
