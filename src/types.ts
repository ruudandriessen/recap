import type { PullRequest, Commit } from "./sources/github/index.ts";
import type { SlackActivity } from "./sources/slack/index.ts";

export interface DateRange {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

/**
 * Source-specific results – discriminated union on `source`.
 */
export type { GitHubSourceResult } from "./sources/github/index.ts";
export type { SlackSourceResult } from "./sources/slack/index.ts";

import type { GitHubSourceResult } from "./sources/github/index.ts";
import type { SlackSourceResult } from "./sources/slack/index.ts";

export type SourceResult = GitHubSourceResult | SlackSourceResult;

/**
 * Merged activity across all sources – arrays are guaranteed to be present.
 * This is the type consumed by formatters and the rest of the app.
 */
export interface ActivityData {
  source: string;
  dateRange: DateRange;
  username: string;
  slackUsername?: string;
  prsCreated: PullRequest[];
  prsReviewed: PullRequest[];
  commits: Commit[];
  slack?: SlackActivity;
}

// Re-export co-located types for convenience
export type { PullRequest, Commit } from "./sources/github/index.ts";
export type { SlackMessage, SlackActivity } from "./sources/slack/index.ts";
export type { CacheKey, DataSource } from "./sources/source.ts";
export type { CliOptions, SourceOption } from "./cli/index.ts";
