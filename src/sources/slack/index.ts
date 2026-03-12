import type { ActivityData, CacheKey, DataSource, DateRange, SlackActivity, SlackMessage } from "../../types.ts";
import { SlackApi } from "./api.ts";
import type { SlackCredentials } from "./token.ts";

export { resolveSlackCredentials, saveSlackCredentials, clearSlackCredentials } from "./token.ts";
export type { SlackCredentials } from "./token.ts";

type ChannelInfo = {
  name: string;
  type: SlackMessage["channelType"];
};

export interface SlackCacheKey extends CacheKey {
  source: "slack";
  username: string;
}

export function createSlackSource(creds: SlackCredentials) {
  const api = new SlackApi(creds.token, creds.cookie);

  async function buildChannelMap(): Promise<Map<string, ChannelInfo>> {
    const map = new Map<string, ChannelInfo>();
    let cursor: string | undefined;

    do {
      const res = await api.conversationsList(
        "public_channel,private_channel",
        cursor
      );
      for (const ch of res.channels) {
        map.set(ch.id, {
          name: ch.name ?? ch.id,
          type: resolveChannelType(ch),
        });
      }
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return map;
  }

  async function fetchViaSearch(
    userId: string,
    dateRange: DateRange,
  ): Promise<SlackMessage[]> {
    const query = `from:<@${userId}> after:${dateRange.since} before:${dateRange.until}`;
    const messages: SlackMessage[] = [];
    let page = 1;

    while (true) {
      const res = await api.searchMessages(query, page, 100);
      const matches = res.messages.matches;

      for (const match of matches) {
        const ch = match.channel;
        // Skip DMs and group DMs — only include channels
        if (ch?.is_im || ch?.is_mpim) continue;
        messages.push({
          text: match.text ?? "",
          channel: ch?.name ?? ch?.id ?? "unknown",
          channelType: ch?.is_private ? "private" : "public",
          timestamp: slackTsToIso(match.ts),
          permalink: match.permalink,
        });
      }

      if (page >= res.messages.paging.pages) break;
      page++;
    }

    return messages;
  }

  async function fetchViaHistory(
    userId: string,
    dateRange: DateRange,
    channelMap: Map<string, ChannelInfo>
  ): Promise<SlackMessage[]> {
    const oldest = String(new Date(dateRange.since).getTime() / 1000);
    const latest = String(new Date(dateRange.until + "T23:59:59Z").getTime() / 1000);
    const messages: SlackMessage[] = [];

    for (const [channelId, info] of channelMap) {
      if (info.type === "dm" || info.type === "group_dm") continue;
      let cursor: string | undefined;
      do {
        try {
          const res = await api.conversationsHistory(channelId, oldest, latest, cursor);
          for (const msg of res.messages) {
            if (msg.user === userId && msg.type === "message" && !msg.subtype) {
              messages.push({
                text: msg.text ?? "",
                channel: info.name,
                channelType: info.type,
                timestamp: slackTsToIso(msg.ts),
              });
            }
          }
          cursor = res.has_more ? res.response_metadata?.next_cursor : undefined;
        } catch {
          // Skip channels we can't access (e.g. no permission)
          break;
        }
      } while (cursor);
    }

    return messages;
  }

  async function fetchActivity(dateRange: DateRange): Promise<SlackActivity> {
    const { user_id: userId } = await api.authTest();

    let messages: SlackMessage[];
    try {
      // Try search first — doesn't need conversations.list (works on enterprise)
      messages = await fetchViaSearch(userId, dateRange);
    } catch (err: any) {
      if (err.slackError === "missing_scope" || err.slackError === "not_allowed_token_type") {
        // search:read not available, fall back to per-channel history
        const channelMap = await buildChannelMap();
        messages = await fetchViaHistory(userId, dateRange, channelMap);
      } else {
        throw err;
      }
    }

    const channelBreakdown: Record<string, number> = {};
    for (const msg of messages) {
      channelBreakdown[msg.channel] = (channelBreakdown[msg.channel] ?? 0) + 1;
    }

    return {
      messages,
      channelBreakdown,
      totalCount: messages.length,
    };
  }

  return {
    name: "slack",
    fetchActivity,

    makeCacheKey(username: string): SlackCacheKey {
      return { source: "slack", username };
    },

    async resolveUsername(): Promise<string> {
      const { user } = await api.authTest();
      return user;
    },

    async fetch(key: SlackCacheKey, dateRange: DateRange): Promise<ActivityData> {
      const slack = await fetchActivity(dateRange);
      return {
        source: "slack",
        dateRange,
        username: key.username,
        prsCreated: [],
        prsReviewed: [],
        commits: [],
        slack,
      };
    },
  } satisfies DataSource<SlackCacheKey> & { fetchActivity: typeof fetchActivity };
}

function resolveChannelType(channel: any): SlackMessage["channelType"] {
  if (channel.is_im) return "dm";
  if (channel.is_mpim) return "group_dm";
  if (channel.is_private) return "private";
  return "public";
}

function slackTsToIso(ts: string): string {
  const seconds = parseFloat(ts);
  return new Date(seconds * 1000).toISOString();
}
