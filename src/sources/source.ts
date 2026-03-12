import type { ActivityData, DateRange } from "../types.ts";

/**
 * Cache key object encoding every parameter that affects the data a source
 * returns. The same object is passed to `fetch`, so a source cannot
 * accidentally depend on values that are not part of the cache identity.
 */
export type CacheKey = Record<string, string | undefined>;

export interface DataSource<K extends CacheKey = CacheKey> {
  /** Human-readable name (e.g. "github") */
  name: string;
  /** Build the cache key for a given username. */
  makeCacheKey(username: string): K;
  resolveUsername(): Promise<string>;
  fetch(key: K, dateRange: DateRange): Promise<ActivityData>;
}
