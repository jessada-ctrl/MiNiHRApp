interface LeaveRequestFlexInput {
  employeeName: string;
  leaveTypeName: string;
  startDatetime: Date;
  endDatetime: Date;
  totalDays: number;
  isOverQuota: boolean;
  webAdminUrl: string;
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
    { type: 'text', text: 'คำขอลารออนุมัติ', weight: 'bold', size: 'sm', color: '#0f766e' },
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
          action: { type: 'uri', label: '🔎 ตรวจสอบ', uri: `${input.webAdminUrl}/approvals` },
        },
      ],
    },
  };

  return { altText: `คำขอลาของ ${input.employeeName} รออนุมัติ`, contents };
}
