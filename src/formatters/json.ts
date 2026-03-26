import type { SourceResult } from "../types.ts";

export function formatJson(results: SourceResult[]): string {
  const output = results.map((r) => {
    switch (r.source) {
      case "github":
        return {
          source: "github" as const,
          content: {
            prsCreated: r.prsCreated,
            prsReviewed: r.prsReviewed,
            commits: r.commits,
          },
        };
      case "slack":
        return {
          source: "slack" as const,
          content: r.slack.messages,
        };
    }
  });
  return JSON.stringify(output, null, 2);
}
