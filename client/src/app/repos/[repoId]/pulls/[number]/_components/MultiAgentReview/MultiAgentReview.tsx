"use client";
import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, LiveLogStream, Markdown } from '@devdigest/ui';
import type { FindingRecord, MultiAgentMember, MultiAgentReviewRecord } from '@devdigest/shared';
import { useMultiAgentReviews } from '@/lib/hooks/multi-agent';
import { useCancelRun, useFindingAction, useRunEvents } from '@/lib/hooks/reviews';
import { useRunTrace } from '@/lib/hooks/trace';
import { FindingCard } from '../FindingCard';

const panel: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg-elevated)', padding: 14 };
const stack: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
type Props = { prId: string; repoFullName?: string | null; headSha?: string | null; onOpenTrace: (id: string) => void };

function AttributedFinding({ finding, prId, repoFullName, headSha }: Omit<Props, 'onOpenTrace'> & { finding: FindingRecord }) {
  const action = useFindingAction();
  const t = useTranslations('multiAgent');
  const [learned, setLearned] = React.useState(false);
  return <div>
    <FindingCard f={finding} showSeverityLabel onAction={kind => action.mutate({ findingId: finding.id, action: kind, prId })}
      pending={action.isPending} repoFullName={repoFullName} headSha={headSha} />
    <div style={{ marginTop: 6 }}><Button kind="ghost" size="sm" disabled={action.isPending || learned}
      onClick={() => action.mutate({ findingId: finding.id, action: 'learn', prId }, { onSuccess: () => setLearned(true) })}>
      {learned ? t('learned') : action.isPending && action.variables?.action === 'learn' ? t('learning') : t('learn')}
    </Button></div>
    {action.error && <p role="alert">{action.error.message}</p>}
  </div>;
}

function AgentResult({ member, ...props }: Props & { member: MultiAgentMember }) {
  const t = useTranslations('multiAgent');
  const events = useRunEvents(member.status === 'running' ? [member.run_id] : []);
  const trace = useRunTrace(member.run_id, member.status !== 'running' && member.status !== 'deleted');
  const cancel = useCancelRun();
  const log = member.status === 'running' ? events.events.map(e => ({ t: e.t, k: e.kind, m: e.msg }))
    : (trace.data?.log ?? []).map(e => ({ t: e.t, k: e.kind, m: e.msg }));
  return <article aria-label={member.agent_name} style={{ ...panel, ...stack, minWidth: 250, borderTop: '3px solid var(--accent)' }}>
    <div><strong>{member.agent_name}</strong><div role="status" style={{ color: member.status === 'failed' ? 'var(--crit)' : 'var(--text-secondary)', marginTop: 5 }}>{t(member.status)}</div></div>
    <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
      {t('duration')}: {member.duration_ms == null ? t('unknown') : `${(member.duration_ms / 1000).toFixed(1)}s`} · {t('cost')}: {member.cost_usd == null ? t('unknown') : `$${member.cost_usd.toFixed(4)}`}
      <div>{member.tokens_in ?? '—'} in / {member.tokens_out ?? '—'} out tokens</div>
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button kind="secondary" size="sm" disabled={member.status === 'deleted'} onClick={() => props.onOpenTrace(member.run_id)}>{t('trace')}</Button>
      {member.status === 'running' && <Button kind="danger" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate(member.run_id)}>{t('cancel')}</Button>}
    </div>
    {member.error && <p role="alert" style={{ color: 'var(--crit)', overflowWrap: 'anywhere' }}>{member.error}</p>}
    {cancel.error && <p role="alert">{cancel.error.message}</p>}
    <LiveLogStream log={log} running={member.status === 'running'} height={150} />
    {member.review?.summary && <Markdown>{member.review.summary}</Markdown>}
    {member.review && <div style={{ color: 'var(--text-secondary)' }}>{member.review.verdict} · score {member.review.score ?? '—'}</div>}
    {(member.review?.findings ?? []).map(f => <AttributedFinding key={f.id} finding={f} {...props} />)}
    {!member.review?.findings.length && <p style={{ color: 'var(--text-muted)' }}>{member.status === 'done' && member.review ? t('noFindings') : t('noConclusion')}</p>}
  </article>;
}

export function MultiAgentResults({ group, ...props }: Props & { group: MultiAgentReviewRecord }) {
  const t = useTranslations('multiAgent');
  const [mode, setMode] = React.useState<'columns' | 'tabs'>('columns');
  const [selected, setSelected] = React.useState(group.members[0]?.run_id ?? '');
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const current = group.members.find(m => m.run_id === selected) ?? group.members[0];
  const shown = group.groups.filter(g => !onlyConflicts || g.conflict);
  return <section style={stack} aria-label={t('title')}>
    <div style={{ display: 'flex', gap: 8 }}><Button kind="secondary" size="sm" active={mode === 'columns'} onClick={() => setMode('columns')}>{t('columns')}</Button>
      <Button kind="secondary" size="sm" active={mode === 'tabs'} onClick={() => setMode('tabs')}>{t('tabs')}</Button></div>
    {mode === 'columns' ? <div style={{ display: 'grid', gridTemplateColumns: `repeat(${group.members.length}, minmax(250px, 1fr))`, gap: 12, overflowX: 'auto' }}>
      {group.members.map(m => <AgentResult key={m.run_id} member={m} {...props} />)}
    </div> : <><div role="tablist" aria-label={t('agents')} style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
      {group.members.map(m => <button type="button" role="tab" aria-selected={current?.run_id === m.run_id} key={m.run_id}
        onClick={() => setSelected(m.run_id)} style={{ ...panel, cursor: 'pointer', color: 'var(--text-primary)' }}>{m.agent_name} · {t(m.status)}</button>)}
    </div>{current && <div role="tabpanel"><AgentResult key={current.run_id} member={current} {...props} /></div>}</>}
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><h3>{t('disagreement')}</h3>
      <label><input type="checkbox" checked={onlyConflicts} onChange={e => setOnlyConflicts(e.target.checked)} /> {t('conflictsOnly')}</label></div>
    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('grouping')}</p>
    {shown.length === 0 && <p>{t('noConflicts')}</p>}
    {shown.map(g => <article key={g.id} style={{ ...panel, ...stack }}>
      <strong>{g.file}:{g.start_line}–{g.end_line} · {g.title}</strong>
      {g.severity_disagreement && <span style={{ color: 'var(--warn)' }}>{t('severityDisagreement')}</span>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${g.takes.length}, minmax(200px, 1fr))`, gap: 12, overflowX: 'auto' }}>
        {g.takes.map(take => <div key={take.run_id} style={stack}><strong>{take.agent_name}</strong>
          <span>{take.conclusion === 'unknown' ? t('unknownConclusion') : t(take.conclusion)}</span>
          {take.findings.map(f => <AttributedFinding key={f.id} finding={f} {...props} />)}
        </div>)}
      </div>
    </article>)}
  </section>;
}

export function MultiAgentReview(props: Props) {
  const t = useTranslations('multiAgent');
  const query = useMultiAgentReviews(props.prId);
  const [selectedId, setSelectedId] = React.useState('');
  const groups = query.data?.groups ?? [];
  const group = groups.find(g => g.id === selectedId) ?? groups[0];
  if (query.isLoading) return <p role="status">{t('loading')}</p>;
  if (query.error) return <div role="alert">{query.error.message} <Button kind="secondary" onClick={() => void query.refetch()}>{t('retry')}</Button></div>;
  if (!group) return <p>{t('empty')}</p>;
  return <div style={stack}><label>{t('history')} <select aria-label={t('history')} value={group.id} onChange={e => setSelectedId(e.target.value)}
    style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', padding: 8, border: '1px solid var(--border)' }}>
    {groups.map(g => <option key={g.id} value={g.id}>{new Date(g.ran_at).toLocaleString()} · {g.members.map(m => m.agent_name).join(', ')}</option>)}
  </select></label><MultiAgentResults key={group.id} group={group} {...props} /></div>;
}
