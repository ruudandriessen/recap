import { test, expect } from "bun:test";
import type { CachedData } from "../src/cache.ts";
import { filterByDateRange, computeGaps, consolidateRanges } from "../src/cache.ts";

const makePR = (n: number, createdAt: string) => ({
  title: `PR ${n}`,
  url: `https://github.com/owner/repo/pull/${n}`,
  repo: "owner/repo",
  number: n,
  state: "closed" as const,
  merged: true,
  createdAt,
  mergedAt: createdAt,
});

const makeCommit = (n: number, date: string) => ({
  message: `commit ${n}`,
  sha: `sha${n}`,
  url: `https://github.com/owner/repo/commit/sha${n}`,
  repo: "owner/repo",
  date,
});

const makeSlackMsg = (channel: string, timestamp: string) => ({
  text: `msg in ${channel}`,
  channel,
  channelType: "public" as const,
  timestamp,
});

// ── filterByDateRange ───────────────────────────────────────

test("filterByDateRange filters PRs and commits by date", () => {
  const cached: CachedData = {
    cacheKey: { source: "github", username: "testuser" },
    fetchedRanges: [],
    prsCreated: [
      makePR(1, "2025-01-15T10:00:00Z"),
      makePR(2, "2025-02-15T10:00:00Z"),
      makePR(3, "2025-03-15T10:00:00Z"),
    ],
    prsReviewed: [
      makePR(10, "2025-01-20T10:00:00Z"),
      makePR(11, "2025-02-20T10:00:00Z"),
    ],
    commits: [
      makeCommit(1, "2025-01-10T10:00:00Z"),
      makeCommit(2, "2025-02-10T10:00:00Z"),
      makeCommit(3, "2025-03-10T10:00:00Z"),
    ],
  };

  const result = filterByDateRange(cached, { since: "2025-02-01", until: "2025-02-28" }, "test", "testuser");

  expect(result.username).toBe("testuser");
  expect(result.prsCreated).toHaveLength(1);
  expect(result.prsCreated[0]!.number).toBe(2);
  expect(result.prsReviewed).toHaveLength(1);
  expect(result.prsReviewed[0]!.number).toBe(11);
  expect(result.commits).toHaveLength(1);
  expect(result.commits[0]!.sha).toBe("sha2");
});

test("filterByDateRange returns empty arrays when no data in range", () => {
  const cached: CachedData = {
    cacheKey: { source: "github", username: "testuser" },
    fetchedRanges: [],
    prsCreated: [makePR(1, "2025-01-15T10:00:00Z")],
    prsReviewed: [],
    commits: [makeCommit(1, "2025-01-10T10:00:00Z")],
  };

  const result = filterByDateRange(cached, { since: "2025-06-01", until: "2025-06-30" }, "test", "testuser");

  expect(result.prsCreated).toHaveLength(0);
  expect(result.prsReviewed).toHaveLength(0);
  expect(result.commits).toHaveLength(0);
});

test("filterByDateRange filters slack messages by date", () => {
  const cached: CachedData = {
    cacheKey: { source: "slack", username: "testuser" },
    fetchedRanges: [],
    prsCreated: [],
    prsReviewed: [],
    commits: [],
    slackMessages: [
      makeSlackMsg("general", "2025-01-15T10:00:00.000Z"),
      makeSlackMsg("dev", "2025-02-15T10:00:00.000Z"),
      makeSlackMsg("random", "2025-03-15T10:00:00.000Z"),
    ],
  };

  const result = filterByDateRange(cached, { since: "2025-02-01", until: "2025-02-28" }, "test", "testuser");

  expect(result.slack).toBeDefined();
  expect(result.slack!.totalCount).toBe(1);
  expect(result.slack!.messages[0]!.channel).toBe("dev");
  expect(result.slack!.channelBreakdown).toEqual({ dev: 1 });
});

test("filterByDateRange returns no slack when messages outside range", () => {
  const cached: CachedData = {
    cacheKey: { source: "slack", username: "testuser" },
    fetchedRanges: [],
    prsCreated: [],
    prsReviewed: [],
    commits: [],
    slackMessages: [
      makeSlackMsg("general", "2025-01-15T10:00:00.000Z"),
    ],
  };

  const result = filterByDateRange(cached, { since: "2025-06-01", until: "2025-06-30" }, "test", "testuser");
  expect(result.slack).toBeUndefined();
});

// ── consolidateRanges ───────────────────────────────────────

test("consolidateRanges merges overlapping ranges", () => {
  const result = consolidateRanges([
    { since: "2025-01-01", until: "2025-02-15" },
    { since: "2025-02-10", until: "2025-03-31" },
  ]);
  expect(result).toEqual([{ since: "2025-01-01", until: "2025-03-31" }]);
});

test("consolidateRanges merges adjacent ranges", () => {
  const result = consolidateRanges([
    { since: "2025-01-01", until: "2025-01-31" },
    { since: "2025-02-01", until: "2025-02-28" },
  ]);
  expect(result).toEqual([{ since: "2025-01-01", until: "2025-02-28" }]);
});

test("consolidateRanges keeps disjoint ranges separate", () => {
  const result = consolidateRanges([
    { since: "2025-01-01", until: "2025-01-15" },
    { since: "2025-03-01", until: "2025-03-31" },
  ]);
  expect(result).toEqual([
    { since: "2025-01-01", until: "2025-01-15" },
    { since: "2025-03-01", until: "2025-03-31" },
  ]);
});

// ── computeGaps ─────────────────────────────────────────────

test("computeGaps returns full range when nothing is fetched", () => {
  const gaps = computeGaps([], { since: "2025-01-01", until: "2025-01-31" });
  expect(gaps).toEqual([{ since: "2025-01-01", until: "2025-01-31" }]);
});

test("computeGaps returns empty when range is fully covered", () => {
  const gaps = computeGaps(
    [{ since: "2025-01-01", until: "2025-03-31" }],
    { since: "2025-02-01", until: "2025-02-28" }
  );
  expect(gaps).toEqual([]);
});

test("computeGaps returns tail gap", () => {
  const gaps = computeGaps(
    [{ since: "2025-01-01", until: "2025-01-15" }],
    { since: "2025-01-01", until: "2025-01-31" }
  );
  expect(gaps).toEqual([{ since: "2025-01-16", until: "2025-01-31" }]);
});

test("computeGaps returns head gap", () => {
  const gaps = computeGaps(
    [{ since: "2025-01-16", until: "2025-01-31" }],
    { since: "2025-01-01", until: "2025-01-31" }
  );
  expect(gaps).toEqual([{ since: "2025-01-01", until: "2025-01-15" }]);
});

test("computeGaps returns middle gap between two ranges", () => {
  const gaps = computeGaps(
    [
      { since: "2025-01-01", until: "2025-01-10" },
      { since: "2025-01-21", until: "2025-01-31" },
    ],
    { since: "2025-01-01", until: "2025-01-31" }
  );
  expect(gaps).toEqual([{ since: "2025-01-11", until: "2025-01-20" }]);
});

test("computeGaps returns multiple gaps", () => {
  const gaps = computeGaps(
    [{ since: "2025-01-10", until: "2025-01-20" }],
    { since: "2025-01-01", until: "2025-01-31" }
  );
  expect(gaps).toEqual([
    { since: "2025-01-01", until: "2025-01-09" },
    { since: "2025-01-21", until: "2025-01-31" },
  ]);
});

test("computeGaps handles exact match", () => {
  const gaps = computeGaps(
    [{ since: "2025-02-01", until: "2025-02-28" }],
    { since: "2025-02-01", until: "2025-02-28" }
  );
  expect(gaps).toEqual([]);
});
