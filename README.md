# recap

Generate AI-powered reviews (or roasts) of your engineering activity from GitHub and Slack.

## Quick start

```bash
bunx @clanki/recap roast
# or
npx @clanki/recap roast
```

## Prerequisites

- **GitHub**: [GitHub CLI](https://cli.github.com/) (`gh`) authenticated, or a `GITHUB_TOKEN`/`GH_TOKEN` env var
- **AI**: The [`claude`](https://docs.anthropic.com/en/docs/claude-code) or [`codex`](https://github.com/openai/codex) CLI installed locally

## Install

```bash
npm i @clanki/recap -g
# or
bun i @clanki/recap -g
```

## Usage

```bash
recap              # interactive mode
recap roast        # comedic roast of recent activity
recap fetch        # fetch and cache activity data
recap summarize    # summarize previously cached data
```

Run `recap --help` for the full list of flags.

## Slack

To include Slack activity in your recaps, authenticate with:

```bash
recap auth slack         # interactive setup — guides you through getting a token
recap auth slack status  # check if you're authenticated
recap auth slack logout  # remove stored credentials
```

Credentials are saved to `~/.recap/config/slack.json`.
