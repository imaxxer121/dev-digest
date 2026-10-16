"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IntentResponse } from "@/vendor/shared/contracts/review-api";
import { api } from "../api";

/** Opening Overview only reads stored Intent. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: async () => IntentResponse.parse(await api.get(`/pulls/${prId}/intent`)),
    enabled: !!prId,
  });
}

export function useRecalculateIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["recalculate-intent", prId],
    mutationFn: async () => {
      if (!prId) throw new Error("Pull request identity is unavailable");
      return IntentResponse.parse(await api.post(`/pulls/${prId}/intent/recalculate`));
    },
    retry: false,
    onMutate: () => ({ prId }),
    onSuccess: async (data, _variables, context) => {
      const queryKey = ["pr-intent", context?.prId];
      // A background read captured before POST success must not restore older Intent.
      await qc.cancelQueries({ queryKey, exact: true });
      qc.setQueryData(queryKey, data);
    },
    // A conflict can mean the head changed or another request saved a newer result.
    onError: (_error, _variables, context) => { void qc.invalidateQueries({ queryKey: ["pr-intent", context?.prId] }); },
  });
}
