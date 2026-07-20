interface LeaveRequestFlexInput {
  employeeName: string;
  leaveTypeName: string;
  startDatetime: Date;
  endDatetime: Date;
  totalDays: number;
  isOverQuota: boolean;
  /** Pre-built target for the "🔎 ตรวจสอบ" button — LIFF Review page (FR-3.2) if available, else the web-admin approvals page. */
  reviewUrl: string;
  /** FR-3.4: employee has an unusually frequent leave pattern — see absence-frequency.ts. */
  highAbsenceRisk?: boolean;
  /** FR-3.3: true when this is a repeat nudge, not the first notification for this step. */
  isReminder?: boolean;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function row(label: string, value: string) {
  return {
    type: 'box',
    layout: 'baseline',
    contents: [
      { type: 'text', text: label, color: '#9ca3af', size: 'sm', flex: 2 },
      { type: 'text', text: value, size: 'sm', flex: 5, wrap: true },
    ],
  };
}

/** FR-3.1: Flex Message card notifying an approver that a leave request needs their action. */
export function buildLeaveRequestFlex(input: LeaveRequestFlexInput) {
  const dateRange =
    input.startDatetime.getTime() === input.endDatetime.getTime()
      ? formatDate(input.startDatetime)
      : `${formatDate(input.startDatetime)} – ${formatDate(input.endDatetime)}`;

  const bodyContents: Record<string, unknown>[] = [
    {
      type: 'text',
      text: input.isReminder ? '⏰ ทวงถาม — คำขอลารออนุมัติ' : 'คำขอลารออนุมัติ',
      weight: 'bold',
      size: 'sm',
      color: '#0f766e',
    },
    { type: 'text', text: input.employeeName, weight: 'bold', size: 'lg', margin: 'sm', wrap: true },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'sm',
      contents: [row('ประเภท', input.leaveTypeName), row('ช่วงเวลา', dateRange), row('จำนวน', `${input.totalDays} วัน`)],
    },
  ];

  if (input.isOverQuota) {
    bodyContents.push({ type: 'text', text: '⚠️ เกินโควตา', color: '#dc2626', weight: 'bold', size: 'sm', margin: 'md' });
  }
  if (input.highAbsenceRisk) {
    bodyContents.push({ type: 'text', text: '🚩 High Absence Frequency Risk', color: '#b45309', weight: 'bold', size: 'sm', margin: 'md', wrap: true });
  }

  const contents = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', contents: bodyContents },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#0f766e',
          action: { type: 'uri', label: '🔎 ตรวจสอบ', uri: input.reviewUrl },
        },
      ],
    },
  };

  return { altText: `คำขอลาของ ${input.employeeName} รออนุมัติ`, contents };
}

interface OverQuotaAlertFlexInput {
  employeeName: string;
  leaveTypeName: string;
  startDatetime: Date;
  endDatetime: Date;
  totalDays: number;
  reportsUrl: string;
}

/** FR-4.4: Flex Message alerting HR the moment an over-quota leave request finishes its approval chain. */
export function buildOverQuotaAlertFlex(input: OverQuotaAlertFlexInput) {
  const dateRange =
    input.startDatetime.getTime() === input.endDatetime.getTime()
      ? formatDate(input.startDatetime)
      : `${formatDate(input.startDatetime)} – ${formatDate(input.endDatetime)}`;

  const contents = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '🚩 คำขอลาเกินโควตาได้รับการอนุมัติแล้ว', weight: 'bold', size: 'sm', color: '#dc2626', wrap: true },
        { type: 'text', text: input.employeeName, weight: 'bold', size: 'lg', margin: 'sm', wrap: true },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          spacing: 'sm',
          contents: [row('ประเภท', input.leaveTypeName), row('ช่วงเวลา', dateRange), row('จำนวน', `${input.totalDays} วัน`)],
        },
        { type: 'text', text: 'เตรียมพิจารณาหักค่าจ้าง (LWOP) ตอนสิ้นเดือน', size: 'xs', color: '#9ca3af', margin: 'md', wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'button', style: 'primary', color: '#dc2626', action: { type: 'uri', label: '📊 ดูรายงาน', uri: input.reportsUrl } }],
    },
  };

  return { altText: `คำขอลาเกินโควตาของ ${input.employeeName} ได้รับการอนุมัติครบแล้ว`, contents };
}
