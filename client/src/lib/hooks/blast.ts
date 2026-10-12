"use client";

import { useQuery } from "@tanstack/react-query";
import type { BlastRadius } from "@devdigest/shared";
import { api } from "../api";

/** Read the persisted repository impact map; this endpoint performs no inference. */
export function usePrBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast-radius", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
