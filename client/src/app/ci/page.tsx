"use client";
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/app-shell';
import { CIRunsView } from './_components/CIRunsView';
export default function CIRunsPage() { const t = useTranslations('ci'); return <AppShell crumb={[{ label: t('runsTitle') }]}><CIRunsView /></AppShell>; }
