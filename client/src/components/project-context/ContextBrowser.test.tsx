import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../messages/en/projectContext.json';
import { ContextBrowser } from './ContextBrowser';
import { activeKeyFor } from '../app-shell/helpers';
import { NAV } from '@/vendor/ui/nav';
const mocks = vi.hoisted(() => ({ list: {} as any, preview: {} as any }));
vi.mock('@/lib/hooks/project-context', () => ({ useProjectContext: () => mocks.list, useContextDocument: () => mocks.preview }));
const docs = [{ path: 'docs/a.md', kind: 'docs', bytes: 12, estimated_tokens: 3, estimate_method: 'ceil(Unicode code points / 4)' }, { path: 'nested/specs/b.md', kind: 'specs', bytes: 20, estimated_tokens: 5, estimate_method: 'ceil(Unicode code points / 4)' }];
function mount(element = <ContextBrowser repoId="repo-a" />) { return render(<NextIntlClientProvider locale="en" messages={{ projectContext: messages }}>{element}</NextIntlClientProvider>); }
beforeEach(() => {
  mocks.list = { data: { documents: docs, summary: { state: 'available', document_count: 2, total_estimated_tokens: 8, reasons: [] } }, isLoading: false, isError: false, refetch: vi.fn() };
  mocks.preview = { data: { path: 'docs/a.md', content: '# Safe preview\n<script>alert(1)</script>\n[x](javascript:alert(1))' }, isLoading: false, isError: false, refetch: vi.fn() };
});
describe('Project Context discovery and selection', () => {
  it('sidebar route resolves to Context and safe read-only preview/search has kind and estimates', () => {
    expect(NAV.flatMap(group => group.items).find(item => item.key === 'context')?.href).toBe('/repos/:repoId/project-context');
    expect(activeKeyFor('/repos/repo-a/project-context')).toBe('context');
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: /docs\/a.md/ }));
    expect(screen.getByText('Safe preview')).toBeInTheDocument(); expect(view.container.querySelector('script')).toBeNull();
    expect(screen.getByText('x').closest('a')).not.toHaveAttribute('href', 'javascript:alert(1)');
    fireEvent.change(screen.getByLabelText('Search filename or path'), { target: { value: 'nested' } });
    expect(screen.queryByRole('button', { name: /docs\/a.md/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nested\/specs\/b.md/ })).toHaveTextContent('specs');
  });
  it('preserves selection through search; attach/detach and order changes retain repository identity', () => {
    const change = vi.fn(); const selected = [{ repo_id: 'repo-a', path: 'docs/a.md' }, { repo_id: 'repo-b', path: 'docs/a.md' }];
    const view = mount(<ContextBrowser repoId="repo-a" attached={selected} onChange={change} />);
    fireEvent.change(screen.getByLabelText('Search filename or path'), { target: { value: 'missing' } });
    expect(screen.getByLabelText('Attached documents in review order')).toHaveTextContent('repo-b: docs/a.md');
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Search filename or path'), { target: { value: 'nested' } });
    fireEvent.click(screen.getByLabelText('Attach nested/specs/b.md'));
    expect(change).toHaveBeenLastCalledWith([...selected, { repo_id: 'repo-a', path: 'nested/specs/b.md' }]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Move docs/a.md up' })[1]!);
    expect(change).toHaveBeenLastCalledWith([selected[1], selected[0]]);
    view.rerender(<NextIntlClientProvider locale="en" messages={{ projectContext: messages }}><ContextBrowser repoId="repo-a" attached={[selected[1]!, selected[0]!]} onChange={change} /></NextIntlClientProvider>);
    expect(screen.getByLabelText('Attached documents in review order').firstElementChild).toHaveTextContent('repo-b');
    fireEvent.click(screen.getAllByRole('button', { name: 'Detach' })[0]!); expect(change).toHaveBeenLastCalledWith([selected[0]]);
  });
  it('distinguishes loading, error, unavailable, partial and empty scans', () => {
    mocks.list = { isLoading: true }; const view = mount(); expect(screen.getByText('Loading documents…')).toBeInTheDocument();
    mocks.list = { isError: true }; view.rerender(<NextIntlClientProvider locale="en" messages={{ projectContext: messages }}><ContextBrowser repoId="repo-a" /></NextIntlClientProvider>); expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
    for (const [state, message] of [['unavailable', 'Repository clone unavailable'], ['limited', 'Partial scan.'], ['available', 'No markdown documents found']]) {
      mocks.list = { data: { documents: [], summary: { state, document_count: 0, total_estimated_tokens: 0, reasons: [] } } };
      view.rerender(<NextIntlClientProvider locale="en" messages={{ projectContext: messages }}><ContextBrowser repoId="repo-a" /></NextIntlClientProvider>);
      expect(screen.getByText(new RegExp(message!))).toBeInTheDocument();
    }
  });
});
