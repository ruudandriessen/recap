import { execFile } from "node:child_process";
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

  const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile("claude", ["-p", prompt], { env, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(
          `claude CLI failed (exit ${error.code})\nstderr: ${stderr}\nstdout: ${stdout}`
        ));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });

  return stdout.trim();
}
