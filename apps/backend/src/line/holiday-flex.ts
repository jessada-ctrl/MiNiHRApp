interface HolidayFlexInput {
  holidayName: string;
  holidayDate: Date;
}

/** FR-4.3: Flex Message card announcing an upcoming company holiday, pushed N days ahead per the holiday's own notifyDaysBefore. */
export function buildHolidayFlex(input: HolidayFlexInput) {
  const dateLabel = input.holidayDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

  const contents = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '📅 แจ้งเตือนวันหยุดบริษัท', weight: 'bold', size: 'sm', color: '#0f766e' },
        { type: 'text', text: input.holidayName, weight: 'bold', size: 'lg', margin: 'sm', wrap: true },
        { type: 'text', text: dateLabel, size: 'sm', color: '#6b7280', margin: 'sm' },
      ],
    },
  };

  return { altText: `แจ้งเตือนวันหยุด: ${input.holidayName} (${dateLabel})`, contents };
}
