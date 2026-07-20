import { PrismaClient } from '@prisma/client';

const WINDOW_A_DAYS = 30;
const WINDOW_A_THRESHOLD = 5;
const WINDOW_B_WEEKS = 5;
const WINDOW_B_CONSECUTIVE = 3;

function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * FR-3.4: "High Absence Frequency Risk" — the SRS gives two example
 * conditions but doesn't fully pin down an exact algorithm (esp. condition
 * B's "3 consecutive weeks" — consecutive by what boundary, using which
 * leave statuses). This is a reasonable, documented interpretation:
 *
 *  A) Sum of approved+pending leave days in the trailing 30 days > 5.
 *  B) At least one Monday or Friday leave day in each of 3 consecutive ISO
 *     week numbers, within the trailing 5 weeks.
 *
 * Called at Flex-send time (both the initial FR-3.1 notification and the
 * FR-3.3 reminder), not on a schedule of its own.
 */
export async function checkHighAbsenceFrequencyRisk(prisma: PrismaClient, employeeId: string, asOf: Date): Promise<boolean> {
  const windowAStart = new Date(asOf);
  windowAStart.setUTCDate(windowAStart.getUTCDate() - WINDOW_A_DAYS);
  const windowBStart = new Date(asOf);
  windowBStart.setUTCDate(windowBStart.getUTCDate() - WINDOW_B_WEEKS * 7);

  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: { in: ['approved', 'pending'] },
      startDatetime: { gte: windowBStart, lte: asOf },
    },
    select: { startDatetime: true, totalDays: true },
  });

  const sumWindowA = requests
    .filter((r) => r.startDatetime >= windowAStart)
    .reduce((sum, r) => sum + r.totalDays.toNumber(), 0);
  if (sumWindowA > WINDOW_A_THRESHOLD) return true;

  const mondayOrFridayWeeks = new Set(
    requests.filter((r) => [1, 5].includes(r.startDatetime.getUTCDay())).map((r) => isoWeekNumber(r.startDatetime)),
  );
  const weeks = [...mondayOrFridayWeeks].sort((a, b) => a - b);
  let streak = 1;
  for (let i = 1; i < weeks.length; i++) {
    streak = weeks[i] === weeks[i - 1] + 1 ? streak + 1 : 1;
    if (streak >= WINDOW_B_CONSECUTIVE) return true;
  }

  return false;
}
