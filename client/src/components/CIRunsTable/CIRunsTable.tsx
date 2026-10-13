"use client";
import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@devdigest/ui';
import type { CiRun } from '@/vendor/shared/contracts/eval-ci';
import RunTraceDrawer from '@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer';
export function CIRunsTable({ runs }: { runs: CiRun[] }) {
  const t = useTranslations('ci'), [traceId, setTraceId] = React.useState<string>();
  if (!runs.length) return <div style={{ padding: 36, border: '1px dashed var(--border)', borderRadius: 10 }}><h3>{t('empty')}</h3><p>{t('emptyBody')}</p></div>;
  return <><div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}><table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-elevated)', fontSize: 12 }}>
    <thead style={{ background: 'var(--bg-surface)', textAlign: 'left' }}><tr>{['timestamp', 'pullRequest', 'agent', 'runtime', 'duration', 'findings', 'cost', 'verdict', 'job'].map(key => <th key={key} style={{ padding: 12 }}>{t(key)}</th>)}</tr></thead>
    <tbody>{runs.map(run => <tr key={run.id} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: 12 }}>{run.ran_at ? new Date(run.ran_at).toLocaleString() : '—'}</td><td>{run.repo}<br />#{run.pr_number}<br /><span style={{ color: 'var(--text-muted)' }}>{run.head_sha?.slice(0, 8)}</span></td><td>{run.agent}<br />v{run.workflow_version}</td><td>{run.provider}/{run.model}</td><td>{run.duration_s == null ? '—' : `${run.duration_s.toFixed(1)}s`}<br />{run.tokens_in ?? '—'} / {run.tokens_out ?? '—'} {t('tokens')}</td><td>{run.findings_count ?? '—'}</td><td>{run.cost_usd == null ? t('unpriced') : `$${run.cost_usd.toFixed(4)}`}</td><td style={{ color: run.verdict === 'request_changes' ? 'var(--crit)' : 'var(--ok)' }}>{run.verdict?.replace('_', ' ')}<br /><span style={{ color: 'var(--text-muted)' }}>{run.status}</span></td><td>{run.github_url && <a href={run.github_url} target="_blank" rel="noreferrer">{t('viewJob')}</a>}<br />{run.run_id && <Button size="sm" onClick={() => setTraceId(run.run_id!)}>{t('trace')}</Button>}</td></tr>)}</tbody>
  </table></div>{traceId && <RunTraceDrawer runId={traceId} agentName={runs.find(run => run.run_id === traceId)?.agent} prNumber={runs.find(run => run.run_id === traceId)?.pr_number} onClose={() => setTraceId(undefined)} />}</>;
}
