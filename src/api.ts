/**
 * Programmatic API for @clanki/recap.
 *
 * @example
 * ```ts
 * import { recap } from "@clanki/recap";
 *
 * const result = await recap({
 *   token: process.env.GITHUB_TOKEN!,
 *   period: "month",
 *   format: "text",
 * });
 * console.log(result.text);
 * ```
 *
 * @example Lower-level usage:
 * ```ts
 * import { GitHubSource, formatStructured, resolveDateRange } from "@clanki/recap";
 *
 * const github = new GitHubSource(token);
 * const username = await github.resolveUsername();
 * const dateRange = resolveDateRange({ period: "week", format: "text" });
 * const data = await github.fetch(username, dateRange);
 * console.log(formatStructured(data));
 * ```
 */

import { resolveDateRange } from "./config.ts";
import { formatStructured } from "./formatters/structured.ts";
import { generateSummary } from "./formatters/summary.ts";
import { GitHubSource } from "./sources/github.ts";
import type { ActivityData } from "./types.ts";

// Re-export building blocks for lower-level usage
export { GitHubSource } from "./sources/github.ts";
export { formatStructured } from "./formatters/structured.ts";
export { generateSummary } from "./formatters/summary.ts";
export { resolveDateRange } from "./config.ts";
export { PROMPT_PRESETS } from "./prompts.ts";
export type { ActivityData, Commit, DataSource, DateRange, PullRequest } from "./types.ts";
export type { PromptPreset } from "./prompts.ts";

export interface RecapOptions {
  /** GitHub personal access token */
  token: string;
  /** Time period to cover. Defaults to "week". */
  period?: "week" | "month" | "quarter" | "year" | "custom";
  /** Start date (YYYY-MM-DD). Required when period is "custom". */
  since?: string;
  /** End date (YYYY-MM-DD). Required when period is "custom". */
  until?: string;
  /** GitHub username. Resolved from the token if not provided. */
  username?: string;
  /** Filter activity to a specific GitHub organisation. */
  org?: string;
  /** What to produce: structured text, AI summary, or both. Defaults to "text". */
  format?: "text" | "summary" | "both";
  /** Custom prompt passed to the AI summary step. */
  prompt?: string;
}

export interface RecapResult {
  /** Raw activity data fetched from GitHub. */
  data: ActivityData;
  /** Structured text report. Present when format is "text" or "both". */
  text?: string;
  /** AI-generated summary. Present when format is "summary" or "both". */
  summary?: string;
}

/**
 * Fetch GitHub activity for a user and generate an engineering recap.
 *
 * @param options - Configuration for the recap.
 * @returns Resolved activity data, and optionally a formatted text report
 *          and/or AI-generated summary depending on the requested format.
 */
export async function recap(options: RecapOptions): Promise<RecapResult> {
  const { token, format = "text", period = "week", since, until, username: usernameOpt, org, prompt } = options;

  const dateRange = resolveDateRange({ period, since, until, format });

  const github = new GitHubSource(token);
  const username = usernameOpt ?? (await github.resolveUsername());
  const data = await github.fetch(username, dateRange, org);

  const result: RecapResult = { data };

  if (format === "text" || format === "both") {
    result.text = formatStructured(data);
  }

  if (format === "summary" || format === "both") {
    result.summary = await generateSummary(data, period, prompt);
  }

  return result;
}
