import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import { qk } from './keys';
import type {
  Recommendation,
  RecommendationCreateResult,
  RecommendationInput,
  RecommendationsListResult,
} from './types';

/**
 * Recommendations data layer (M6) — the money path.
 *
 * `useRequestAdvice` POSTs to /v1/fields/:id/recommendations. An empty body is valid: the
 * server uses the field's latest reading, its area, and default agro-context, runs the ML
 * ranker + deterministic engine, persists the result, and returns it. Optional overrides
 * (reading_id, area_ha, season, …) are supported but unused by the Phase 3 happy path.
 *
 * `useFieldRecommendations` backs History (newest first, cached/offline-readable).
 */

export function useFieldRecommendations(id: string) {
  return useQuery({
    queryKey: qk.recommendations(id),
    queryFn: () =>
      api.get<RecommendationsListResult>(`/v1/fields/${id}/recommendations`),
    select: (r) => r.recommendations,
    enabled: Boolean(id),
  });
}

export function useRequestAdvice(fieldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overrides: RecommendationInput = {}) =>
      api.post<RecommendationCreateResult>(`/v1/fields/${fieldId}/recommendations`, overrides),
    onSuccess: (result) => {
      // Prepend to the field's recommendation list cache so History reflects it at once.
      qc.setQueryData<RecommendationsListResult>(qk.recommendations(fieldId), (prev) =>
        prev
          ? { recommendations: [result.recommendation, ...prev.recommendations] }
          : { recommendations: [result.recommendation] },
      );
    },
  });
}

export type { Recommendation };
