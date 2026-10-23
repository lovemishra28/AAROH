import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import { qk } from './keys';
import type {
  Field,
  FieldCreateInput,
  FieldCreateResult,
  FieldDetailResult,
  FieldsResult,
} from './types';

/**
 * Fields data layer (M4).
 *
 * Reads go through TanStack Query so they are cached, deduped, and — once M8 wires the
 * AsyncStorage persister — readable offline. `select` unwraps the envelope so screens get
 * `Field[]` / the detail object directly and never touch `.fields`.
 */

export function useFields() {
  return useQuery({
    queryKey: qk.fields,
    queryFn: () => api.get<FieldsResult>('/v1/fields'),
    select: (r) => r.fields,
  });
}

export function useField(id: string) {
  return useQuery({
    queryKey: qk.field(id),
    queryFn: () => api.get<FieldDetailResult>(`/v1/fields/${id}`),
    enabled: Boolean(id),
  });
}

/** POST /v1/fields — captures name + area_ha (hectares; the form converts from acres). */
export function useCreateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FieldCreateInput) => api.post<FieldCreateResult>('/v1/fields', input),
    onSuccess: (result) => {
      // Seed the list cache so the new field shows instantly, then revalidate.
      qc.setQueryData<FieldsResult>(qk.fields, (prev) =>
        prev ? { fields: [result.field, ...prev.fields] } : { fields: [result.field] },
      );
      void qc.invalidateQueries({ queryKey: qk.fields });
    },
  });
}

export type { Field };
