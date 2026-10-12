"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
export function useConventions(repoId: string) {
  return useQuery({ queryKey: ["conventions", repoId], queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`), enabled: !!repoId });
}
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`, {}), onSuccess: data => qc.setQueryData(["conventions", repoId], data) });
}
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({id, patch}: {id: string; patch: Partial<Pick<ConventionCandidate, "rule" | "category" | "status">>}) => api.put<ConventionCandidate>(`/conventions/${id}`, patch), onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }) });
}
export function useCreateConventionSkill(repoId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: {name: string; description: string; body?: string}) => api.post<Skill>(`/repos/${repoId}/conventions/skill`, data), onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }) });
}
