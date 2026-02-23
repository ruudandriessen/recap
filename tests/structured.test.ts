import { test, expect } from "bun:test";
import { formatStructured } from "../src/formatters/structured.ts";
import type { ActivityData } from "../src/types.ts";

const emptyData: ActivityData = {
  source: "github",
  dateRange: { since: "2025-02-16", until: "2025-02-23" },
  username: "testuser",
  prsCreated: [],
  prsReviewed: [],
  commits: [],
  prComments: [],
};

test("formatStructured shows header with period and user", () => {
  const output = formatStructured(emptyData);
  expect(output).toContain("GitHub Activity Recap");
  expect(output).toContain("2025-02-16 to 2025-02-23");
  expect(output).toContain("testuser");
});

test("formatStructured shows (none) for empty sections", () => {
  const output = formatStructured(emptyData);
  expect(output).toContain("(none)");
});

test("formatStructured shows PRs created with status tags", () => {
  const data: ActivityData = {
    ...emptyData,
    prsCreated: [
      {
        title: "Fix auth bug",
        url: "https://github.com/org/repo/pull/1",
        repo: "org/repo",
        number: 1,
        state: "closed",
        merged: true,
        createdAt: "2025-02-20T00:00:00Z",
        mergedAt: "2025-02-21T00:00:00Z",
      },
      {
        title: "Add feature",
        url: "https://github.com/org/repo/pull/2",
        repo: "org/repo",
        number: 2,
        state: "open",
        merged: false,
        createdAt: "2025-02-22T00:00:00Z",
        mergedAt: null,
      },
    ],
  };
  const output = formatStructured(data);
  expect(output).toContain("[merged] Fix auth bug (#1) - org/repo");
  expect(output).toContain("[open] Add feature (#2) - org/repo");
  expect(output).toContain("Pull Requests Created (2)");
});

test("formatStructured groups commits by repo", () => {
  const data: ActivityData = {
    ...emptyData,
    commits: [
      { message: "fix bug", sha: "abc", url: "", repo: "org/repo-a", date: "" },
      { message: "update", sha: "def", url: "", repo: "org/repo-a", date: "" },
      { message: "init", sha: "ghi", url: "", repo: "org/repo-b", date: "" },
    ],
  };
  const output = formatStructured(data);
  expect(output).toContain("org/repo-a (2 commits)");
  expect(output).toContain("org/repo-b (1 commit)");
});

test("formatStructured shows summary counts", () => {
  const data: ActivityData = {
    ...emptyData,
    prsCreated: [
      {
        title: "PR",
        url: "",
        repo: "org/repo",
        number: 1,
        state: "closed",
        merged: true,
        createdAt: "",
        mergedAt: "",
      },
    ],
    prsReviewed: [
      {
        title: "PR2",
        url: "",
        repo: "org/repo",
        number: 2,
        state: "closed",
        merged: true,
        createdAt: "",
        mergedAt: "",
      },
    ],
    commits: [
      { message: "msg", sha: "a", url: "", repo: "org/repo", date: "" },
    ],
    prComments: [
      { prTitle: "PR3", prUrl: "", prNumber: 3, repo: "org/repo" },
    ],
  };
  const output = formatStructured(data);
  expect(output).toContain("1 PR created (1 merged, 0 open, 0 closed)");
  expect(output).toContain("1 PR reviewed");
  expect(output).toContain("1 commit across 1 repo");
  expect(output).toContain("1 PR commented on");
});
