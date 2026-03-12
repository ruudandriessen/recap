import { input } from "@inquirer/prompts";
import { SlackApi } from "../sources/slack/api.ts";
import { saveSlackCredentials, clearSlackCredentials, loadCachedCredentials } from "../sources/slack/token.ts";

// One-liner to extract Slack token from browser console
const EXTRACT_SNIPPET = `JSON.parse(localStorage.localConfig_v2).teams[Object.keys(JSON.parse(localStorage.localConfig_v2).teams)[0]].token`;

export async function handleAuthSlack(): Promise<void> {
  console.log("\nSlack Authentication Setup");
  console.log("─".repeat(40));
  console.log("\n1. Open your Slack workspace in a browser (not the desktop app)");
  console.log("2. Open DevTools (F12) and paste this in the Console:\n");
  console.log(`   ${EXTRACT_SNIPPET}\n`);
  console.log("3. Copy the token it prints (starts with xoxc-)\n");

  const token = await input({
    message: "Slack token:",
    validate: (v) => {
      const trimmed = v.trim();
      if (!trimmed) return "Token is required";
      if (!trimmed.startsWith("xoxc-") && !trimmed.startsWith("xoxp-") && !trimmed.startsWith("xoxb-")) {
        return "Token should start with xoxc-, xoxp-, or xoxb-";
      }
      return true;
    },
  });

  let cookie: string | undefined;
  if (token.trim().startsWith("xoxc-")) {
    console.log("\n  Now grab the session cookie:");
    console.log("  DevTools → Application tab → Cookies → your workspace URL");
    console.log("  Find the \"d\" cookie and copy its value\n");
    cookie = await input({
      message: "Cookie \"d\" value:",
      validate: (v) => v.trim().length > 0 || "Cookie is required for xoxc- tokens",
    });
  }

  const creds = { token: token.trim(), cookie: cookie?.trim() };

  // Verify the token works
  console.log("\nVerifying token...");
  try {
    const api = new SlackApi(creds.token, creds.cookie);
    const { user } = await api.authTest();
    saveSlackCredentials(creds);
    console.log(`\n✓ Authenticated as @${user}`);
    console.log(`  Credentials saved to ~/.recap/config/slack.json\n`);
  } catch (err: any) {
    console.error(`\n✗ Authentication failed: ${err.message}`);
    console.error("  Please check your token and try again.\n");
    process.exit(1);
  }
}

export async function handleAuthSlackLogout(): Promise<void> {
  clearSlackCredentials();
  console.log("Slack credentials removed.");
}

export async function handleAuthSlackStatus(): Promise<void> {
  const creds = loadCachedCredentials();
  if (!creds) {
    console.log("No Slack credentials stored. Run: recap auth slack");
    return;
  }

  try {
    const api = new SlackApi(creds.token, creds.cookie);
    const { user } = await api.authTest();
    console.log(`Authenticated as @${user}`);
    console.log(`Token type: ${creds.token.slice(0, 4)}...`);
  } catch {
    console.log("Stored credentials are invalid or expired. Run: recap auth slack");
  }
}
