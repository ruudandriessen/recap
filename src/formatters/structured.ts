import type { ActivityData } from "../types.ts";

export function formatStructured(data: ActivityData): string {
  const lines: string[] = [];

  lines.push("=== GitHub Activity Recap ===");
  lines.push(`Period: ${data.dateRange.since} to ${data.dateRange.until}`);
  lines.push(`User: ${data.username}`);
  lines.push("");

  // PRs Created
  const merged = data.prsCreated.filter((pr) => pr.merged);
  const open = data.prsCreated.filter((pr) => !pr.merged && pr.state === "open");
  const closed = data.prsCreated.filter((pr) => !pr.merged && pr.state === "closed");

  lines.push(`--- Pull Requests Created (${data.prsCreated.length}) ---`);
  if (data.prsCreated.length === 0) {
    lines.push("  (none)");
  } else {
    for (const pr of data.prsCreated) {
      const tag = pr.merged ? "merged" : pr.state;
      lines.push(`  [${tag}] ${pr.title} (#${pr.number}) - ${pr.repo}`);
    }
  }
  lines.push("");

  // PRs Reviewed
  lines.push(`--- Pull Requests Reviewed (${data.prsReviewed.length}) ---`);
  if (data.prsReviewed.length === 0) {
    lines.push("  (none)");
  } else {
    for (const pr of data.prsReviewed) {
      lines.push(`  ${pr.repo} #${pr.number} - ${pr.title}`);
    }
  }
  lines.push("");

  // Commits
  lines.push(`--- Commits (${data.commits.length}) ---`);
  if (data.commits.length === 0) {
    lines.push("  (none)");
  } else {
    // Group by repo
    const byRepo = new Map<string, number>();
    for (const commit of data.commits) {
      byRepo.set(commit.repo, (byRepo.get(commit.repo) ?? 0) + 1);
    }
    lines.push("  By repository:");
    for (const [repo, count] of [...byRepo.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`    ${repo} (${count} commit${count !== 1 ? "s" : ""})`);
    }
  }
  lines.push("");

  // PR Comments
  lines.push(
    `--- PR Comments (${data.prComments.length} PR${data.prComments.length !== 1 ? "s" : ""} commented on) ---`
  );
  if (data.prComments.length === 0) {
    lines.push("  (none)");
  } else {
    for (const c of data.prComments) {
      lines.push(`  ${c.repo} #${c.prNumber} - ${c.prTitle}`);
    }
  }
  lines.push("");

  // Summary counts
  lines.push("--- Summary ---");
  lines.push(
    `  ${data.prsCreated.length} PR${data.prsCreated.length !== 1 ? "s" : ""} created (${merged.length} merged, ${open.length} open, ${closed.length} closed)`
  );
  lines.push(
    `  ${data.prsReviewed.length} PR${data.prsReviewed.length !== 1 ? "s" : ""} reviewed`
  );
  const repoCount = new Set(data.commits.map((c) => c.repo)).size;
  lines.push(
    `  ${data.commits.length} commit${data.commits.length !== 1 ? "s" : ""} across ${repoCount} repo${repoCount !== 1 ? "s" : ""}`
  );
  lines.push(
    `  ${data.prComments.length} PR${data.prComments.length !== 1 ? "s" : ""} commented on`
  );

  return lines.join("\n");
}
