import type { ActivityData } from "../types.ts";
import { formatStructured } from "./structured.ts";

export async function generateSummary(data: ActivityData): Promise<string> {
  const structuredText = formatStructured(data);

  const prompt = `Here is my GitHub activity for the period ${data.dateRange.since} to ${data.dateRange.until}. Please write a concise professional summary (2-4 paragraphs) of what I accomplished, highlighting key contributions, themes, and impact. Group related work together. Keep it suitable for a standup update or weekly report.

${structuredText}

Additionally, here are the specific PR titles and commit messages for more context:

PRs Created:
${data.prsCreated.map((pr) => `- ${pr.title} (#${pr.number}) [${pr.merged ? "merged" : pr.state}]`).join("\n") || "(none)"}

Commits (first 50):
${data.commits.slice(0, 50).map((c) => `- ${c.message} (${c.repo})`).join("\n") || "(none)"}`;

  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  const proc = Bun.spawn(["claude", "-p", prompt], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `claude CLI failed (exit ${exitCode})\nstderr: ${stderr}\nstdout: ${stdout}`
    );
  }

  return stdout.trim();
}
