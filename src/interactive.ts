import { select, input } from "@inquirer/prompts";
import type { CliOptions } from "./types.ts";
import { PROMPT_PRESETS } from "./prompts.ts";

export async function promptForOptions(): Promise<CliOptions> {
  const period = await select({
    message: "Time period:",
    choices: [
      { name: "Past week", value: "week" as const },
      { name: "Past month", value: "month" as const },
      { name: "Past quarter", value: "quarter" as const },
      { name: "Past year", value: "year" as const },
      { name: "Custom date range", value: "custom" as const },
    ],
  });

  let since: string | undefined;
  let until: string | undefined;

  if (period === "custom") {
    since = await input({
      message: "Start date (YYYY-MM-DD):",
      validate: (v) =>
        /^\d{4}-\d{2}-\d{2}$/.test(v) || "Please enter a valid date (YYYY-MM-DD)",
    });
    until = await input({
      message: "End date (YYYY-MM-DD):",
      validate: (v) =>
        /^\d{4}-\d{2}-\d{2}$/.test(v) || "Please enter a valid date (YYYY-MM-DD)",
    });
  }

  const format = await select({
    message: "Output format:",
    choices: [
      { name: "Structured text", value: "text" as const },
      { name: "AI summary", value: "summary" as const },
      { name: "Both", value: "both" as const },
    ],
  });

  let prompt: string | undefined;

  if (format === "summary" || format === "both") {
    const presetChoices = PROMPT_PRESETS.map((p) => ({
      name: p.name,
      value: p.value,
    }));

    const promptChoice = await select({
      message: "Prompt style:",
      choices: [...presetChoices, { name: "Custom prompt", value: "custom" }],
    });

    if (promptChoice === "custom") {
      prompt = await input({
        message: "Enter your custom prompt:",
        validate: (v) => v.trim().length > 0 || "Prompt cannot be empty",
      });
    } else {
      const preset = PROMPT_PRESETS.find((p) => p.value === promptChoice);
      if (preset) {
        prompt = preset.prompt;
      }
    }
  }

  const username =
    (await input({
      message: "GitHub username (leave empty for token owner):",
    })) || undefined;

  const org =
    (await input({
      message: "Filter by organization (leave empty for all):",
    })) || undefined;

  return { period, since, until, format, username, org, prompt };
}
