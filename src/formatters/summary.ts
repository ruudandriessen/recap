import type { ActivityData } from "../types.ts";
import { formatStructured } from "./structured.ts";
import { PROMPT_PRESETS } from "../prompts.ts";

const DEFAULT_PROMPT = PROMPT_PRESETS.find((p) => p.value === "unbiased")!.prompt;

export async function generateSummary(
  data: ActivityData,
  period: string,
  customPrompt?: string
): Promise<string> {
  const structuredText = formatStructured(data);

  const activityContext = `
Username: ${data.username}
Period: ${period === "custom" ? "custom period" : `past ${period}`} (${data.dateRange.since} to ${data.dateRange.until})

${structuredText}

PRs Created:
${data.prsCreated.map((pr) => `- ${pr.title} (#${pr.number}) [${pr.merged ? "merged" : pr.state}]`).join("\n") || "(none)"}

Commits (first 50):
${data.commits.slice(0, 50).map((c) => `- ${c.message} (${c.repo})`).join("\n") || "(none)"}`;

  const prompt = `${customPrompt ?? DEFAULT_PROMPT}\n\n${activityContext}`;

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
