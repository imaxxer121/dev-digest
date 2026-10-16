import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { Agent } from '@devdigest/shared';
import messages from '../../../messages/en/ci.json';
import { ExportToCI } from './ExportToCI';
const mocks = vi.hoisted(() => ({ preview: { data: undefined as unknown, isPending: false, mutateAsync: vi.fn() }, install: { data: undefined, isPending: false, mutateAsync: vi.fn() }, zip: { isPending: false, mutateAsync: vi.fn() } }));
vi.mock('@/lib/hooks/ci', () => ({ useCiPreview: () => mocks.preview, useCiExport: () => mocks.install, useCiZip: () => mocks.zip }));
const agent = { id: 'a', name: 'Studio agent', provider: 'codex', model: 'studio-model', ci_fail_on: 'critical' } as Agent;
function mount() { return render(<NextIntlClientProvider locale="en" messages={{ ci: messages }}><ExportToCI agent={agent} onClose={vi.fn()} /></NextIntlClientProvider>); }
beforeEach(() => {
  mocks.preview.data = undefined; mocks.preview.mutateAsync.mockReset(); mocks.zip.mutateAsync.mockReset(); mocks.install.mutateAsync.mockReset();
  mocks.preview.mutateAsync.mockImplementation(async ({ input }) => {
    const value = { files: [{ path: '.github/workflows/devdigest-review.yml', contents: `name: DevDigest Review\npost_as: ${input.post_as}\n`, editable: true }, { path: '.devdigest/agents/fixture.yaml', contents: 'Fixture config' }], manifest: {} };
    mocks.preview.data = value; return value;
  });
});
async function preview() { fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'fixture/ci' } }); fireEvent.click(screen.getByRole('button', { name: 'Continue' })); await screen.findByLabelText('Workflow preview'); }
async function install() { await preview(); fireEvent.click(screen.getByRole('button', { name: 'Continue' })); fireEvent.click(screen.getByRole('button', { name: 'Continue' })); await screen.findByRole('button', { name: 'Download ZIP' }); }
describe('four-step CI export interactions', () => {
  it('discloses the actual CI override and performs no export on mount', () => {
    mount(); expect(screen.getByText(/Studio: codex\/studio-model. CI: ollama\/qwen2.5-coder:7b-instruct/)).toBeInTheDocument();
    expect(screen.getByText(/Local filesystem attachments from agents and enabled Skills are not exported/)).toBeInTheDocument();
    expect(mocks.preview.mutateAsync).not.toHaveBeenCalled(); expect(mocks.install.mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText('Jenkins')).not.toBeInTheDocument();
  });
  it('retains safe workflow edits across changed publication settings and exports only explicitly', async () => {
    mount(); await preview();
    fireEvent.change(screen.getByLabelText('Workflow preview'), { target: { value: 'name: My review\npost_as: pr_comment\n# saved note\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); fireEvent.change(screen.getByLabelText('Post results as'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); await screen.findByRole('button', { name: 'Download ZIP' });
    expect(mocks.zip.mutateAsync).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Download ZIP' }));
    await waitFor(() => expect(mocks.zip.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.zip.mutateAsync.mock.calls[0]![0].input).toMatchObject({ post_as: 'none', workflow: 'name: My review\npost_as: none\n# saved note\n' });
    expect(await screen.findByRole('status')).toHaveTextContent('Installation becomes verified');
  });
  it('keeps the target and shows preview error with a usable retry', async () => {
    mocks.preview.mutateAsync.mockRejectedValueOnce(new Error('Target not imported')); mount();
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'fixture/ci' } }); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Target not imported'); expect(screen.getByLabelText('Repository')).toHaveValue('fixture/ci');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); expect(await screen.findByLabelText('Workflow preview')).toBeInTheDocument();
  });
  it('does not claim installation or download after a failed action', async () => {
    mocks.zip.mutateAsync.mockRejectedValue(new Error('ZIP unavailable')); mount(); await install(); fireEvent.click(screen.getByRole('button', { name: 'Download ZIP' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ZIP unavailable'); expect(screen.queryByRole('status')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Download ZIP' })).not.toBeDisabled();
  });
});
