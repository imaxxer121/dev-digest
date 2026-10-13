"use client";
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { MultiAgentReviewCollection } from '../../vendor/shared/contracts/review-api';

export function useMultiAgentReviews(prId: string | null | undefined) {
  return useQuery({ queryKey: ['multi-agent', prId], enabled: !!prId,
    queryFn: async () => MultiAgentReviewCollection.parse(await api.get(`/pulls/${prId}/multi-agent`)),
    refetchInterval: 2500 });
}
