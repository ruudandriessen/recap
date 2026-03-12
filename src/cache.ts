import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ActivityData, DateRange } from "./types.ts";
import type { CacheKey, DataSource } from "./sources/source.ts";
import type { SlackActivity } from "./sources/slack/index.ts";

const CACHE_DIR = join(homedir(), ".recap", "cache");

/** Deterministic string from a cache key object, used as the cache filename. */
function serializeCacheKey(key: CacheKey): string {
  return Object.keys(key)
    .sort()
    .filter((k) => key[k] !== undefined)
    .map((k) => `${k}=${key[k]}`)
    .join(",")
    .replace(/[^a-zA-Z0-9,=-]/g, "_");
}

function cachePath(key: CacheKey): string {
  return join(CACHE_DIR, `${serializeCacheKey(key)}.json`);
}

export interface CachedData {
  cacheKey: CacheKey;
  fetchedRanges: DateRange[];
  prsCreated: ActivityData["prsCreated"];
  prsReviewed: ActivityData["prsReviewed"];
  commits: ActivityData["commits"];
  slackMessages?: SlackActivity["messages"];
}

async function loadCache(key: CacheKey): Promise<CachedData | null> {
  try {
    const raw = await readFile(cachePath(key), "utf-8");
    const data = JSON.parse(raw) as CachedData;
    if (!data.fetchedRanges) data.fetchedRanges = [];
    return data;
  } catch {
    return null;
  }
}

async function saveCache(data: CachedData): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath(data.cacheKey), JSON.stringify(data, null, 2));
}

// ── Range math ──────────────────────────────────────────────

export function nextDay(date: string): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function prevDay(date: string): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Merge and sort a list of ranges into non-overlapping, non-adjacent ranges. */
export function consolidateRanges(ranges: DateRange[]): DateRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.since.localeCompare(b.since));
  const first = sorted[0]!;
  const merged: DateRange[] = [{ since: first.since, until: first.until }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]!;
    const cur = sorted[i]!;
    if (cur.since <= nextDay(last.until)) {
      if (cur.until > last.until) last.until = cur.until;
    } else {
      merged.push({ since: cur.since, until: cur.until });
    }
  }
  return merged;
}

/** Return the sub-ranges of `requested` not covered by `fetched`. */
export function computeGaps(fetched: DateRange[], requested: DateRange): DateRange[] {
  const consolidated = consolidateRanges(fetched);
  const gaps: DateRange[] = [];
  let cursor = requested.since;

  for (const range of consolidated) {
    if (cursor > requested.until) break;
    if (range.until < cursor) continue;

    if (range.since > cursor) {
      const gapEnd = range.since > requested.until ? requested.until : prevDay(range.since);
      if (gapEnd >= cursor) {
        gaps.push({ since: cursor, until: gapEnd });
      }
    }

    if (range.until >= cursor) {
      cursor = nextDay(range.until);
    }
  }

  if (cursor <= requested.until) {
    gaps.push({ since: cursor, until: requested.until });
  }

  return gaps;
}

// ── Dedup helpers ───────────────────────────────────────────

function dedup<T>(existing: T[], incoming: T[], key: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of existing) seen.set(key(item), item);
  for (const item of incoming) seen.set(key(item), item);
  return [...seen.values()];
}

function mergeActivity(existing: CachedData, incoming: ActivityData): CachedData {
  const slackMessages = incoming.slack
    ? dedup(
        existing.slackMessages ?? [],
        incoming.slack.messages,
        (m) => `${m.channel}:${m.timestamp}`
      )
    : existing.slackMessages;

  return {
    cacheKey: existing.cacheKey,
    fetchedRanges: consolidateRanges([...existing.fetchedRanges, incoming.dateRange]),
    prsCreated: dedup(existing.prsCreated, incoming.prsCreated, (pr) => pr.url),
    prsReviewed: dedup(existing.prsReviewed, incoming.prsReviewed, (pr) => pr.url),
    commits: dedup(existing.commits, incoming.commits, (c) => c.sha),
    slackMessages,
  };
}

// ── Filter ──────────────────────────────────────────────────

export function filterByDateRange(
  cached: CachedData,
  dateRange: DateRange,
  sourceName: string,
  username: string,
): ActivityData {
  const { since, until } = dateRange;
  const untilEnd = until + "T23:59:59Z";

  const filteredSlackMessages = cached.slackMessages?.filter(
    (m) => m.timestamp >= since && m.timestamp <= untilEnd
  );

  let slack: SlackActivity | undefined;
  if (filteredSlackMessages && filteredSlackMessages.length > 0) {
    const channelBreakdown: Record<string, number> = {};
    for (const msg of filteredSlackMessages) {
      channelBreakdown[msg.channel] = (channelBreakdown[msg.channel] ?? 0) + 1;
    }
    slack = {
      messages: filteredSlackMessages,
      channelBreakdown,
      totalCount: filteredSlackMessages.length,
    };
  }

  return {
    source: sourceName,
    dateRange,
    username,
    prsCreated: cached.prsCreated.filter((pr) => pr.createdAt >= since && pr.createdAt <= untilEnd),
    prsReviewed: cached.prsReviewed.filter((pr) => pr.createdAt >= since && pr.createdAt <= untilEnd),
    commits: cached.commits.filter((c) => c.date >= since && c.date <= untilEnd),
    slack,
  };
}

// ── CachedSource ────────────────────────────────────────────

export interface FetchProgress {
  onCacheHit?(dateRange: DateRange): void;
  onFetching?(gaps: DateRange[]): void;
  onFetched?(gap: DateRange): void;
}

export function createCachedSource<K extends CacheKey>(inner: DataSource<K>) {
  return {
    name: inner.name,

    resolveUsername(): Promise<string> {
      return inner.resolveUsername();
    },

    makeCacheKey(username: string): K {
      return inner.makeCacheKey(username);
    },

    /**
     * Get activity for a date range, fetching only the gaps not already cached.
     */
    async fetch(username: string, dateRange: DateRange, progress?: FetchProgress): Promise<ActivityData> {
      const key = inner.makeCacheKey(username);
      let cached = await loadCache(key);

      const gaps = cached
        ? computeGaps(cached.fetchedRanges, dateRange)
        : [dateRange];

      if (gaps.length === 0) {
        progress?.onCacheHit?.(dateRange);
        return filterByDateRange(cached!, dateRange, inner.name, username);
      }

      progress?.onFetching?.(gaps);

      for (const gap of gaps) {
        const data = await inner.fetch(key, gap);
        cached = cached ? mergeActivity(cached, data) : {
          cacheKey: key,
          fetchedRanges: [data.dateRange],
          prsCreated: data.prsCreated,
          prsReviewed: data.prsReviewed,
          commits: data.commits,
          slackMessages: data.slack?.messages,
        };
        progress?.onFetched?.(gap);
      }

      await saveCache(cached!);
      return filterByDateRange(cached!, dateRange, inner.name, username);
    },

    /** Load from cache only, no fetching. Returns null if no cache exists. */
    async loadCached(username: string, dateRange: DateRange): Promise<ActivityData | null> {
      const key = inner.makeCacheKey(username);
      const cached = await loadCache(key);
      if (!cached) return null;
      return filterByDateRange(cached, dateRange, inner.name, username);
    },
  };
}

export type CachedSource = ReturnType<typeof createCachedSource>;
