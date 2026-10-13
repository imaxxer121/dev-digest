"use client";
import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@devdigest/ui';
import type { Agent, PrMeta, RunSummary } from '@devdigest/shared';

export function historicalEstimate(runs: RunSummary[], agentId: string) {
  const measured = runs.filter(r => r.agent_id === agentId && r.status === 'done');
  const times = measured.map(r => r.duration_ms);
  const costs = measured.map(r => r.cost_usd);
  return { count: measured.length,
    duration: times.length && times.every((v): v is number => v !== null) ? times.reduce((a, b) => a + b, 0) / times.length : null,
    cost: costs.length && costs.every((v): v is number => v !== null) ? costs.reduce((a, b) => a + b, 0) / costs.length : null };
}

export function ConfigureRun({ pulls, prId, agents, runs, pending, error, onSelectPr, onRun }: {
  pulls: PrMeta[]; prId: string; agents: Agent[]; runs: RunSummary[]; pending: boolean; error?: Error | null;
  onSelectPr: (id: string) => void; onRun: (ids: string[]) => Promise<void>;
}) {
  const t = useTranslations('multiAgent');
  const [selected, setSelected] = React.useState<string[]>([]);
  const enabled = agents.filter(a => a.enabled);
  const valid = selected.filter(id => enabled.some(a => a.id === id));
  return <section style={{ maxWidth: 740, display: 'flex', flexDirection: 'column', gap: 16 }}>
    <h1>{t('configure')}</h1><p style={{ color: 'var(--text-secondary)' }}>{t('intro')}</p>
    <label>{t('pull')} <select aria-label={t('pull')} value={prId} disabled={pending} onChange={e => onSelectPr(e.target.value)}
      style={{ display: 'block', width: '100%', marginTop: 8, padding: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <option value="">{t('choosePull')}</option>{pulls.filter(pr => pr.id).map(pr => <option key={pr.id} value={pr.id ?? ''}>#{pr.number} · {pr.title}</option>)}
    </select></label>
    <fieldset disabled={!prId || pending} style={{ border: 0, margin: 0, padding: 0 }}><legend>{t('agents')}</legend>
      <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('limit')} {t('versionWarning')}</p>
      {enabled.map(agent => {
        const estimate = historicalEstimate(runs, agent.id), checked = valid.includes(agent.id);
        return <label key={agent.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 8, padding: 14,
          border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 9, background: checked ? 'var(--accent-bg)' : 'var(--bg-elevated)' }}>
          <input type="checkbox" aria-label={agent.name} checked={checked} disabled={!checked && valid.length >= 5}
            onChange={() => setSelected(ids => checked ? ids.filter(id => id !== agent.id) : [...ids, agent.id])} />
          <span style={{ flex: 1 }}><strong>{agent.name}</strong><span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{agent.description || `${agent.provider} / ${agent.model}`}</span></span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('historical')}: {estimate.duration == null ? t('unknown') : `${(estimate.duration / 1000).toFixed(1)}s`} · {estimate.cost == null ? t('unknown') : `$${estimate.cost.toFixed(4)}`}<span style={{ display: 'block' }}>{t('samples', { count: estimate.count })}</span></span>
        </label>;
      })}
    </fieldset>
    <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('estimates')}</p>
    {error && <div role="alert">{t('runError')} {error.message}</div>}
    <Button kind="primary" icon="Users" loading={pending} disabled={!prId || valid.length < 1 || valid.length > 5 || pending}
      onClick={() => void onRun(valid).catch(() => undefined)}>{t('run', { count: valid.length })}</Button>
  </section>;
}
