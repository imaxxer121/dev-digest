import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'saved-agent' }),
  useSearchParams: () => new URLSearchParams('tab=ci'),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('../../../components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../../lib/hooks/agents', () => ({
  useAgents: () => ({ data: [] }),
  useAgent: () => ({ data: { id: 'saved-agent', name: 'Saved reviewer', provider: 'codex', model: 'test', enabled: true } }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
}));
vi.mock('./_components/AgentEditor', () => ({
  AgentEditor: ({ tab }: { tab: string }) => <div>Selected editor: {tab}</div>,
}));

import AgentEditorPage from './page';
afterEach(cleanup);
describe('Saved agent tab routing', () => {
  it('opens the CI editor from its persisted URL instead of falling back to Config', () => {
    render(<AgentEditorPage />);
    expect(screen.getByText('Selected editor: ci')).toBeInTheDocument();
  });
});
