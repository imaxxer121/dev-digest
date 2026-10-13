import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { Agent, RunSummary, PrMeta } from '@devdigest/shared';
import messages from '../../../../../messages/en/multiAgent.json';
import { ConfigureRun, historicalEstimate } from './ConfigureRun';
afterEach(cleanup);
const agents = Array.from({ length: 7 }, (_, i) => ({ id: `agent-${i}`, name: `Reviewer ${i}`, model: 'fixture', provider: 'anthropic', enabled: i < 6, description: 'Review persona' } as Agent));
const pulls = [{ id: 'pr-one', number: 1, title: 'First PR' }, { id: 'pr-two', number: 2, title: 'Second PR' }] as PrMeta[];
function setup(props: Partial<React.ComponentProps<typeof ConfigureRun>> = {}) {
  const onRun = vi.fn(async () => {}), onSelectPr = vi.fn();
  render(<NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}><ConfigureRun pulls={pulls} prId="pr-one" agents={agents} runs={[]}
    pending={false} onRun={onRun} onSelectPr={onSelectPr} {...props} /></NextIntlClientProvider>);
  return { onRun, onSelectPr };
}
describe('explicit configure interaction', () => {
  it('does not run implicitly, enforces five and sends exactly the selected enabled agents', async () => {
    const { onRun } = setup(); expect(screen.getByRole('button', { name: 'Run multi-agent review (0)' })).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: 'Reviewer 6' })).not.toBeInTheDocument();
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('checkbox', { name: `Reviewer ${i}` }));
    expect(screen.getByRole('checkbox', { name: 'Reviewer 5' })).toBeDisabled(); expect(onRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reviewer 1' })); expect(screen.getByRole('checkbox', { name: 'Reviewer 5' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Run multi-agent review (4)' })); expect(onRun).toHaveBeenCalledWith(['agent-0', 'agent-2', 'agent-3', 'agent-4']);
  });
  it('requires a PR, preserves selection after error and exposes the real PR picker', () => {
    const { onSelectPr } = setup({ error: new Error('Quota failed') });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reviewer 0' })); expect(screen.getByRole('alert')).toHaveTextContent('Quota failed');
    expect(screen.getByRole('checkbox', { name: 'Reviewer 0' })).toBeChecked();
    fireEvent.change(screen.getByRole('combobox', { name: 'Pull request' }), { target: { value: 'pr-two' } }); expect(onSelectPr).toHaveBeenCalledWith('pr-two');
  });
  it('disables editing and double submission while the request is pending', () => {
    setup({ pending: true }); expect(screen.getByRole('combobox', { name: 'Pull request' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Reviewer 0' })).toBeDisabled(); expect(screen.getByRole('button')).toBeDisabled();
  });
  it('keeps unknown price unknown and excludes failed runs from measured estimates', () => {
    const rows = [{ agent_id: 'a', status: 'done', duration_ms: 100, cost_usd: .001 }, { agent_id: 'a', status: 'done', duration_ms: 300, cost_usd: null },
      { agent_id: 'a', status: 'failed', duration_ms: 5000, cost_usd: 5 }] as RunSummary[];
    expect(historicalEstimate(rows, 'a')).toEqual({ count: 2, duration: 200, cost: null });
    expect(historicalEstimate(rows, 'b')).toEqual({ count: 0, duration: null, cost: null });
  });
});
