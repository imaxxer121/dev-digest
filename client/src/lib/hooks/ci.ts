"use client";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CiPreview, CiExport, CiInstallation, CiRun, CiRefreshResult, type CiExportInputBody } from '@/vendor/shared/contracts/eval-ci';
import { api, API_BASE } from '../api';
export function useCiInstallations(agentId?: string) {
  return useQuery({ queryKey: ['ci-installations', agentId], queryFn: async () => CiInstallation.array().parse(await api.get(`/ci/installations${agentId ? `?agent_id=${agentId}` : ''}`)) });
}
export function useCiRuns(agentId?: string) {
  return useQuery({ queryKey: ['ci-runs', agentId], queryFn: async () => CiRun.array().parse(await api.get(`/ci/runs${agentId ? `?agent_id=${agentId}` : ''}`)), refetchInterval: 15000 });
}
export function useCiPreview() { return useMutation({ retry: false, mutationFn: async ({ agentId, input }: { agentId: string; input: CiExportInputBody }) => CiPreview.parse(await api.post(`/agents/${agentId}/ci-preview`, input)) }); }
export function useCiExport() {
  const qc = useQueryClient();
  return useMutation({ retry: false, mutationFn: async ({ agentId, input }: { agentId: string; input: CiExportInputBody }) => CiExport.parse(await api.post(`/agents/${agentId}/export-ci`, input)), onSuccess: () => qc.invalidateQueries({ queryKey: ['ci-installations'] }) });
}
export function useCiZip() {
  const qc = useQueryClient();
  return useMutation({ retry: false, mutationFn: async ({ agentId, input }: { agentId: string; input: CiExportInputBody }) => {
    const response = await fetch(`${API_BASE}/agents/${agentId}/ci-zip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!response.ok) { const error = await response.json(); throw new Error(error?.error?.message ?? `Export failed (${response.status})`); }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = 'devdigest-ci.zip'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['ci-installations'] }) });
}
export function useCiRefresh() {
  const qc = useQueryClient();
  return useMutation({ retry: false, mutationFn: async (input: { installation_id: string; run_id: number }) => CiRefreshResult.parse(await api.post('/ci/refresh', input)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ci-runs'] }); qc.invalidateQueries({ queryKey: ['ci-installations'] }); qc.invalidateQueries({ queryKey: ['pr-runs'] }); qc.invalidateQueries({ queryKey: ['reviews'] }); qc.invalidateQueries({ queryKey: ['smart-diff'] }); } });
}
