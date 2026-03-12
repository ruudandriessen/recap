#!/usr/bin/env node
import ora from "ora";
import { parseArgs, shouldRunInteractive } from "./src/cli.ts";
import { resolveDateRange } from "./src/config.ts";
import { formatStructured } from "./src/formatters/structured.ts";
import { generateSummary } from "./src/formatters/summary.ts";
import { promptForOptions } from "./src/interactive.ts";
import { GitHubSource } from "./src/sources/github.ts";
import { resolveGitHubToken } from "./src/sources/github-token.ts";
import { SlackSource, resolveSlackCredentials } from "./src/sources/slack/index.ts";
import type { ActivityData } from "./src/types.ts";

async function handleAuth(argv: string[]) {
  const subcommand = argv[1];
  if (subcommand === "slack") {
    const action = argv[2]; // undefined, "logout", or "status"
    if (action === "logout") {
      const { handleAuthSlackLogout } = await import("./src/auth.ts");
      return handleAuthSlackLogout();
    }
    if (action === "status") {
      const { handleAuthSlackStatus } = await import("./src/auth.ts");
      return handleAuthSlackStatus();
    }
    const { handleAuthSlack } = await import("./src/auth.ts");
    return handleAuthSlack();
  }
  console.error("Usage: recap auth slack [logout|status]");
  process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === "auth") {
    return handleAuth(argv);
  }

  const options = shouldRunInteractive(argv)
    ? await promptForOptions()
    : parseArgs(argv);

  const dateRange = resolveDateRange(options);
  const source = options.source ?? "all";
  const useGitHub = source === "github" || source === "all";
  const useSlack = source === "slack" || source === "all";

  let data: ActivityData;

  if (useGitHub) {
    const token = await resolveGitHubToken();
    const github = new GitHubSource(token);

    const usernameSpinner = ora("Resolving GitHub username...").start();
    const username = options.username ?? (await github.resolveUsername());
    usernameSpinner.succeed(`User: ${username}`);

    const fetchSpinner = ora(
      `Fetching activity from ${dateRange.since} to ${dateRange.until}...`
    ).start();
    data = await github.fetch(username, dateRange, options.org);
    fetchSpinner.succeed("GitHub activity fetched");
  } else {
    data = {
      source: "slack",
      dateRange,
      username: "unknown",
      prsCreated: [],
      prsReviewed: [],
      commits: [],
    };
  }

  if (useSlack) {
    const creds = resolveSlackCredentials();
    if (creds) {
      const slackSpinner = ora("Fetching Slack messages...").start();
      try {
        const slack = new SlackSource(creds);
        data.slack = await slack.fetchActivity(dateRange);
        slackSpinner.succeed(`Slack: ${data.slack.totalCount} messages fetched`);
      } catch (err: any) {
        slackSpinner.warn(`Slack fetch failed: ${err.message}`);
      }
    } else if (source === "slack") {
      throw new Error(
        "No Slack credentials found. Either:\n" +
        "  • Run: recap auth slack\n" +
        "  • Set SLACK_TOKEN environment variable"
      );
    }
  }

  console.log("");

  if (options.format === "text" || options.format === "both") {
    console.log(formatStructured(data));
  }

  if (options.format === "summary" || options.format === "both") {
    if (options.format === "both") {
      console.log("\n");
    }
    const summarySpinner = ora("Generating AI summary...").start();
    const summary = await generateSummary(data, options.period, options.prompt);
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
