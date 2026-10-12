/** Contract: totals below 20 are unchanged; totals >= 20 receive 10% off. Invalid totals throw RangeError. */
export function discountedTotal(total: number): number {
  if (!Number.isFinite(total) || total < 0) throw new RangeError('Invalid total');
  return total >= 20 ? total * 0.9 : total;
}
