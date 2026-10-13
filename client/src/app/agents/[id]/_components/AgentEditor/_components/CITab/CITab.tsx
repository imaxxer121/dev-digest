"use client";
import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@devdigest/ui';
import type { Agent } from '@devdigest/shared';
import { useCiInstallations } from '@/lib/hooks/ci';
import { ExportToCI } from '@/components/ExportToCI';
import { CIRunsView } from '@/app/ci/_components/CIRunsView';
export function CITab({ agent }: { agent: Agent }) {
  const t = useTranslations('ci'), installations = useCiInstallations(agent.id), [open, setOpen] = React.useState(false);
  return <><div style={{ padding: '24px 28px 0' }}><Button kind="primary" icon="Workflow" onClick={() => setOpen(true)}>{t('addToCi')}</Button><p>{t('failOn')}: <strong>{agent.ci_fail_on}</strong> · {t('gateNotice')}</p>
    <h3>{t('installations')}</h3>{installations.data?.map(row => <div key={row.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}><strong>{row.repo}</strong> · {row.status} · v{row.workflow_version}<br />{row.runtime_provider}/{row.runtime_model} · {t('failOn')}: {row.fail_on}</div>)}</div><CIRunsView agentId={agent.id} />{open && <ExportToCI agent={agent} onClose={() => setOpen(false)} />}</>;
}
