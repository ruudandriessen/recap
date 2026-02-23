import { test, expect } from "bun:test";
import { resolveDateRange, formatDate } from "../src/config.ts";

test("formatDate returns YYYY-MM-DD", () => {
  expect(formatDate(new Date("2025-03-15T12:00:00Z"))).toBe("2025-03-15");
});

test("resolveDateRange for custom period", () => {
  const range = resolveDateRange({
    period: "custom",
    since: "2025-01-01",
    until: "2025-01-31",
    format: "text",
  });
  expect(range.since).toBe("2025-01-01");
  expect(range.until).toBe("2025-01-31");
});

test("resolveDateRange custom without dates throws", () => {
  expect(() =>
    resolveDateRange({ period: "custom", format: "text" })
  ).toThrow("--since and --until are required");
});

test("resolveDateRange for week returns 7-day range", () => {
  const range = resolveDateRange({ period: "week", format: "text" });
  const since = new Date(range.since);
  const until = new Date(range.until);
  const diffDays = (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24);
  expect(diffDays).toBe(7);
});

test("resolveDateRange for month returns ~30-day range", () => {
  const range = resolveDateRange({ period: "month", format: "text" });
  const since = new Date(range.since);
  const until = new Date(range.until);
  const diffDays = (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24);
  expect(diffDays).toBeGreaterThanOrEqual(28);
  expect(diffDays).toBeLessThanOrEqual(31);
});

test("resolveDateRange for quarter returns ~90-day range", () => {
  const range = resolveDateRange({ period: "quarter", format: "text" });
  const since = new Date(range.since);
  const until = new Date(range.until);
  const diffDays = (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24);
  expect(diffDays).toBeGreaterThanOrEqual(89);
  expect(diffDays).toBeLessThanOrEqual(92);
});

test("resolveDateRange for year returns ~365-day range", () => {
  const range = resolveDateRange({ period: "year", format: "text" });
  const since = new Date(range.since);
  const until = new Date(range.until);
  const diffDays = (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24);
  expect(diffDays).toBeGreaterThanOrEqual(365);
  expect(diffDays).toBeLessThanOrEqual(366);
});
