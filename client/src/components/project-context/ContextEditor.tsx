"use client";
import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@devdigest/ui';
import type { AttachedDocument } from '@/vendor/shared/contracts/project-context';
import { useRepos } from '@/lib/hooks/core';
import { useUpdateAgent } from '@/lib/hooks/agents';
import { useUpdateSkill } from '@/lib/hooks/skills';
import { ContextBrowser } from './ContextBrowser';
const EMPTY_DOCS: AttachedDocument[] = [];

export function ContextEditor({ id, kind, attachedDocs = EMPTY_DOCS }: { id: string; kind: 'agent' | 'skill'; attachedDocs?: AttachedDocument[] }) {
  const t = useTranslations('projectContext'), repos = useRepos();
  const agent = useUpdateAgent(), skill = useUpdateSkill();
  const [repoId, setRepoId] = React.useState(''), [docs, setDocs] = React.useState(attachedDocs);
  const [error, setError] = React.useState(false), [saved, setSaved] = React.useState(false);
  React.useEffect(() => { setDocs(attachedDocs); }, [id, attachedDocs]);
  React.useEffect(() => { if (!repoId && repos.data?.length) setRepoId(repos.data[0]!.id); }, [repos.data, repoId]);
  const busy = agent.isPending || skill.isPending;
  async function save() {
    setError(false); setSaved(false);
    try { await (kind === 'agent' ? agent : skill).mutateAsync({ id, patch: { attached_docs: docs } }); setSaved(true); }
    catch { setError(true); }
  }
  return <div style={{ display: 'grid', gap: 12 }}>
    <p>{t(kind === 'skill' ? 'skillInheritance' : 'agentInheritance')}</p>
    <p>{t('localOnly')}</p>
    {repos.isError && <p role="alert">{t('repoError')}</p>}
    <label>{t('repository')} <select aria-label={t('repository')} value={repoId} onChange={event => setRepoId(event.target.value)} style={{ padding: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}><option value="">{t('chooseRepo')}</option>{repos.data?.map(repo => <option key={repo.id} value={repo.id}>{repo.full_name}</option>)}</select></label>
    <ContextBrowser repoId={repoId || null} attached={docs} onChange={next => { setDocs(next); setSaved(false); }} disabled={busy} />
    <div><Button kind="primary" onClick={save} disabled={busy || docs.length > 64} loading={busy}>{t('save')}</Button></div>
    {error && <p role="alert">{t('saveError')}</p>}{saved && <p role="status">{t('saved')}</p>}
  </div>;
}
