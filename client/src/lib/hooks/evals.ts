"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EvalCaseCollection, EvalCaseConversion, EvalBatchStarted, EvalBatchSummary, EvalBatchDetail, EvalDashboardResponse } from "@/vendor/shared/contracts/eval-pipeline";
import { api } from "../api";

export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({ queryKey: ["eval-cases", agentId], enabled: !!agentId,
    queryFn: async () => EvalCaseCollection.parse(await api.get(`/agents/${agentId}/eval-cases`)) });
}

export function useAgentEvalRuns(agentId: string | null | undefined) {
  return useQuery({ queryKey: ["eval-runs", agentId], enabled: !!agentId,
    queryFn: async () => EvalBatchSummary.array().parse(await api.get(`/agents/${agentId}/eval-runs`)),
    refetchInterval: (query) => query.state.data?.some((batch) => batch.status === "running") ? 1500 : false });
}

export function useEvalDashboard() {
  return useQuery({ queryKey: ["eval-dashboard"],
    queryFn: async () => EvalDashboardResponse.parse(await api.get("/eval-dashboard")),
    refetchInterval: (query) => query.state.data?.latest.some((batch) => batch.status === "running") ? 1500 : false });
}

export function useEvalBatch(batchId: string | null | undefined) {
  const qc = useQueryClient();
  const terminalSeen = React.useRef(new Set<string>());
  const query = useQuery({ queryKey: ["eval-batch", batchId], enabled: !!batchId,
    queryFn: async () => EvalBatchDetail.parse(await api.get(`/eval-runs/${batchId}`)),
    refetchInterval: (entry) => entry.state.data?.status === "running" ? 1500 : false });
  React.useEffect(() => {
    const batch = query.data;
    if (!batch || batch.status === "running" || terminalSeen.current.has(batch.id)) return;
    terminalSeen.current.add(batch.id);
    qc.invalidateQueries({ queryKey: ["eval-runs", batch.agent_id] });
    qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
  }, [qc, query.data]);
  return query;
}

export function useConvertFindingToEval() {
  const qc = useQueryClient();
  return useMutation({ retry: false,
    mutationFn: async ({ findingId }: { findingId: string }) => EvalCaseConversion.parse(await api.post(`/findings/${findingId}/eval-case`)),
    onSuccess: (result) => qc.invalidateQueries({ queryKey: ["eval-cases", result.case.owner_id] }),
  });
}

export function useRunAgentEvals() {
  const qc = useQueryClient();
  return useMutation({ retry: false,
    mutationFn: async ({ agentId }: { agentId: string }) => EvalBatchStarted.parse(await api.post(`/agents/${agentId}/eval-runs`)),
    onSuccess: (_result, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}
