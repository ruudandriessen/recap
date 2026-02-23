import { Command } from "commander";
import type { CliOptions } from "./types.ts";

export function parseArgs(argv: string[]): CliOptions {
  const program = new Command();

  program
    .name("recap")
    .description("Recap your GitHub activity for a time period")
    .option(
      "-p, --period <period>",
      "time period: week, month, quarter, year, or custom",
      "week"
    )
    .option("-s, --since <date>", "start date (YYYY-MM-DD) for custom period")
    .option("-u, --until <date>", "end date (YYYY-MM-DD) for custom period")
    .option(
      "-f, --format <format>",
      "output format: text, summary, or both",
      "text"
    )
    .option("--username <username>", "GitHub username (default: from token)")
    .option("-o, --org <org>", "filter by GitHub organization");

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

  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  return {
    period,
    since: opts.since,
    until: opts.until,
    format,
    username: opts.username,
    org: opts.org,
  };
}
