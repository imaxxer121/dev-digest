import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { MultiAgentReviewRecord, FindingRecord } from '@devdigest/shared';
import multiAgent from '../../../../../../../../messages/en/multiAgent.json';
import prReview from '../../../../../../../../messages/en/prReview.json';
const state = vi.hoisted(() => ({ query: {} as any, action: vi.fn(), cancel: vi.fn(), events: vi.fn(), refetch: vi.fn() }));
vi.mock('@/lib/hooks/multi-agent', () => ({ useMultiAgentReviews: () => state.query }));
vi.mock('@/lib/hooks/reviews', () => ({ useRunEvents: (ids: string[]) => { state.events(ids); return { events: [{ t: '12:00', kind: 'info', msg: 'Actual event fixture' }], running: true }; },
  useFindingAction: () => ({ mutate: state.action, isPending: false }), useCancelRun: () => ({ mutate: state.cancel, isPending: false }) }));
vi.mock('@/lib/hooks/trace', () => ({ useRunTrace: () => ({ data: { log: [{ t: '12:00', kind: 'result', msg: 'Saved trace fixture' }] } }) }));
vi.mock('../EvalCaseAction', () => ({ EvalCaseAction: () => <button>Turn into eval case</button> }));
import { MultiAgentReview } from './MultiAgentReview';
const f: FindingRecord = { id: 'finding-one', review_id: 'review-one', severity: 'CRITICAL', category: 'security', title: 'Missing authorization', rationale: 'Leaks tenant data.',
  suggestion: 'Check ownership.', confidence: .95, file: 'auth.ts', start_line: 2, end_line: 2, accepted_at: null, dismissed_at: null };
const group = (): MultiAgentReviewRecord => ({ id: 'group-one', pr_id: 'pr-one', ran_at: '2026-10-13T10:00:00Z', members: [
  { run_id: 'run-one', agent_id: 'a', agent_name: 'Security', status: 'done', error: null, duration_ms: 120, cost_usd: null, tokens_in: 100, tokens_out: 30,
    review: { id: 'review-one', pr_id: 'pr-one', agent_id: 'a', run_id: 'run-one', agent_name: 'Security', kind: 'review', summary: 'Found access issue', verdict: 'comment', score: 60, model: 'fixture', created_at: '2026-10-13T10:00:00Z', findings: [f] } },
  { run_id: 'run-two', agent_id: 'b', agent_name: 'Conventions', status: 'failed', error: 'Provider quota failed', duration_ms: 20, cost_usd: null, tokens_in: 0, tokens_out: 0, review: null },
  { run_id: 'run-three', agent_id: 'c', agent_name: 'Tests', status: 'running', error: null, duration_ms: null, cost_usd: null, tokens_in: null, tokens_out: null, review: null }
], groups: [{ id: 'location-one', file: 'auth.ts', start_line: 2, end_line: 2, title: f.title, conflict: false, severity_disagreement: false,
  takes: [{ run_id: 'run-one', agent_name: 'Security', conclusion: 'flagged', findings: [f] }, { run_id: 'run-two', agent_name: 'Conventions', conclusion: 'unknown', findings: [] }, { run_id: 'run-three', agent_name: 'Tests', conclusion: 'unknown', findings: [] }] }] });
const renderView = (onOpenTrace = vi.fn()) => render(<NextIntlClientProvider locale="en" messages={{ multiAgent, prReview }}>
  <MultiAgentReview prId="pr-one" onOpenTrace={onOpenTrace} /></NextIntlClientProvider>);
beforeEach(() => { state.query = { data: { groups: [group()] }, isLoading: false, refetch: state.refetch }; state.action.mockClear(); state.cancel.mockClear(); state.events.mockClear(); state.refetch.mockClear(); });
afterEach(cleanup);
describe('multi-agent persisted comparison', () => {
  it('shows independent live/terminal states and traces; restores saved membership on reload', () => {
    const trace = vi.fn(), view = renderView(trace);
    expect(within(screen.getByRole('article', { name: 'Conventions' })).getByRole('alert')).toHaveTextContent('Provider quota failed');
    expect(within(screen.getByRole('article', { name: 'Tests' })).getByRole('status')).toHaveTextContent('Running');
    expect(state.events).toHaveBeenCalledWith(['run-three']);
    fireEvent.click(within(screen.getByRole('article', { name: 'Security' })).getByRole('button', { name: 'View trace' })); expect(trace).toHaveBeenCalledWith('run-one');
    view.unmount(); renderView(); expect(screen.getByRole('article', { name: 'Security' })).toBeInTheDocument(); expect(state.action).not.toHaveBeenCalled();
  });
  it('does not render incomplete peers as did-not-flag, filters conflicts and switches tabs with details', () => {
    renderView(); expect(screen.queryByText('Did not flag')).not.toBeInTheDocument(); expect(screen.getAllByText('Unknown — review incomplete or unavailable')).toHaveLength(2);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show only conflicts' })); expect(screen.getByText('No completed disagreements found.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tabs + detail' })); fireEvent.click(screen.getByRole('tab', { name: 'Conventions · Failed' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Provider quota failed'); expect(screen.queryByRole('article', { name: 'Tests' })).not.toBeInTheDocument();
  });
  it('acts on original persisted finding IDs and uses the actual Learn action', () => {
    renderView(); const column = within(screen.getByRole('article', { name: 'Security' }));
    fireEvent.click(column.getByRole('button', { name: 'Expand finding: Missing authorization' }));
    expect(column.getByText('Check ownership.')).toBeInTheDocument(); fireEvent.click(column.getByRole('button', { name: 'Accept' }));
    expect(state.action).toHaveBeenCalledWith({ findingId: 'finding-one', action: 'accept', prId: 'pr-one' });
    fireEvent.click(column.getByRole('button', { name: 'Learn' })); expect(state.action).toHaveBeenCalledWith({ findingId: 'finding-one', action: 'learn', prId: 'pr-one' }, expect.any(Object));
  });
  it('keeps loading, empty and failure/retry distinct', () => {
    state.query = { isLoading: true }; let view = renderView(); expect(screen.getByRole('status')).toHaveTextContent('Loading saved runs'); view.unmount();
    state.query = { data: { groups: [] } }; view = renderView(); expect(screen.getByText('No multi-agent runs yet.')).toBeInTheDocument(); view.unmount();
    state.query = { error: new Error('Network unavailable'), refetch: state.refetch }; renderView(); fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(state.refetch).toHaveBeenCalledOnce();
  });
});
