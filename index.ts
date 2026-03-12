#!/usr/bin/env node
import ora from "ora";
import { parseArgs, shouldRunInteractive } from "./src/cli/index.ts";
import type { ParsedCommand, SourceOption } from "./src/cli/index.ts";
import { resolveDateRange } from "./src/cli/config.ts";
import { promptForOptions } from "./src/cli/interactive.ts";
import { formatStructured } from "./src/formatters/structured.ts";
import { generateSummary } from "./src/formatters/summary.ts";
import { createGitHubSource } from "./src/sources/github/index.ts";
import { resolveGitHubToken } from "./src/sources/github/token.ts";
import { createSlackSource, resolveSlackCredentials } from "./src/sources/slack/index.ts";
import { createCachedSource } from "./src/cache.ts";
import type { CachedSource, FetchProgress } from "./src/cache.ts";
import type { ActivityData, DateRange, SourceResult } from "./src/types.ts";

async function handleAuth(argv: string[]) {
  const subcommand = argv[1];
  if (subcommand === "slack") {
    const action = argv[2];
    if (action === "logout") {
      const { handleAuthSlackLogout } = await import("./src/cli/auth.ts");
      return handleAuthSlackLogout();
    }
    if (action === "status") {
      const { handleAuthSlackStatus } = await import("./src/cli/auth.ts");
      return handleAuthSlackStatus();
    }
    const { handleAuthSlack } = await import("./src/cli/auth.ts");
    return handleAuthSlack();
  }
  console.error("Usage: recap auth slack [logout|status]");
  process.exit(1);
}

async function resolveSources(options: { org?: string; source?: SourceOption; slackUsername?: string }): Promise<CachedSource[]> {
  const sourceOption = options.source ?? "all";
  const sources: CachedSource[] = [];

  if (sourceOption === "github" || sourceOption === "all") {
    const token = await resolveGitHubToken();
    sources.push(createCachedSource(createGitHubSource(token, options.org)));
  }

  if (sourceOption === "slack" || sourceOption === "all") {
    const creds = resolveSlackCredentials();
    if (creds) {
      sources.push(createCachedSource(createSlackSource(creds, options.slackUsername)));
    } else if (sourceOption === "slack") {
      throw new Error(
        "No Slack credentials found. Either:\n" +
        "  • Run: recap auth slack\n" +
        "  • Set SLACK_TOKEN environment variable"
      );
    }
  }

  return sources;
}

async function resolveUser(sources: CachedSource[], username?: string): Promise<string> {
  if (username) return username;
  const spinner = ora("Resolving username...").start();
  for (const source of sources) {
    try {
      const resolved = await source.resolveUsername();
      spinner.succeed(`User: ${resolved}`);
      return resolved;
    } catch {
      // This source can't resolve username, try next
    }
  }
  spinner.fail("Could not resolve username");
  throw new Error("Could not resolve username. Please provide --username.");
}

function makeFetchProgress(label: string): FetchProgress & { done(data: SourceResult): void } {
  let spinner: ReturnType<typeof ora> | null = null;
  return {
    onCacheHit(dateRange: DateRange) {
      ora().succeed(`${label}: using cache (${dateRange.since} to ${dateRange.until})`);
    },
    onFetching(gaps: DateRange[]) {
      const rangeStr = gaps.map((g) => `${g.since}..${g.until}`).join(", ");
      spinner = ora(`${label}: fetching ${rangeStr}`).start();
    },
    onFetched() {},
    done(data: SourceResult) {
      const parts: string[] = [];
      switch (data.source) {
        case "github":
          if (data.prsCreated.length) parts.push(`${data.prsCreated.length} PRs created`);
          if (data.prsReviewed.length) parts.push(`${data.prsReviewed.length} PRs reviewed`);
          if (data.commits.length) parts.push(`${data.commits.length} commits`);
          break;
        case "slack":
          parts.push(`${data.slack.totalCount} Slack messages`);
          break;
      }
      spinner?.succeed(`${label}: ${parts.join(", ") || "no data"}`);
    },
  };
}

function mergeSourceResults(results: SourceResult[]): ActivityData {
  if (results.length === 0) throw new Error("No data sources produced results");

  const first = results[0]!;
  const merged: ActivityData = {
    source: results.length === 1 ? first.source : "all",
    dateRange: first.dateRange,
    username: first.username,
    prsCreated: [],
    prsReviewed: [],
    commits: [],
  };

  for (const r of results) {
    switch (r.source) {
      case "github":
        merged.prsCreated.push(...r.prsCreated);
        merged.prsReviewed.push(...r.prsReviewed);
        merged.commits.push(...r.commits);
        break;
      case "slack":
        merged.slack = r.slack;
        if (r.slackUsername) merged.slackUsername = r.slackUsername;
        break;
    }
  }

  return merged;
}

async function fetchAll(
  sources: CachedSource[],
  username: string,
  dateRange: DateRange
): Promise<ActivityData> {
  const results: SourceResult[] = [];
  for (const source of sources) {
    const progress = makeFetchProgress(source.name);
    const data = await source.fetch(username, dateRange, progress);
    progress.done(data);
    results.push(data);
  }
  return mergeSourceResults(results);
}

async function fetchAndCache(command: ParsedCommand): Promise<void> {
  const { options } = command;
  const sources = await resolveSources(options);
  const username = await resolveUser(sources, options.username);
  const dateRange = resolveDateRange(options);
  await fetchAll(sources, username, dateRange);
}

async function summarizeFromCache(command: ParsedCommand): Promise<void> {
  const { options } = command;
  const sources = await resolveSources(options);
  const username = options.username!;
  const dateRange = resolveDateRange(options);

  const spinner = ora("Loading cached data...").start();
  const results: SourceResult[] = [];
  for (const source of sources) {
    const data = await source.loadCached(username, dateRange);
    if (data) results.push(data);
  }

  if (results.length === 0) {
    spinner.fail(`No cached data found for ${username}. Run 'recap fetch' first.`);
    process.exit(1);
  }

  const data = mergeSourceResults(results);
  const parts: string[] = [];
  if (data.prsCreated.length) parts.push(`${data.prsCreated.length} PRs created`);
  if (data.prsReviewed.length) parts.push(`${data.prsReviewed.length} PRs reviewed`);
  if (data.commits.length) parts.push(`${data.commits.length} commits`);
  if (data.slack) parts.push(`${data.slack.totalCount} Slack messages`);
  spinner.succeed(`From cache: ${parts.join(", ") || "no data"}`);

  console.log("");
  await outputResults(data, options.format, options.period, options.prompt);
}

async function defaultFlow(command: ParsedCommand): Promise<void> {
  const { options } = command;
  const sources = await resolveSources(options);
  const username = await resolveUser(sources, options.username);
  const dateRange = resolveDateRange(options);

  const data = await fetchAll(sources, username, dateRange);

  console.log("");
  await outputResults(data, options.format, options.period, options.prompt);
}

async function outputResults(
  data: ActivityData,
  format: string,
  period: string,
  prompt?: string
): Promise<void> {
  if (format === "text" || format === "both") {
    console.log(formatStructured(data));
  }

  if (format === "summary" || format === "both") {
    if (format === "both") {
      console.log("\n");
    }
    const summarySpinner = ora("Generating AI summary...").start();
    const summary = await generateSummary(data, period, prompt);
    summarySpinner.succeed("AI Summary");
    console.log("");
    console.log(summary);
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === "auth") {
    return handleAuth(argv);
  }

  if (shouldRunInteractive(argv)) {
    const options = await promptForOptions();
    await defaultFlow({ mode: "default", options });
    return;
  }

  const command = parseArgs(argv);

  switch (command.mode) {
    case "fetch":
      await fetchAndCache(command);
      break;
    case "summarize":
      await summarizeFromCache(command);
      break;
    default:
      await defaultFlow(command);
      break;
  }
}

main().catch((err) => {
  if (err.name === "ExitPromptError") {
    process.exit(0);
  }
  console.error("Error:", err.message);
  process.exit(1);
});
