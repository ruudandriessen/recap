import type { ActivityData } from "../types.ts";
import { formatStructured } from "./structured.ts";

export async function generateSummary(data: ActivityData): Promise<string> {
  const structuredText = formatStructured(data);

  const prompt = `Here is my GitHub activity for the period ${data.dateRange.since} to ${data.dateRange.until}. Please write a professional performance review summary (3-5 paragraphs) of what I accomplished. Highlight key contributions, themes, impact, and areas of ownership. Group related work together into narratives. Call out cross-team collaboration, technical leadership, and significant deliverables. Keep it suitable for a performance review or promotion packet.

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
