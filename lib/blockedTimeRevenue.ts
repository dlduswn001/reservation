import { seoulDayKey } from "./bookingRevenue";

export type ManualBlock = {
  id: string;
  start_at: string;
  end_at: string;
};

export type BlockedTimeTuition = {
  block_id: string;
  amount_krw: number | null;
  confirmed_at: string | null;
  memo: string;
  updated_at: string;
};

export type ManualLessonRevenue = {
  date: string;
  entries: number;
  unpriced: number;
  total: number;
  confirmed: number;
};

/**
 * Only explicitly saved manual fees count as revenue. Unpriced external
 * blocks or appointment holds are not automatically treated as lessons.
 */
export function dailyManualLessonRevenue(
  blocks: ManualBlock[],
  fees: BlockedTimeTuition[],
  date: string,
): ManualLessonRevenue {
  const table = new Map(fees.map(fee => [fee.block_id, fee]));
  const result: ManualLessonRevenue = { date, entries: 0, unpriced: 0, total: 0, confirmed: 0 };
  for (const block of blocks) {
    if (seoulDayKey(block.start_at) !== date) continue;
    const fee = table.get(block.id);
    if (!fee) continue;
    if (fee.amount_krw === null || !Number.isInteger(fee.amount_krw) || fee.amount_krw < 0) {
      result.unpriced += 1;
      continue;
    }
    result.entries += 1;
    result.total += fee.amount_krw;
    if (fee.confirmed_at) result.confirmed += fee.amount_krw;
  }
  return result;
}

export function monthlyManualLessonRevenue(
  blocks: ManualBlock[], fees: BlockedTimeTuition[], month: string,
): ManualLessonRevenue[] {
  const withFee = new Set(fees.map(fee => fee.block_id));
  const dates = Array.from(new Set(blocks.filter(b => withFee.has(b.id))
    .map(b => seoulDayKey(b.start_at)).filter(day => day.startsWith(month)))).sort();
  return dates.map(date => dailyManualLessonRevenue(blocks, fees, date));
}
