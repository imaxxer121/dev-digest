/* hooks/reviews.ts — React Query + SSE hooks for the A2 reviewer.
   Run a review, stream RunEvents live, act on findings. */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "../api";
import { notify } from "../toast";
import type {
  FindingActionKind,
  PrReviewComment,
  ReviewRecord,
  ReviewRunResponse,
  RunEvent,
  RunSummary,
  SmartDiffResponse,
} from "@devdigest/shared";

// ---- Active (in-flight) runs — server-side source of truth ----
export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}

/** In-flight runs for a PR, from the server (agent_runs where status='running').
   Survives reloads/devices; polls while anything is running so it self-clears. */
export function usePrActiveRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-active-runs", prId],
    queryFn: () => api.get<ActiveRun[]>(`/pulls/${prId}/runs/active`),
    enabled: !!prId,
    // Keep the page-level observer alive on Files changed and detect runs
    // started elsewhere, not just ones already present in the first response.
    refetchInterval: 4000,
  });
}

// ---- Full run history for a PR (every agent_runs row, any status) ----
/** All runs for a PR — done, failed (with error), cancelled, running. Survives
   reload (DB-backed). Polls terminal history even if running was never seen. */
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-runs", prId],
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
    enabled: !!prId,
    // A background run can finish between two active-run polls. Persisted
    // terminal history must also refresh when running was never observed.
    refetchInterval: 4000,
  });
}

// ---- Persisted reviews + findings for a PR ----
export function usePrReviews(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["reviews", prId],
    queryFn: () => api.get<ReviewRecord[]>(`/pulls/${prId}/reviews`),
    enabled: !!prId,
  });
}

export function usePrSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}

/** Mounted by the PR page, so changing tabs cannot lose completion refresh. */
export function usePrReviewRefresh(prId: string | null | undefined, runs: RunSummary[] | undefined, active: ActiveRun[] | undefined) {
  const qc = useQueryClient();
  const previous = React.useRef<{ prId: string; terminal: string; active: string } | null>(null);
  const terminal = runs?.filter((run) => run.status !== "running")
    .map((run) => `${run.run_id}:${run.status}`).sort().join(",");
  const activeKey = active?.map((run) => run.run_id).sort().join(",");
  React.useEffect(() => {
    if (!prId || terminal === undefined || activeKey === undefined) return;
    const before = previous.current?.prId === prId ? previous.current : null;
    previous.current = { prId, terminal, active: activeKey };
    if ((!before && terminal) || (before && (terminal !== before.terminal || (before.active && !activeKey)))) {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["smart-diff", prId] });
    }
    if (before && before.active !== activeKey) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
  }, [qc, prId, terminal, activeKey]);
}

/** Delete one run from the PR's run history (+ its trace). */
export function useDeleteRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.del<{ ok: boolean }>(`/runs/${runId}`),
    // Deleting a run also deletes the review it produced (server-side), so drop
    // both the timeline and the Review Runs list from cache.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["smart-diff", prId] });
    },
  });
}

/** Request cancellation of an in-flight run (takes effect at the next step). */
export function useCancelRun() {
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
  });
}

/** Delete a whole review run (one agent's pass) + its findings. */
export function useDeleteReview(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.del<{ ok: boolean }>(`/reviews/${reviewId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["smart-diff", prId] });
    },
  });
}

// ---- Inline review comments on the "Files changed" tab (proxied to GitHub) --
/** Existing GitHub PR review comments, fetched live. */
export function usePrComments(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-comments", prId],
    queryFn: () => api.get<PrReviewComment[]>(`/pulls/${prId}/comments`),
    enabled: !!prId,
  });
}

export interface CreateCommentInput {
  path: string;
  line: number;
  side?: "LEFT" | "RIGHT";
  body: string;
  in_reply_to?: number;
}

/** Post one inline comment (or reply) to GitHub; refreshes the thread list. */
export function useCreatePrComment(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      api.post<PrReviewComment>(`/pulls/${prId}/comments`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-comments", prId] }),
  });
}

// ---- Run a review (all enabled agents or a specific agent) ----
export interface RunReviewInput {
  prId: string;
  agentId?: string;
  agentIds?: string[];
  all?: boolean;
}

export function useRunReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentId, agentIds, all }: RunReviewInput) =>
      api.post<ReviewRunResponse>(`/pulls/${prId}/review`, {
        ...(agentId ? { agentId } : {}),
        ...(agentIds ? { agentIds } : {}),
        ...(all ? { all } : {}),
      }),
    // The POST acknowledges background runs. Refresh on acknowledgement and
    // let the page's persisted-history poll detect their actual completion.
    onSettled: (_d, _err, { prId }) => {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["smart-diff", prId] });
      qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["multi-agent", prId] });
    },
  });
}

// ---- Finding actions (accept/dismiss) ----
export function useFindingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      action,
      reply,
      prId: _prId,
    }: {
      findingId: string;
      action: FindingActionKind;
      reply?: string;
      prId?: string;
    }) =>
      api.post<{ finding: ReviewRecord["findings"][number]; memoryId?: string }>(
        `/findings/${findingId}/${action}`,
        reply ? { reply } : undefined,
      ),
    onSuccess: (_d, { prId }) => {
      if (prId) {
        qc.invalidateQueries({ queryKey: ["reviews", prId] });
        qc.invalidateQueries({ queryKey: ["smart-diff", prId] });
        qc.invalidateQueries({ queryKey: ["multi-agent", prId] });
      }
    },
  });
}

/**
 * Subscribe to a run's SSE event stream. Returns the accumulated RunEvents and a
 * `running` flag (true until the stream closes). Live status for the
 * RunReviewDropdown / Live Log. Multiple runIds are subscribed in parallel.
 */
export function useRunEvents(runIds: string[]) {
  const [events, setEvents] = React.useState<RunEvent[]>([]);
  const [running, setRunning] = React.useState(false);
  const key = runIds.join(",");

  React.useEffect(() => {
    if (runIds.length === 0) return;
    setEvents([]);
    setRunning(true);
    const sources: EventSource[] = [];
    let open = runIds.length;

    for (const runId of runIds) {
      const es = new EventSource(`${API_BASE}/runs/${runId}/events`);
      const onMsg = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data) as RunEvent;
          setEvents((prev) => [...prev, parsed]);
          // Runtime agent failures arrive as SSE `error` events (not as a
          // mutation/query error), so the global error toast never sees them —
          // surface them here so the user gets a notification without a reload.
          if (parsed.kind === "error" && parsed.msg) notify.error(parsed.msg);
        } catch {
          /* ignore non-JSON keepalive frames (and dataless native error events) */
        }
      };
      // The server tags events with kind as the SSE `event:` name AND emits them
      // as default messages too in some clients — listen broadly.
      es.onmessage = onMsg;
      for (const kind of ["info", "tool", "result", "error"]) {
        es.addEventListener(kind, onMsg as EventListener);
      }
      es.onerror = () => {
        es.close();
        open -= 1;
        if (open <= 0) setRunning(false);
      };
      sources.push(es);
    }

    return () => {
      for (const es of sources) es.close();
      setRunning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { events, running };
}
