import { it, expect } from 'vitest';
import { RunStats } from '@devdigest/shared';
it('reads historical trace stats without a cost field as unknown cost', () => {
  expect(RunStats.parse({duration_ms:5,tokens_in:10,tokens_out:3,findings:0,grounding:'0/0 passed'}).cost_usd).toBeNull();
});
