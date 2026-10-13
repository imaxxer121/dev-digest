"use client";
import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@devdigest/ui';
import { useCiRuns, useCiInstallations, useCiRefresh } from '@/lib/hooks/ci';
import { CIRunsTable } from '@/components/CIRunsTable';
export function CIRunsView({ agentId }: { agentId?: string }) {
  const t = useTranslations('ci'), runs = useCiRuns(agentId), installations = useCiInstallations(agentId), refresh = useCiRefresh();
  const [installationId, setInstallationId] = React.useState(''), [runId, setRunId] = React.useState(''), [filter, setFilter] = React.useState('all');
  const current = installationId || installations.data?.[0]?.id || '';
  return <div style={{ padding: 28 }}><h1>{t('runsTitle')}</h1><p style={{ color: 'var(--text-secondary)' }}>{t('runsDescription')}</p>
    <section style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, margin: '18px 0' }}><h3>{t('refreshTitle')}</h3><p>{t('refreshDescription')}</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><label>{t('installation')} <select value={current} onChange={e => setInstallationId(e.target.value)}>{installations.data?.map(value => <option value={value.id} key={value.id}>{value.repo} · {value.runtime_provider}/{value.runtime_model} · {value.status}</option>)}</select></label><label>{t('githubRunId')} <input aria-label={t('githubRunId')} type="number" min="1" value={runId} onChange={e => setRunId(e.target.value)} /></label><Button onClick={() => refresh.mutate({ installation_id: current, run_id: Number(runId) })} loading={refresh.isPending} disabled={!current || !Number.isSafeInteger(Number(runId)) || Number(runId) <= 0 || refresh.isPending}>{t('refresh')}</Button><Button onClick={() => runs.refetch()}>{t('reload')}</Button></div>
      {refresh.error && <p role="alert" style={{ color: 'var(--crit)' }}>{refresh.error.message}</p>}{refresh.data && <p role="status">{refresh.data.created ? t('ingested') : t('alreadyIngested')}</p>}
    </section>
    {runs.error && <p role="alert">{runs.error.message}</p>}{installations.error && <p role="alert">{installations.error.message}</p>}{runs.isLoading ? <p>{t('loading')}</p> : <><label>{t('statusFilter')} <select value={filter} onChange={e => setFilter(e.target.value)}>{['all', 'failed', 'succeeded', 'no_findings'].map(value => <option key={value}>{value}</option>)}</select></label><div style={{ marginTop: 14 }}><CIRunsTable runs={(runs.data ?? []).filter(run => filter === 'all' || run.status === filter)} /></div></>}
    {!installations.data?.length && <p><Link href="/agents">{t('setup')}</Link></p>}
  </div>;
}
