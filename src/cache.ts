import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { DateRange, SourceResult } from "./types.ts";
import type { CacheKey, DataSource } from "./sources/source.ts";
import type { PullRequest, Commit, GitHubSourceResult } from "./sources/github/index.ts";
import type { SlackMessage, SlackSourceResult } from "./sources/slack/index.ts";

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

interface CachedDataBase {
  cacheKey: CacheKey;
  fetchedRanges: DateRange[];
}

export interface GitHubCachedData extends CachedDataBase {
  source: "github";
  prsCreated: PullRequest[];
  prsReviewed: PullRequest[];
  commits: Commit[];
}

export interface SlackCachedData extends CachedDataBase {
  source: "slack";
  slackMessages: SlackMessage[];
  slackUsername?: string;
}

export type CachedData = GitHubCachedData | SlackCachedData;

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

function mergeGitHub(existing: GitHubCachedData, incoming: GitHubSourceResult): GitHubCachedData {
  return {
    source: "github",
    cacheKey: existing.cacheKey,
    fetchedRanges: consolidateRanges([...existing.fetchedRanges, incoming.dateRange]),
    prsCreated: dedup(existing.prsCreated, incoming.prsCreated, (pr) => pr.url),
    prsReviewed: dedup(existing.prsReviewed, incoming.prsReviewed, (pr) => pr.url),
    commits: dedup(existing.commits, incoming.commits, (c) => c.sha),
  };
}

function mergeSlack(existing: SlackCachedData, incoming: SlackSourceResult): SlackCachedData {
  return {
    source: "slack",
    cacheKey: existing.cacheKey,
    fetchedRanges: consolidateRanges([...existing.fetchedRanges, incoming.dateRange]),
    slackMessages: dedup(
      existing.slackMessages,
      incoming.slack.messages,
      (m) => `${m.channel}:${m.timestamp}`,
    ),
    slackUsername: incoming.slackUsername ?? existing.slackUsername,
  };
}

// ── Filter ──────────────────────────────────────────────────

function filterGitHub(cached: GitHubCachedData, dateRange: DateRange, username: string): GitHubSourceResult {
  const { since, until } = dateRange;
  const untilEnd = until + "T23:59:59Z";
  return {
    source: "github",
    dateRange,
    username,
    prsCreated: cached.prsCreated.filter((pr) => pr.createdAt >= since && pr.createdAt <= untilEnd),
    prsReviewed: cached.prsReviewed.filter((pr) => pr.createdAt >= since && pr.createdAt <= untilEnd),
    commits: cached.commits.filter((c) => c.date >= since && c.date <= untilEnd),
  };
}

function filterSlack(cached: SlackCachedData, dateRange: DateRange, username: string): SlackSourceResult {
  const { since, until } = dateRange;
  const untilEnd = until + "T23:59:59Z";
  const messages = cached.slackMessages.filter(
    (m) => m.timestamp >= since && m.timestamp <= untilEnd,
  );
  const channelBreakdown: Record<string, number> = {};
  for (const msg of messages) {
    channelBreakdown[msg.channel] = (channelBreakdown[msg.channel] ?? 0) + 1;
  }
  return {
    source: "slack",
    dateRange,
    username,
    slackUsername: cached.slackUsername ?? username,
    slack: { messages, channelBreakdown, totalCount: messages.length },
  };
}

export function filterByDateRange(cached: CachedData, dateRange: DateRange, username: string): SourceResult {
  switch (cached.source) {
    case "github":
      return filterGitHub(cached, dateRange, username);
    case "slack":
      return filterSlack(cached, dateRange, username);
  }
}

// ── Source-specific cache operations ────────────────────────

interface CacheOps<R extends SourceResult, C extends CachedData> {
  toCached(key: CacheKey, result: R): C;
  merge(existing: C, incoming: R): C;
  filter(cached: C, dateRange: DateRange, username: string): R;
}

const githubCacheOps: CacheOps<GitHubSourceResult, GitHubCachedData> = {
  toCached(key, result) {
    return {
      source: "github",
      cacheKey: key,
      fetchedRanges: [result.dateRange],
      prsCreated: result.prsCreated,
      prsReviewed: result.prsReviewed,
      commits: result.commits,
    };
  },
  merge: mergeGitHub,
  filter: filterGitHub,
};

const slackCacheOps: CacheOps<SlackSourceResult, SlackCachedData> = {
  toCached(key, result) {
    return {
      source: "slack",
      cacheKey: key,
      fetchedRanges: [result.dateRange],
      slackMessages: result.slack.messages,
      slackUsername: result.slackUsername,
    };
  },
  merge: mergeSlack,
  filter: filterSlack,
};

const cacheOpsMap: { github: CacheOps<GitHubSourceResult, GitHubCachedData>; slack: CacheOps<SlackSourceResult, SlackCachedData> } = {
  github: githubCacheOps,
  slack: slackCacheOps,
};

// ── CachedSource ────────────────────────────────────────────

export interface FetchProgress {
  onCacheHit?(dateRange: DateRange): void;
  onFetching?(gaps: DateRange[]): void;
  onFetched?(gap: DateRange): void;
}

export function createCachedSource<K extends CacheKey, R extends SourceResult>(inner: DataSource<K, R>) {
  const ops = cacheOpsMap[inner.name as SourceResult["source"]] as CacheOps<R, CachedData>;

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
    async fetch(username: string, dateRange: DateRange, progress?: FetchProgress): Promise<R> {
      const key = inner.makeCacheKey(username);
      let cached = await loadCache(key);

      const gaps = cached
        ? computeGaps(cached.fetchedRanges, dateRange)
        : [dateRange];

      if (gaps.length === 0) {
        progress?.onCacheHit?.(dateRange);
        return ops.filter(cached!, dateRange, username);
      }

      progress?.onFetching?.(gaps);

      for (const gap of gaps) {
        const data = await inner.fetch(key, gap);
        cached = cached ? ops.merge(cached, data) : ops.toCached(key, data);
        progress?.onFetched?.(gap);
      }

      await saveCache(cached!);
      return ops.filter(cached!, dateRange, username);
    },

    /** Load from cache only, no fetching. Returns null if no cache exists. */
    async loadCached(username: string, dateRange: DateRange): Promise<R | null> {
      const key = inner.makeCacheKey(username);
      const cached = await loadCache(key);
      if (!cached) return null;
      return ops.filter(cached, dateRange, username);
    },
  };
}

export type CachedSource = ReturnType<typeof createCachedSource<CacheKey, SourceResult>>;
