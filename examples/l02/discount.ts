/** Orders of at least 20 receive 10% off; invalid totals are rejected. */
export function discountedTotal(total: number): number {
  if (!Number.isFinite(total) || total < 0) throw new RangeError('Invalid total');
  return total >= 20 ? total * 0.9 : total;
}
