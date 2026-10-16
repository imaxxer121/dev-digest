"use client";
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ProjectContextDiscovery, ProjectContextPreview } from '@/vendor/shared/contracts/project-context';

export function useProjectContext(repoId: string | null) {
  return useQuery({ queryKey: ['project-context', repoId], enabled: !!repoId,
    queryFn: async () => ProjectContextDiscovery.parse(await api.get(`/repos/${repoId}/project-context`)) });
}
export function useContextDocument(repoId: string | null, path: string | null) {
  return useQuery({ queryKey: ['context-document', repoId, path], enabled: !!repoId && !!path,
    queryFn: async () => ProjectContextPreview.parse(await api.get(`/repos/${repoId}/project-context/document?${new URLSearchParams({ path: path! })}`)) });
}
