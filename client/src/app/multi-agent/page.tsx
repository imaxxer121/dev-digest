"use client";
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@devdigest/ui';
import { AppShell } from '@/components/app-shell';
import { useActiveRepo } from '@/lib/repo-context';
import { usePulls, usePullDetail } from '@/lib/hooks/core';
import { useAgents } from '@/lib/hooks/agents';
import { usePrRuns, useRunReview } from '@/lib/hooks/reviews';
import { useMultiAgentReviews } from '@/lib/hooks/multi-agent';
import { ConfigureRun } from './_components/ConfigureRun';
import { MultiAgentReview } from '../repos/[repoId]/pulls/[number]/_components/MultiAgentReview';
import RunTraceDrawer from '../repos/[repoId]/pulls/[number]/_components/RunTraceDrawer';

export default function MultiAgentPage() {
  const t = useTranslations('multiAgent'), search = useSearchParams(), router = useRouter();
  const { repoId, activeRepo } = useActiveRepo();
  const pulls = usePulls(repoId), agents = useAgents(), run = useRunReview();
  const wanted = search.get('prId') ?? '';
  const prId = pulls.data?.find(p => p.id === wanted)?.id ?? '';
  const runs = usePrRuns(prId), detail = usePullDetail(prId);
  const comparison = useMultiAgentReviews(prId);
  const [phase, setPhase] = React.useState<'configure' | 'results'>('configure');
  const [traceId, setTraceId] = React.useState<string | null>(null);
  const traceMember = comparison.data?.groups.flatMap(g => g.members).find(m => m.run_id === traceId);
  React.useEffect(() => { setPhase('configure'); setTraceId(null); }, [repoId, prId]);
  const select = (id: string) => router.replace(`/multi-agent${id ? `?prId=${encodeURIComponent(id)}` : ''}`);
  return <AppShell crumb={[{ label: t('title') }, { label: phase === 'configure' ? t('configure') : detail.data ? `#${detail.data.number}` : t('title') }]}>
    <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!repoId ? <p>{t('selectRepo')}</p> : <>
        {(pulls.isLoading || agents.isLoading) && <p role="status">{t('loading')}</p>}
        {(pulls.error || agents.error) && <div role="alert">{pulls.error?.message || agents.error?.message}<Button kind="secondary" onClick={() => { void pulls.refetch(); void agents.refetch(); }}>{t('retry')}</Button></div>}
        {phase === 'configure' ? <>
          <ConfigureRun pulls={pulls.data ?? []} prId={prId} agents={agents.data ?? []} runs={runs.data ?? []}
            pending={run.isPending} error={run.error} onSelectPr={select} onRun={async ids => { await run.mutateAsync({ prId, agentIds: ids }); setPhase('results'); }} />
          {prId && <Button kind="secondary" onClick={() => setPhase('results')}>{t('history')}</Button>}
        </> : prId && <><Button kind="secondary" onClick={() => setPhase('configure')}>{t('configure')}</Button>
          <MultiAgentReview key={prId} prId={prId} repoFullName={activeRepo?.full_name} headSha={detail.data?.head_sha} onOpenTrace={setTraceId} /></>}
      </>}
    </div>
    {traceId && <RunTraceDrawer key={traceId} runId={traceId} prNumber={detail.data?.number ?? 0}
      findings={traceMember?.review?.findings ?? []} agentName={traceMember?.agent_name ?? null}
      running={traceMember?.status === 'running'} onClose={() => setTraceId(null)} />}
  </AppShell>;
}
