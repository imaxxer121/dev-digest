"use client";
import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, ExportWizardSteps } from '@devdigest/ui';
import type { Agent } from '@devdigest/shared';
import type { CiExportInputBody } from '@/vendor/shared/contracts/eval-ci';
import { useCiPreview, useCiExport, useCiZip } from '@/lib/hooks/ci';

export function ExportToCI({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useTranslations('ci');
  const [step, setStep] = React.useState(0), [repo, setRepo] = React.useState(''), [base, setBase] = React.useState('main');
  const [runtime, setRuntime] = React.useState<'ollama' | 'openrouter'>(agent.provider === 'openrouter' ? 'openrouter' : 'ollama');
  const [model, setModel] = React.useState(agent.provider === 'openrouter' ? agent.model : 'qwen2.5-coder:7b-instruct');
  const [triggers, setTriggers] = React.useState<Array<'opened' | 'synchronize' | 'reopened'>>(['opened', 'synchronize']);
  const [postAs, setPostAs] = React.useState<'github_review' | 'pr_comment' | 'none'>('pr_comment');
  const [failOn, setFailOn] = React.useState(agent.ci_fail_on), [selected, setSelected] = React.useState('.github/workflows/devdigest-review.yml');
  const [workflow, setWorkflow] = React.useState<string>(), [error, setError] = React.useState<string>(), [done, setDone] = React.useState(false);
  const preview = useCiPreview(), install = useCiExport(), zip = useCiZip();
  const dialog = React.useRef<HTMLElement>(null), safeEdits = React.useRef<{ title?: string; comments: string[] }>({ comments: [] });
  React.useEffect(() => { const prior = document.activeElement as HTMLElement | null; dialog.current?.querySelector<HTMLElement>('input, button')?.focus(); return () => prior?.focus(); }, []);
  const input = (): CiExportInputBody => ({ repo, base, target: 'gha', runtime: { provider: runtime, model }, triggers, post_as: postAs, ci_fail_on: failOn, workflow });
  const busy = preview.isPending || install.isPending || zip.isPending;
  async function next() {
    setError(undefined);
    try {
      if (step === 0 || step === 2) {
        const value = await preview.mutateAsync({ agentId: agent.id, input: input() });
        let text = value.files.find(file => file.path === '.github/workflows/devdigest-review.yml')?.contents;
        if (workflow === undefined && text) {
          if (safeEdits.current.title) text = text.replace(/^name: .*$/m, safeEdits.current.title);
          if (safeEdits.current.comments.length) text += safeEdits.current.comments.join('\n') + '\n';
        }
        setWorkflow(text);
      }
      setStep(current => current + 1);
    } catch (e) { setError((e as Error).message); }
  }
  async function finish(action: 'open_pr' | 'files') {
    setError(undefined);
    try { if (action === 'files') await zip.mutateAsync({ agentId: agent.id, input: input() }); else await install.mutateAsync({ agentId: agent.id, input: { ...input(), action } }); setDone(true); }
    catch (e) { setError((e as Error).message); }
  }
  const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 };
  const control: React.CSSProperties = { background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: 9 };
  return <div role="dialog" aria-modal="true" aria-label={t('exportTitle')} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.65)', display: 'grid', placeItems: 'center' }} onKeyDown={e => {
    if (e.key === 'Escape' && !busy) onClose();
    if (e.key === 'Tab') { const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') ?? []);
      const first = controls[0], last = controls[controls.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  }}>
    <section ref={dialog} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(850px,95vw)', maxHeight: '92vh', overflow: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2>{t('exportTitle')}</h2><Button aria-label={t('close')} onClick={onClose} disabled={busy}>{t('close')}</Button></div>
      <p style={{ color: 'var(--text-secondary)' }}>{agent.name} · {t('exportDescription')}</p>
      <ExportWizardSteps step={step} labels={[t('target'), t('preview'), t('configure'), t('install')]} />
      <div style={{ padding: '24px 0', minHeight: 330 }}>
        {step === 0 && <>
          <div style={{ border: '1px solid var(--accent)', borderRadius: 9, padding: 16, marginBottom: 18 }}><strong>GitHub Actions</strong><p>{t('targetDescription')}</p></div>
          <label style={field}>{t('repository')}<input autoFocus aria-label={t('repository')} placeholder="owner/repository" value={repo} onChange={e => setRepo(e.target.value)} style={control} /></label>
          <label style={field}>{t('baseBranch')}<input value={base} onChange={e => setBase(e.target.value)} style={control} /></label>
          <label style={field}>{t('runtime')}<select value={runtime} onChange={e => { setRuntime(e.target.value as typeof runtime); setModel(e.target.value === 'ollama' ? 'qwen2.5-coder:7b-instruct' : ''); setWorkflow(undefined); }} style={control}><option value="ollama">Ollama · {t('noKey')}</option><option value="openrouter">OpenRouter · {t('secretRequired')}</option></select></label>
          <label style={field}>{t('model')}<input value={model} onChange={e => { setModel(e.target.value); setWorkflow(undefined); }} style={control} /></label>
          <p style={{ color: 'var(--warn)' }}>{t('runtimeDisclosure', { studio: `${agent.provider}/${agent.model}`, ci: `${runtime}/${model}` })}</p>
        </>}
        {step === 1 && preview.data && <><p>{t('editPolicy')}</p><div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', border: '1px solid var(--border)', borderRadius: 8, minHeight: 340 }}>
          <div style={{ padding: 8 }}>{preview.data.files.map(file => <button key={file.path} onClick={() => setSelected(file.path)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 8, border: 0, cursor: 'pointer', background: selected === file.path ? 'var(--accent-bg)' : 'transparent', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{file.path}</button>)}</div>
          {selected === '.github/workflows/devdigest-review.yml' ? <textarea aria-label={t('workflow')} value={workflow ?? ''} onChange={e => { setWorkflow(e.target.value); safeEdits.current = { title: e.target.value.split(/\r?\n/).find(line => /^name: [A-Za-z0-9 _.-]{1,80}$/.test(line)), comments: e.target.value.split(/\r?\n/).filter(line => line.trimStart().startsWith('#')) }; }} style={{ ...control, minHeight: 340, fontFamily: 'monospace', fontSize: 11 }} /> : <pre style={{ overflow: 'auto', whiteSpace: 'pre-wrap', padding: 12, fontSize: 11 }}>{selected.endsWith('/index.js') ? t('bundleSummary', { bytes: preview.data.files.find(file => file.path === selected)?.contents.length ?? 0 }) : preview.data.files.find(file => file.path === selected)?.contents}</pre>}
        </div></>}
        {step === 2 && <>
          <fieldset style={{ marginBottom: 18 }}><legend>{t('triggers')}</legend>{(['opened', 'synchronize', 'reopened'] as const).map(event => <label key={event} style={{ marginRight: 15 }}><input type="checkbox" checked={triggers.includes(event)} onChange={e => { setTriggers(current => e.target.checked ? [...current, event] : current.filter(item => item !== event)); setWorkflow(undefined); }} /> {event}</label>)}</fieldset>
          <label style={field}>{t('postAs')}<select value={postAs} onChange={e => { setPostAs(e.target.value as typeof postAs); setWorkflow(undefined); }} style={control}><option value="github_review">{t('review')}</option><option value="pr_comment">{t('comment')}</option><option value="none">{t('exitOnly')}</option></select></label>
          <label style={field}>{t('failOn')}<select value={failOn} onChange={e => { setFailOn(e.target.value as typeof failOn); setWorkflow(undefined); }} style={control}>{['critical', 'warning', 'any', 'never'].map(value => <option key={value}>{value}</option>)}</select></label>
          <p>{t('requiredCheck')}</p><p>{runtime === 'ollama' ? t('ollamaNotice') : t('openrouterNotice')}</p>
        </>}
        {step === 3 && <><p>{t('installNotice', { repo, base })}</p><p><strong>{runtime}/{model}</strong> · {t('failOn')}: {failOn}</p><div style={{ display: 'flex', gap: 12 }}><Button onClick={() => finish('open_pr')} loading={install.isPending} disabled={busy || done}>{t('openPr')}</Button><Button kind="primary" onClick={() => finish('files')} loading={zip.isPending} disabled={busy || done}>{t('download')}</Button></div>{done && <p role="status">{install.data?.pr_url ? <a href={install.data.pr_url} target="_blank" rel="noreferrer">{t('viewPr')}</a> : t('downloaded')}</p>}</>}
        {error && <p role="alert" style={{ color: 'var(--crit)' }}>{error}</p>}
      </div>
      <footer style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 16 }}><Button onClick={() => setStep(current => current - 1)} disabled={step === 0 || busy || done}>{t('back')}</Button>{step < 3 && <Button kind="primary" loading={preview.isPending} disabled={busy || !repo || !model || !triggers.length} onClick={next}>{t('continue')}</Button>}</footer>
    </section>
  </div>;
}
