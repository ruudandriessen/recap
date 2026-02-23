# recap

A CLI tool that generates fair, unbiased engineering reviews from your GitHub activity.

## Overview

Recap pulls your GitHub activity — PRs authored, PRs reviewed, commits, and PR comments — for a given time period and produces both a structured text report and an AI-generated engineering review. The AI summary evaluates your work honestly: what you shipped, quality signals, scope relative to the time period, collaboration patterns, strengths, and areas for improvement.

It handles GitHub's 1000-result search limit by automatically splitting date ranges and paginates through all results. Organization filtering lets you scope reports to a specific org.

## Setup

```bash
bun install
```

Requires a `GITHUB_TOKEN` environment variable with read access to your repos and PRs.

## Usage

```bash
bun run index.ts [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-t, --period <period>` | Time period: `week`, `month`, `quarter`, `year`, or `custom` | `week` |
| `-s, --since <date>` | Start date (`YYYY-MM-DD`), required with `--period custom` | — |
| `-u, --until <date>` | End date (`YYYY-MM-DD`), required with `--period custom` | — |
| `-f, --format <format>` | Output format: `text`, `summary`, or `both` | `both` |
| `--username <username>` | GitHub username (defaults to the token owner) | — |
| `-o, --org <org>` | Filter by GitHub organization | — |
| `-p, --prompt <prompt>` | Custom prompt (replaces default review prompt; activity data is appended) | — |

### Examples

```bash
# Last week's recap (default)
bun run index.ts

# Last quarter, text only
bun run index.ts -t quarter -f text

# Custom date range for a specific org
bun run index.ts -t custom -s 2025-01-01 -u 2025-03-31 -o my-org

# AI summary only for the past month
bun run index.ts -t month -f summary

# Custom prompt
bun run index.ts -p "Summarize this developer's work in 3 bullet points."
```
