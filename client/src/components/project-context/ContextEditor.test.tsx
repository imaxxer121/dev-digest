import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../messages/en/projectContext.json';
import { ContextEditor } from './ContextEditor';
const mocks = vi.hoisted(() => ({ agent: vi.fn(), skill: vi.fn() }));
vi.mock('@/lib/hooks/core', () => ({ useRepos: () => ({ data: [{ id: 'repo-a', full_name: 'acme/a' }, { id: 'repo-b', full_name: 'acme/b' }] }) }));
vi.mock('@/lib/hooks/agents', () => ({ useUpdateAgent: () => ({ mutateAsync: mocks.agent, isPending: false }) }));
vi.mock('@/lib/hooks/skills', () => ({ useUpdateSkill: () => ({ mutateAsync: mocks.skill, isPending: false }) }));
vi.mock('./ContextBrowser', () => ({ ContextBrowser: ({ repoId, attached, onChange }: any) => <div><span>{repoId}</span><span>{JSON.stringify(attached)}</span><button onClick={() => onChange([...attached, { repo_id: repoId, path: 'docs/a.md' }])}>Attach fixture</button></div> }));
beforeEach(() => { mocks.agent.mockReset(); mocks.skill.mockReset(); });
function mount(kind: 'agent' | 'skill') { return render(<NextIntlClientProvider locale="en" messages={{ projectContext: messages }}><ContextEditor id="owner" kind={kind} attachedDocs={[]} /></NextIntlClientProvider>); }
describe('Agent and Skill Context tabs', () => {
  it.each(['agent', 'skill'] as const)('saves %s repository-qualified paths explicitly and discloses inheritance/local CI limits', async kind => {
    mount(kind); expect(mocks.agent).not.toHaveBeenCalled(); expect(mocks.skill).not.toHaveBeenCalled();
    expect(screen.getByText(/CI does not receive this local context/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'repo-b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach fixture' })); fireEvent.click(screen.getByRole('button', { name: 'Save context' }));
    await waitFor(() => expect(mocks[kind]).toHaveBeenCalledWith({ id: 'owner', patch: { attached_docs: [{ repo_id: 'repo-b', path: 'docs/a.md' }] } }));
    expect(await screen.findByText('Context saved. Body and config versions are unchanged.')).toBeInTheDocument();
  });
  it('retains unsaved selection and shows retryable save error', async () => {
    mocks.agent.mockRejectedValueOnce(new Error('Missing doc')); mount('agent');
    fireEvent.click(screen.getByRole('button', { name: 'Attach fixture' })); fireEvent.click(screen.getByRole('button', { name: 'Save context' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your selection is retained');
    expect(screen.getByText(/"path":"docs\/a.md"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save context' })); expect(await screen.findByText(/Context saved/)).toBeInTheDocument();
  });
});
