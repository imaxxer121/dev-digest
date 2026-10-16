"use client";
import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, Markdown } from '@devdigest/ui';
import type { AttachedDocument } from '@/vendor/shared/contracts/project-context';
import { useContextDocument, useProjectContext } from '@/lib/hooks/project-context';

const control: React.CSSProperties = { padding: 9, border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-primary)', background: 'var(--bg-surface)' };

/** Search changes only the visible list. Selection/order remain independent. */
export function ContextBrowser({ repoId, attached, onChange, disabled = false }: {
  repoId: string | null; attached?: AttachedDocument[]; onChange?: (docs: AttachedDocument[]) => void; disabled?: boolean;
}) {
  const t = useTranslations('projectContext');
  const [search, setSearch] = React.useState(''), [selected, setSelected] = React.useState<string | null>(null);
  const docs = useProjectContext(repoId), preview = useContextDocument(repoId, selected);
  React.useEffect(() => { setSelected(null); setSearch(''); }, [repoId]);
  const all = docs.data?.documents ?? [];
  const ordered = attached ?? [];
  const visible = all.filter(doc => doc.path.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const current = ordered.filter(doc => doc.repo_id === repoId);
  const known = current.map(doc => all.find(item => item.path === doc.path));
  const estimate = known.reduce((sum, doc) => sum + (doc?.estimated_tokens ?? 0), 0);
  function toggle(path: string) {
    if (!repoId || !onChange) return;
    const exists = ordered.some(doc => doc.repo_id === repoId && doc.path === path);
    onChange(exists ? ordered.filter(doc => !(doc.repo_id === repoId && doc.path === path)) : [...ordered, { repo_id: repoId, path }]);
  }
  function move(index: number, step: number) { const next = [...ordered]; [next[index], next[index + step]] = [next[index + step]!, next[index]!]; onChange?.(next); }
  return <section style={{ display: 'grid', gap: 12 }} aria-label={t('title')}>
    <p>{t('limits')}</p>
    {onChange && <div>
      <p role="status">{t('selection', { count: ordered.length, estimate })} {known.some(doc => !doc) ? t('unknownEstimate') : ''}</p>
      <p>{t('estimateNotice')}</p>
      <ol aria-label={t('attached')} style={{ paddingLeft: 20 }}>
        {ordered.map((doc, index) => <li key={`${doc.repo_id}/${doc.path}`} style={{ marginBottom: 6, overflowWrap: 'anywhere' }}>
          <span>{doc.repo_id === repoId ? doc.path : `${doc.repo_id}: ${doc.path}`}</span>{' '}
          <Button size="sm" aria-label={t('up', { path: doc.path })} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</Button>{' '}
          <Button size="sm" aria-label={t('down', { path: doc.path })} disabled={disabled || index === ordered.length - 1} onClick={() => move(index, 1)}>↓</Button>{' '}
          <Button size="sm" disabled={disabled} onClick={() => onChange(ordered.filter((_, i) => index !== i))}>{t('detach')}</Button>
        </li>)}
      </ol>
    </div>}
    {!repoId ? <p>{t('chooseRepo')}</p> : <>
      <div style={{ display: 'flex', gap: 10 }}><input style={{ ...control, flex: 1 }} aria-label={t('search')} placeholder={t('search')} value={search} onChange={event => setSearch(event.target.value)} /><Button onClick={() => { docs.refetch(); if (selected) preview.refetch(); }}>{t('refresh')}</Button></div>
      {docs.isLoading && <p role="status">{t('loading')}</p>}
      {docs.isError && <p role="alert">{t('loadError')} <Button onClick={() => docs.refetch()}>{t('retry')}</Button></p>}
      {docs.data && <>
        <p role="status">{t('summary', { count: docs.data.summary.document_count, tokens: docs.data.summary.total_estimated_tokens })}</p>
        {docs.data.summary.state === 'unavailable' && <p>{t('unavailable')}</p>}
        {docs.data.summary.state === 'limited' && <p>{t('limited')} {docs.data.summary.reasons.join('; ')}</p>}
        {docs.data.summary.state === 'available' && !all.length && <p>{t('empty')}</p>}
        {all.length > 0 && !visible.length && <p>{t('noMatches')}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(0, 2fr)', minHeight: 200, gap: 16 }}>
          <ul aria-label={t('documents')} style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 520, overflow: 'auto' }}>
            {visible.map(doc => { const checked = ordered.some(item => item.repo_id === repoId && item.path === doc.path); return <li key={doc.path} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
              <button type="button" aria-pressed={selected === doc.path} onClick={() => setSelected(doc.path)} style={{ ...control, width: '100%', textAlign: 'left', cursor: 'pointer', overflowWrap: 'anywhere' }}>{doc.path}<br /><small>{doc.kind} · {t('tokens', { count: doc.estimated_tokens })} · {doc.bytes} B<br />{doc.estimate_method}</small></button>
              {onChange && <label style={{ display: 'block', padding: 6 }}><input type="checkbox" aria-label={t('attachPath', { path: doc.path })} disabled={disabled || (!checked && ordered.length >= 64)} checked={checked} onChange={() => toggle(doc.path)} /> {t('attach')}</label>}
            </li>; })}
          </ul>
          <article aria-label={t('preview')} style={{ border: '1px solid var(--border)', padding: 16, maxHeight: 520, overflow: 'auto', overflowWrap: 'anywhere' }}>
            {!selected && <p>{t('selectPreview')}</p>}
            {selected && preview.isLoading && <p>{t('loading')}</p>}
            {selected && preview.isError && <p role="alert">{t('previewError')}</p>}
            {selected && preview.data && <><strong>{preview.data.path}</strong><p>{t('readOnly')}</p><Markdown>{preview.data.content}</Markdown></>}
          </article>
        </div>
      </>}
    </>}
  </section>;
}
