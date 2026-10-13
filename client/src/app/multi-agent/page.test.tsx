import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../messages/en/multiAgent.json';
const state = vi.hoisted(() => ({ member: { run_id: 'live-child', agent_name: 'Security', status: 'running', review: null } as any, drawer: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('prId=pr-one'), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/components/app-shell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/repo-context', () => ({ useActiveRepo: () => ({ repoId: 'repo-one', activeRepo: { full_name: 'fixture/repo' } }) }));
vi.mock('@/lib/hooks/core', () => ({ usePulls: () => ({ data: [{ id: 'pr-one', number: 1, title: 'Fixture PR' }] }), usePullDetail: () => ({ data: { number: 1, head_sha: 'fixture' } }) }));
vi.mock('@/lib/hooks/agents', () => ({ useAgents: () => ({ data: [] }) }));
vi.mock('@/lib/hooks/reviews', () => ({ usePrRuns: () => ({ data: [] }), useRunReview: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('@/lib/hooks/multi-agent', () => ({ useMultiAgentReviews: () => ({ data: { groups: [{ members: [state.member] }] } }) }));
vi.mock('../repos/[repoId]/pulls/[number]/_components/MultiAgentReview', () => ({ MultiAgentReview: ({ onOpenTrace }: { onOpenTrace: (id: string) => void }) => <button onClick={() => onOpenTrace('live-child')}>View child trace</button> }));
vi.mock('../repos/[repoId]/pulls/[number]/_components/RunTraceDrawer', () => ({ default: (props: any) => { state.drawer(props); return <aside>Trace drawer</aside>; } }));
import MultiAgentPage from './page';
afterEach(cleanup);
describe('Configure page trace integration', () => {
  it('passes the selected live child and then its completed originals to the trace drawer', () => {
    state.member = { run_id: 'live-child', agent_name: 'Security', status: 'running', review: null }; state.drawer.mockClear();
    const element = () => <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}><MultiAgentPage /></NextIntlClientProvider>;
    const view = render(element()); fireEvent.click(screen.getByRole('button', { name: 'Saved run' })); fireEvent.click(screen.getByRole('button', { name: 'View child trace' }));
    expect(state.drawer).toHaveBeenLastCalledWith(expect.objectContaining({ runId: 'live-child', agentName: 'Security', running: true, findings: [] }));
    const original = { id: 'original-finding' }; state.member = { ...state.member, status: 'done', review: { findings: [original] } };
    view.rerender(element()); expect(state.drawer).toHaveBeenLastCalledWith(expect.objectContaining({ running: false, findings: [original] }));
  });
});
