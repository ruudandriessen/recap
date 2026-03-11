import { spawn } from "node:child_process";
import type { ActivityData } from "../types.ts";
import { formatStructured } from "./structured.ts";
import { PROMPT_PRESETS } from "../prompts.ts";

const DEFAULT_PROMPT = PROMPT_PRESETS.find((p) => p.value === "unbiased")!.prompt;

function spawnCli(
  cmd: string,
  args: string[],
  prompt: string,
  env: NodeJS.ProcessEnv
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      const out = Buffer.concat(chunks).toString();
      const err = Buffer.concat(stderrChunks).toString();
      if (code !== 0) {
        reject(new Error(`${cmd} CLI failed (exit ${code})\nstderr: ${err}\nstdout: ${out}`));
      } else {
        resolve(out);
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function runWithFallback(prompt: string, env: NodeJS.ProcessEnv): Promise<string> {
  try {
    return await spawnCli("claude", ["-p"], prompt, env);
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      throw new Error(`Failed to run claude CLI: ${err.message}`);
    }
  }

  // claude not found, fall back to codex
  try {
    return await spawnCli("codex", ["-q"], prompt, env);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(
        "No AI CLI found. Please install one of:\n" +
          "  • claude: https://docs.anthropic.com/en/docs/claude-code\n" +
          "  • codex: https://github.com/openai/codex"
      );
    }
    throw new Error(`Failed to run codex CLI: ${err.message}`);
  }
}

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

  const stdout = await runWithFallback(prompt, env);

  return stdout.trim();
}
