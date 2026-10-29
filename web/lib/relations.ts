/** Normalize singular PostgREST relationships without arbitrarily choosing
 * one member when an unexpected multi-row relationship is returned. */
export function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value ?? null;
}
