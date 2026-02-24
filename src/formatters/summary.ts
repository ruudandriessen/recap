import { spawn } from "node:child_process";
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

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("claude", ["-p"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      reject(new Error(`Failed to start claude CLI: ${err.message}`));
    });

    child.on("close", (code) => {
      const out = Buffer.concat(chunks).toString();
      const err = Buffer.concat(stderrChunks).toString();
      if (code !== 0) {
        reject(new Error(
          `claude CLI failed (exit ${code})\nstderr: ${err}\nstdout: ${out}`
        ));
      } else {
        resolve(out);
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });

  return stdout.trim();
}
