"use client";
import React from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/app-shell';
import { ContextBrowser } from '@/components/project-context/ContextBrowser';

export default function ProjectContextPage() {
  const { repoId } = useParams<{ repoId: string }>(), t = useTranslations('projectContext');
  return <AppShell crumb={[{ label: t('title') }]}><main style={{ padding: 28 }}><h1>{t('title')}</h1><p>{t('description')}</p><ContextBrowser key={repoId} repoId={repoId} /></main></AppShell>;
}
