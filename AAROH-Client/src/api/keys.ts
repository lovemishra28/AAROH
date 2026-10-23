/**
 * Centralised TanStack Query keys.
 *
 * One place so invalidation and cache reads can never drift apart: a mutation that
 * creates a reading invalidates `qk.field(id)` and `qk.recommendations(id)` using the
 * same tuples the screens subscribe to. Field-scoped keys share the `['field', id, …]`
 * prefix so a single `invalidateQueries({ queryKey: ['field', id] })` sweeps them all.
 */
export const qk = {
  health: ['health'] as const,
  me: ['me'] as const,
  fields: ['fields'] as const,
  field: (id: string) => ['field', id] as const,
  fieldReadings: (id: string) => ['field', id, 'readings'] as const,
  recommendations: (id: string) => ['field', id, 'recommendations'] as const,
};
