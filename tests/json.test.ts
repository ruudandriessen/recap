import { test, expect } from "bun:test";
import { formatJson } from "../src/formatters/json.ts";
import type { GitHubSourceResult, SlackSourceResult } from "../src/types.ts";

test("formatJson outputs github source with prs and commits", () => {
  const github: GitHubSourceResult = {
    source: "github",
    dateRange: { since: "2025-02-16", until: "2025-02-23" },
    username: "testuser",
    prsCreated: [
      { title: "Fix bug", url: "https://github.com/org/repo/pull/1", repo: "org/repo", number: 1, state: "closed", merged: true, createdAt: "2025-02-20T00:00:00Z", mergedAt: "2025-02-21T00:00:00Z" },
    ],
    prsReviewed: [],
    commits: [
      { message: "fix", sha: "abc", url: "https://github.com/org/repo/commit/abc", repo: "org/repo", date: "2025-02-20" },
    ],
  };

  const output = JSON.parse(formatJson([github]));
  expect(output).toEqual([
    {
      source: "github",
      content: {
        prsCreated: github.prsCreated,
        prsReviewed: [],
        commits: github.commits,
      },
    },
  ]);
});

test("formatJson outputs slack source with messages", () => {
  const slack: SlackSourceResult = {
    source: "slack",
    dateRange: { since: "2025-02-16", until: "2025-02-23" },
    username: "testuser",
    slackUsername: "testuser",
    slack: {
      messages: [
        { text: "hello", channel: "#general", channelType: "public", timestamp: "2025-02-20T00:00:00Z" },
      ],
      channelBreakdown: { "#general": 1 },
      totalCount: 1,
    },
  };

  const output = JSON.parse(formatJson([slack]));
  expect(output).toEqual([
    {
      source: "slack",
      content: [{ text: "hello", channel: "#general", channelType: "public", timestamp: "2025-02-20T00:00:00Z" }],
    },
  ]);
});

test("formatJson outputs both sources", () => {
  const github: GitHubSourceResult = {
    source: "github",
    dateRange: { since: "2025-02-16", until: "2025-02-23" },
    username: "testuser",
    prsCreated: [],
    prsReviewed: [],
    commits: [],
  };
  const slack: SlackSourceResult = {
    source: "slack",
    dateRange: { since: "2025-02-16", until: "2025-02-23" },
    username: "testuser",
    slackUsername: "testuser",
    slack: { messages: [], channelBreakdown: {}, totalCount: 0 },
  };

  const output = JSON.parse(formatJson([github, slack]));
  expect(output).toHaveLength(2);
  expect(output[0].source).toBe("github");
  expect(output[1].source).toBe("slack");
});
