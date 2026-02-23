import type { ActivityData } from "../types.ts";
import { formatStructured } from "./structured.ts";

export async function generateSummary(
  data: ActivityData,
  period: string
): Promise<string> {
  const structuredText = formatStructured(data);

  const prompt = `You are an engineering manager reviewing a developer's GitHub activity. Below is ${data.username}'s GitHub activity for ${period === "custom" ? "a custom period" : `the past ${period}`} (${data.dateRange.since} to ${data.dateRange.until}).

Provide an unbiased, honest engineering review of this person's work. This should NOT be a simple recap — it should be a fair evaluation. Consider that this represents ${period === "custom" ? "a custom time period" : `one ${period}`} of output.

Your review should cover:
1. **What they worked on** — briefly summarize the themes and areas of contribution.
2. **Quality signals** — based on PR titles, commit messages, review activity, and volume, assess the quality and thoughtfulness of their work. Note any red flags (e.g. sloppy commit messages, no reviews, only trivial changes) or green flags (e.g. meaningful reviews, well-scoped PRs, cross-cutting work).
3. **Scope & impact** — evaluate the scope of the work relative to the time period. Is this a reasonable amount of output? Above or below expectations?
4. **Collaboration** — assess their review activity and engagement with others' work.
5. **Pros** — list specific strengths demonstrated in this period.
6. **Areas for improvement** — list concrete areas where they could do better.
7. **Estimated engineer level** — based solely on the evidence in this activity, estimate what level of engineer this person appears to be (e.g. junior, mid-level, senior, staff). Explain your reasoning.

Be direct and honest. Don't sugarcoat, but be fair. If there's not enough data to assess something, say so.

${structuredText}

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
