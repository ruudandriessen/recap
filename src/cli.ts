import { Command } from "commander";
import type { CliOptions } from "./types.ts";
import { PROMPT_PRESETS } from "./prompts.ts";

function parseRoastArgs(argv: string[]): CliOptions {
  const program = new Command();
  program
    .name("recap roast")
    .description("Roast your GitHub activity from the last month")
    .option("--username <username>", "GitHub username (default: from token)")
    .option("-o, --org <org>", "filter by GitHub organization")
    .option(
      "-t, --period <period>",
      "time period: week, month, quarter, year",
      "month"
    );

  program.parse(argv, { from: "user" });
  const opts = program.opts();
  const roastPrompt = PROMPT_PRESETS.find((p) => p.value === "roast")!.prompt;

  return {
    period: opts.period ?? "month",
    format: "summary",
    username: opts.username,
    org: opts.org,
    prompt: roastPrompt,
  };
}

export function parseArgs(argv: string[]): CliOptions {
  if (argv[0] === "roast") {
    return parseRoastArgs(argv.slice(1));
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
    .option("-i, --interactive", "run in interactive mode")
    .option("-p, --prompt <prompt>", "custom prompt (replaces default review prompt; activity data is appended)");

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

  return {
    period,
    since: opts.since,
    until: opts.until,
    format,
    username: opts.username,
    org: opts.org,
    prompt: opts.prompt,
  };
}

const SUBCOMMANDS: string[] = ["roast"];

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
