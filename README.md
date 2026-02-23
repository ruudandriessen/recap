# recap

A CLI tool that generates fair, unbiased engineering reviews from your GitHub activity.

## Overview

Recap pulls your GitHub activity — PRs authored, PRs reviewed, commits, and PR comments — for a given time period and produces both a structured text report and an AI-generated engineering review. The AI summary evaluates your work honestly: what you shipped, quality signals, scope relative to the time period, collaboration patterns, strengths, and areas for improvement.

It handles GitHub's 1000-result search limit by automatically splitting date ranges and paginates through all results. Organization filtering lets you scope reports to a specific org.

## Install

```bash
npm i @clanki/recap -g
bun i @clanki/recap -g
# or your favorite package manager
```

### Prerequisites

- **GitHub auth** (one of the following):
  - The [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated — recap will use it automatically
  - A `GITHUB_TOKEN` environment variable with read access to your repos and PRs
- The [`claude`](https://docs.anthropic.com/en/docs/claude-code) CLI installed locally (used to generate AI summaries)

## Usage

Run `recap` with no arguments to start interactive mode, which walks you through the options:

```bash
recap
```

### Quick roast

Get a comedic roast of your recent GitHub activity:

```bash
recap roast
```

### Full options

```bash
recap [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `-t, --period <period>` | Time period: `week`, `month`, `quarter`, `year`, or `custom` | `week` |
| `-s, --since <date>` | Start date (`YYYY-MM-DD`), required with `--period custom` | — |
| `-u, --until <date>` | End date (`YYYY-MM-DD`), required with `--period custom` | — |
| `-f, --format <format>` | Output format: `text`, `summary`, or `both` | `both` |
| `--username <username>` | GitHub username (defaults to the token owner) | — |
| `-o, --org <org>` | Filter by GitHub organization | — |
| `-p, --prompt <prompt>` | Custom prompt (replaces default review prompt; activity data is appended) | — |
| `-i, --interactive` | Force interactive mode | — |

### Examples

```bash
# Last week's recap (default)
recap

# Last quarter, text only
recap -t quarter -f text

# Custom date range for a specific org
recap -t custom -s 2025-01-01 -u 2025-03-31 -o my-org

# AI summary only for the past month
recap -t month -f summary

# Custom prompt
recap -p "Summarize this developer's work in 3 bullet points."

# Roast your last month of work
recap roast

# Roast scoped to an org
recap roast -o my-org
```
