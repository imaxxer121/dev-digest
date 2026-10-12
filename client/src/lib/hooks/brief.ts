"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefResponse } from "@/vendor/shared/contracts/brief";
import { api } from "../api";

/** Reading a saved brief never generates one. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: async () => BriefResponse.parse(await api.get(`/pulls/${prId}/brief`)),
    enabled: !!prId,
  });
}

/** Only an explicit action invokes this mutation; errors leave the GET cache intact. */
export function useGeneratePrBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["generate-pr-brief", prId],
    mutationFn: async () => {
      if (!prId) throw new Error("Pull request identity is unavailable");
      return BriefResponse.parse(await api.post(`/pulls/${prId}/brief`));
    },
    retry: false,
    onMutate: () => ({ prId }),
    onSuccess: (data, _variables, context) => qc.setQueryData(["pr-brief", context?.prId], data),
  });
}
