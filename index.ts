#!/usr/bin/env bun
import ora from "ora";
import { parseArgs, shouldRunInteractive } from "./src/cli.ts";
import { resolveDateRange } from "./src/config.ts";
import { formatStructured } from "./src/formatters/structured.ts";
import { generateSummary } from "./src/formatters/summary.ts";
import { promptForOptions } from "./src/interactive.ts";
import { GitHubSource } from "./src/sources/github.ts";

async function main() {
  const argv = process.argv.slice(2);
  const options = shouldRunInteractive(argv)
    ? await promptForOptions()
    : parseArgs(argv);

  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  const dateRange = resolveDateRange(options);

  const github = new GitHubSource(process.env.GITHUB_TOKEN!);

  const usernameSpinner = ora("Resolving GitHub username...").start();
  const username = options.username ?? (await github.resolveUsername());
  usernameSpinner.succeed(`User: ${username}`);

  const fetchSpinner = ora(
    `Fetching activity from ${dateRange.since} to ${dateRange.until}...`
  ).start();
  const data = await github.fetch(username, dateRange, options.org);
  fetchSpinner.succeed("Activity fetched");

  console.log("");

  if (options.format === "text" || options.format === "both") {
    console.log(formatStructured(data));
  }

  if (options.format === "summary" || options.format === "both") {
    if (options.format === "both") {
      console.log("\n");
    }
    const summarySpinner = ora("Generating AI summary...").start();
    const summary = await generateSummary(data, options.period);
    summarySpinner.succeed("AI Summary");
    console.log("");
    console.log(summary);
  }
}

main().catch((err) => {
  if (err.name === "ExitPromptError") {
    process.exit(0);
  }
  console.error("Error:", err.message);
  process.exit(1);
});
