/**
 * Programmatic API for recap.
 *
 * @example
 * ```ts
 * import { recap } from "@clanki/recap";
 *
 * const result = await recap({
 *   githubToken: process.env.GITHUB_TOKEN!,
 *   period: "month",
 *   format: "text",
 * });
 *
 * console.log(result.text);
 * ```
 */

import { resolveDateRange } from "./src/config.ts";
import { formatStructured } from "./src/formatters/structured.ts";
import { generateSummary } from "./src/formatters/summary.ts";
import { GitHubSource } from "./src/sources/github.ts";
import type { ActivityData, DateRange } from "./src/types.ts";

// Re-export building blocks for advanced usage
export type { ActivityData, Commit, DataSource, DateRange, PullRequest } from "./src/types.ts";
export type { PromptPreset } from "./src/prompts.ts";
export { PROMPT_PRESETS } from "./src/prompts.ts";
export { GitHubSource } from "./src/sources/github.ts";
export { formatStructured } from "./src/formatters/structured.ts";
export { generateSummary } from "./src/formatters/summary.ts";
export { formatDate, resolveDateRange } from "./src/config.ts";

export interface RecapOptions {
  /** GitHub personal access token with `repo` and `read:user` scopes. */
  githubToken: string;

  /**
   * GitHub username to generate the recap for.
   * Defaults to the owner of the provided token.
   */
  username?: string;

  /** Limit activity to a specific GitHub organization. */
  org?: string;

  /**
   * Predefined time period. Defaults to `"month"`.
   * Ignored when `since` and `until` are provided.
   */
  period?: "week" | "month" | "quarter" | "year";

  /**
   * Start of the date range in `YYYY-MM-DD` format.
   * Must be used together with `until`.
   */
  since?: string;

  /**
   * End of the date range in `YYYY-MM-DD` format.
   * Must be used together with `since`.
   */
  until?: string;

  /**
   * Controls what is included in the result.
   *
   * - `"text"` — structured text report only (default, no external tools required)
   * - `"summary"` — AI-generated summary only (requires the `claude` CLI)
   * - `"both"` — structured text report + AI-generated summary
   */
  format?: "text" | "summary" | "both";

  /**
   * Custom prompt string passed to the AI when generating the summary.
   * Overrides the default "unbiased engineering review" preset.
   * Only used when `format` is `"summary"` or `"both"`.
   */
  prompt?: string;
}

export interface RecapResult {
  /** Raw activity data fetched from GitHub. */
  data: ActivityData;

  /**
   * Formatted structured text report.
   * Present when `format` is `"text"` or `"both"`.
   */
  text?: string;

  /**
   * AI-generated narrative summary.
   * Present when `format` is `"summary"` or `"both"`.
   */
  summary?: string;
}

/**
 * Fetch a developer's GitHub activity and optionally generate an AI review.
 *
 * @example Basic text report
 * ```ts
 * const { text } = await recap({
 *   githubToken: "ghp_...",
 *   period: "month",
 * });
 * console.log(text);
 * ```
 *
 * @example AI summary for a custom date range
 * ```ts
 * const { summary } = await recap({
 *   githubToken: "ghp_...",
 *   since: "2024-01-01",
 *   until: "2024-03-31",
 *   format: "summary",
 * });
 * console.log(summary);
 * ```
 */
export async function recap(options: RecapOptions): Promise<RecapResult> {
  const { githubToken, username: usernameOpt, org, format = "text", prompt } = options;

  const hasCustomRange = options.since && options.until;
  const period = hasCustomRange ? ("custom" as const) : (options.period ?? "month");

  const dateRange = resolveDateRange({
    period,
    since: options.since,
    until: options.until,
    format,
  });

  const github = new GitHubSource(githubToken);
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
