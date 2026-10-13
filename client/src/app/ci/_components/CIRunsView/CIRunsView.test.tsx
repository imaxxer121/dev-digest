import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../../../messages/en/ci.json';
import { CIRunsView } from './CIRunsView';
const mocks = vi.hoisted(() => ({ refresh: { mutate: vi.fn(), isPending: false, error: null as Error | null, data: null as { created: boolean } | null }, runs: { data: [] as unknown[], isLoading: false, error: null, refetch: vi.fn() } }));
vi.mock('@/lib/hooks/ci', () => ({ useCiRuns: () => mocks.runs, useCiInstallations: () => ({ data: [{ id: 'installation', repo: 'fixture/ci', runtime_provider: 'ollama', runtime_model: 'fixture-model', status: 'installed' }], error: null }), useCiRefresh: () => mocks.refresh }));
vi.mock('@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer', () => ({ default: ({ runId, findings = [] }: { runId: string; findings?: { title: string }[] }) => <div role="dialog">Trace {runId}{findings.map((finding, index) => <p key={index}>{finding.title}</p>)}</div> }));
function mount() { return render(<NextIntlClientProvider locale="en" messages={{ ci: messages }}><CIRunsView /></NextIntlClientProvider>); }
describe('CI history and explicit authenticated refresh', () => {
  it('shows stored empty state and imports only numeric identity after an explicit click', () => {
    mocks.runs.data = []; mocks.refresh.error = null; mocks.refresh.mutate.mockClear(); mount();
    expect(screen.getByText('No CI runs yet')).toBeInTheDocument(); expect(mocks.refresh.mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('GitHub run ID'), { target: { value: '17' } }); fireEvent.click(screen.getByRole('button', { name: 'Verify and import' }));
    expect(mocks.refresh.mutate).toHaveBeenCalledWith({ installation_id: 'installation', run_id: 17 });
  });
  it('renders real zero, unknown cost, provider/usage, source revision and job/trace links', () => {
    mocks.runs.data = [{ id: 'a', repo: 'fixture/ci', pr_number: 7, ran_at: '2026-10-13T12:00:00Z', status: 'failed', agent: 'Fixture', provider: 'ollama', model: 'fixture-model', duration_s: 0, cost_usd: null, findings_count: 1, verdict: 'request_changes', tokens_in: 7, tokens_out: 3, run_id: 'run-a', head_sha: 'a'.repeat(40), workflow_version: '2', github_url: 'https://github.com/fixture/ci/actions/runs/17' },
      { id: 'b', repo: 'fixture/ci', pr_number: 8, ran_at: null, status: 'no_findings', cost_usd: 0, duration_s: null, findings_count: 0, verdict: 'approve', provider: 'openrouter', model: 'fixture-model' }];
    mocks.refresh.error = null; mount();
    expect(screen.getByText('Unpriced')).toBeInTheDocument(); expect(screen.getByText('$0.0000')).toBeInTheDocument(); expect(screen.getByText(/0.0s/)).toBeInTheDocument();
    expect(screen.getByText('aaaaaaaa')).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'View job' })).toHaveAttribute('href', 'https://github.com/fixture/ci/actions/runs/17');
    fireEvent.click(screen.getByRole('button', { name: 'View trace' })); expect(screen.getByRole('dialog')).toHaveTextContent('run-a');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'no_findings' } }); expect(screen.queryByText('Fixture')).not.toBeInTheDocument(); expect(screen.getByText('$0.0000')).toBeInTheDocument();
  });
  it('shows provenance/authentication errors without declaring a fabricated run', () => {
    mocks.runs.data = []; mocks.refresh.error = new Error('Artifact provenance mismatch'); mocks.refresh.data = null; mount();
    expect(screen.getByRole('alert')).toHaveTextContent('Artifact provenance mismatch'); expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('shows the selected CI artifact findings in its trace', () => {
    mocks.runs.data = [{ id: 'ci', pr_number: 20, run_id: 'ci-run', findings_count: 1, finding_details: [{ id: 'original-model-id', severity: 'CRITICAL', title: 'SQL injection', file: 'lookup.ts', start_line: 8, end_line: 8, rationale: 'Request input changes SQL syntax', confidence: 1, category: 'security' }] }];
    mocks.refresh.error = null; mount();
    fireEvent.click(screen.getByRole('button', { name: 'View trace' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('SQL injection');
  });
});
