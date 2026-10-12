import { describe, it, expect } from 'vitest';
import { discountedTotal } from './discount';
describe('discountedTotal', () => {
  it('applies the discount to a normal order', () => {
    expect(discountedTotal(100)).toBe(90);
  });
});
