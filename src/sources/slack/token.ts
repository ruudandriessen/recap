import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SlackCredentials {
  token: string;
  cookie?: string; // required for xoxc-* tokens
}

const CONFIG_DIR = join(homedir(), ".recap", "config");
const CREDENTIALS_FILE = join(CONFIG_DIR, "slack.json");

export function resolveSlackCredentials(): SlackCredentials | undefined {
  // 1. Env vars take priority
  if (process.env.SLACK_TOKEN) {
    return {
      token: process.env.SLACK_TOKEN,
      cookie: process.env.SLACK_COOKIE,
    };
  }

  // 2. Check cached credentials
  return loadCachedCredentials();
}

export function saveSlackCredentials(creds: SlackCredentials): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), "utf-8");
}

export function loadCachedCredentials(): SlackCredentials | undefined {
  try {
    const data = readFileSync(CREDENTIALS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed.token) return parsed;
  } catch {
    // File doesn't exist or is invalid
  }
  return undefined;
}

export function clearSlackCredentials(): void {
  try {
    unlinkSync(CREDENTIALS_FILE);
  } catch {
    // Already gone
  }
}
