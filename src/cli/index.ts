import { Command } from "commander";
import { PROMPT_PRESETS } from "./prompts.ts";

export type SourceOption = "github" | "slack" | "all";

export interface CliOptions {
  period: "week" | "month" | "quarter" | "year" | "custom";
  since?: string;
  until?: string;
  format: "text" | "summary" | "both";
  username?: string;
  org?: string;
  prompt?: string;
  source?: SourceOption;
  slackUsername?: string;
}

export type CommandMode = "default" | "fetch" | "summarize";

export interface ParsedCommand {
  mode: CommandMode;
  options: CliOptions;
}

function parseRoastArgs(argv: string[]): ParsedCommand {
  const program = new Command();
  program
    .name("recap roast")
    .description("Roast your GitHub activity from the last month")
    .option("--username <username>", "GitHub username (default: from token)")
    .option("-o, --org <org>", "filter by GitHub organization")
    .option("--slack-username <slackUsername>", "Slack user ID to target, e.g. U01ABC123 (default: token owner)")
    .option(
      "-t, --period <period>",
      "time period: week, month, quarter, year",
      "month"
    );

  program.parse(argv, { from: "user" });
  const opts = program.opts();
  const roastPrompt = PROMPT_PRESETS.find((p) => p.value === "roast")!.prompt;

  return {
    mode: "default",
    options: {
      period: opts.period ?? "month",
      format: "summary",
      username: opts.username,
      org: opts.org,
      prompt: roastPrompt,
      source: "all",
      slackUsername: opts.slackUsername,
    },
  };
}

function parseFetchArgs(argv: string[]): ParsedCommand {
  const program = new Command();
  program
    .name("recap fetch")
    .description("Fetch activity and save to local cache")
    .option(
      "-t, --period <period>",
      "time period: week, month, quarter, year, or custom",
      "week"
    )
    .option("-s, --since <date>", "start date (YYYY-MM-DD) for custom period")
    .option("-u, --until <date>", "end date (YYYY-MM-DD) for custom period")
    .option("--username <username>", "GitHub username (default: from token)")
    .option("-o, --org <org>", "filter by GitHub organization")
    .option("--slack-username <slackUsername>", "Slack user ID to target, e.g. U01ABC123 (default: token owner)")
    .option("--source <source>", "data source: github, slack, or all (default: all)", "all");

  program.parse(argv, { from: "user" });
  const opts = program.opts();
  const period = opts.period as CliOptions["period"];

  if (!["week", "month", "quarter", "year", "custom"].includes(period)) {
    throw new Error(
      `Invalid period: ${period}. Must be week, month, quarter, year, or custom.`
    );
  }

  if (period === "custom" && (!opts.since || !opts.until)) {
    throw new Error("--since and --until are required with --period custom");
  }

  const source = (opts.source ?? "all") as NonNullable<CliOptions["source"]>;
  if (!["github", "slack", "all"].includes(source)) {
    throw new Error(`Invalid source: ${source}. Must be github, slack, or all.`);
  }

  return {
    mode: "fetch",
    options: {
      period,
      since: opts.since,
      until: opts.until,
      format: "text",
      username: opts.username,
      org: opts.org,
      source,
      slackUsername: opts.slackUsername,
    },
  };
}

function parseSummarizeArgs(argv: string[]): ParsedCommand {
  const program = new Command();
  program
    .name("recap summarize")
    .description("Summarize previously cached activity")
    .option(
      "-t, --period <period>",
      "time period: week, month, quarter, year, or custom",
      "week"
    )
    .option("-s, --since <date>", "start date (YYYY-MM-DD) for custom period")
    .option("-u, --until <date>", "end date (YYYY-MM-DD) for custom period")
    .option(
      "-f, --format <format>",
      "output format: text, summary, or both",
      "both"
    )
    .option("--username <username>", "GitHub username (required)")
    .option("--slack-username <slackUsername>", "Slack user ID to target, e.g. U01ABC123 (default: token owner)")
    .option("-p, --prompt <prompt>", "custom prompt (replaces default review prompt; activity data is appended)")
    .option("--source <source>", "data source: github, slack, or all (default: all)", "all");

  program.parse(argv, { from: "user" });
  const opts = program.opts();

  const period = opts.period as CliOptions["period"];
  const format = opts.format as CliOptions["format"];

  if (!["week", "month", "quarter", "year", "custom"].includes(period)) {
    throw new Error(
      `Invalid period: ${period}. Must be week, month, quarter, year, or custom.`
    );
  }

  if (!["text", "summary", "both"].includes(format)) {
    throw new Error(
      `Invalid format: ${format}. Must be text, summary, or both.`
    );
  }

  if (period === "custom" && (!opts.since || !opts.until)) {
    throw new Error("--since and --until are required with --period custom");
  }

  if (!opts.username) {
    throw new Error("--username is required for the summarize command (no API call to resolve it)");
  }

  const source = (opts.source ?? "all") as NonNullable<CliOptions["source"]>;
  if (!["github", "slack", "all"].includes(source)) {
    throw new Error(`Invalid source: ${source}. Must be github, slack, or all.`);
  }

  return {
    mode: "summarize",
    options: {
      period,
      since: opts.since,
      until: opts.until,
      format,
      username: opts.username,
      prompt: opts.prompt,
      source,
      slackUsername: opts.slackUsername,
    },
  };
}

export function parseArgs(argv: string[]): ParsedCommand {
  if (argv[0] === "roast") {
    return parseRoastArgs(argv.slice(1));
  }

  if (argv[0] === "fetch") {
    return parseFetchArgs(argv.slice(1));
  }

  if (argv[0] === "summarize") {
    return parseSummarizeArgs(argv.slice(1));
  }

  const program = new Command();

  program
    .name("recap")
    .description("Recap your GitHub activity for a time period")
    .option(
      "-t, --period <period>",
      "time period: week, month, quarter, year, or custom",
      "week"
    )
    .option("-s, --since <date>", "start date (YYYY-MM-DD) for custom period")
    .option("-u, --until <date>", "end date (YYYY-MM-DD) for custom period")
    .option(
      "-f, --format <format>",
      "output format: text, summary, or both",
      "both"
    )
    .option("--username <username>", "GitHub username (default: from token)")
    .option("-o, --org <org>", "filter by GitHub organization")
    .option("--slack-username <slackUsername>", "Slack user ID to target, e.g. U01ABC123 (default: token owner)")
    .option("-i, --interactive", "run in interactive mode")
    .option("-p, --prompt <prompt>", "custom prompt (replaces default review prompt; activity data is appended)")
    .option("--source <source>", "data source: github, slack, or all (default: all)", "all");

  program.parse(argv, { from: "user" });

  const opts = program.opts();

  const period = opts.period as CliOptions["period"];
  const format = opts.format as CliOptions["format"];

  if (!["week", "month", "quarter", "year", "custom"].includes(period)) {
    throw new Error(
      `Invalid period: ${period}. Must be week, month, quarter, year, or custom.`
    );
  }

  if (!["text", "summary", "both"].includes(format)) {
    throw new Error(
      `Invalid format: ${format}. Must be text, summary, or both.`
    );
  }

  const source = (opts.source ?? "all") as NonNullable<CliOptions["source"]>;
  if (!["github", "slack", "all"].includes(source)) {
    throw new Error(
      `Invalid source: ${source}. Must be github, slack, or all.`
    );
  }

  if (period === "custom" && (!opts.since || !opts.until)) {
    throw new Error("--since and --until are required with --period custom");
  }

  return {
    mode: "default",
    options: {
      period,
      since: opts.since,
      until: opts.until,
      format,
      username: opts.username,
      org: opts.org,
      prompt: opts.prompt,
      source,
      slackUsername: opts.slackUsername,
    },
  };
}

const SUBCOMMANDS: string[] = ["roast", "auth", "fetch", "summarize"];

export function shouldRunInteractive(argv: string[]): boolean {
  if (argv.includes("-i") || argv.includes("--interactive")) {
    return true;
  }
  const first = argv[0];
  if (first !== undefined && SUBCOMMANDS.includes(first)) {
    return false;
  }
  return argv.length === 0;
}
