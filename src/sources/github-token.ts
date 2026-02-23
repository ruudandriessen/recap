import { execFileSync } from "node:child_process";

/**
 * Resolves a GitHub token from environment variables or the GitHub CLI.
 * Checks in order: GITHUB_TOKEN, GH_TOKEN, `gh auth token`.
 */
export async function resolveGitHubToken(): Promise<string> {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;

  try {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (token) return token;
  } catch {
    // gh CLI not installed or failed
  }

  throw new Error(
    "No GitHub token found. Either:\n" +
      "  • Set GITHUB_TOKEN or GH_TOKEN environment variable, or\n" +
      "  • Install the GitHub CLI (gh) and run: gh auth login"
  );
}
