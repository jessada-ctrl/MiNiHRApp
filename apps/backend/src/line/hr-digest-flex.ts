interface HrDigestFlexInput {
  totalPending: number;
  overdueCount: number;
  upcomingHolidays: { name: string; date: Date }[];
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function row(label: string, value: string) {
  return {
    type: 'box',
    layout: 'baseline',
    contents: [
      { type: 'text', text: label, color: '#9ca3af', size: 'sm', flex: 3 },
      { type: 'text', text: value, size: 'sm', flex: 5, wrap: true },
    ],
  };
}

/** Weekly summary pushed to every HR admin — pending-approval aging + upcoming holidays. */
export function buildHrDigestFlex(input: HrDigestFlexInput) {
  const bodyContents: Record<string, unknown>[] = [
    { type: 'text', text: '📋 สรุปประจำสัปดาห์', weight: 'bold', size: 'sm', color: '#0f766e' },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'sm',
      contents: [
        row('คำขอค้างอนุมัติ', `${input.totalPending} รายการ`),
        row('ค้างเกิน 3 วัน', `${input.overdueCount} รายการ`),
      ],
    },
  ];

  if (input.overdueCount > 0) {
    bodyContents.push({ type: 'text', text: '⚠️ มีคำขอค้างอนุมัตินานเกิน 3 วัน', color: '#b45309', weight: 'bold', size: 'sm', margin: 'md', wrap: true });
  }

  if (input.upcomingHolidays.length > 0) {
    bodyContents.push({ type: 'text', text: 'วันหยุดใกล้ถึง', weight: 'bold', size: 'sm', margin: 'lg' });
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'sm',
      spacing: 'sm',
      contents: input.upcomingHolidays.map((h) => row(formatDate(h.date), h.name)),
    });
  }

  const contents = { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: bodyContents } };

  return { altText: `สรุปประจำสัปดาห์: คำขอค้างอนุมัติ ${input.totalPending} รายการ`, contents };
}
