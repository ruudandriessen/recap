const SLACK_API = "https://slack.com/api";

export class SlackApi {
  private token: string;
  private cookie?: string;

  constructor(token: string, cookie?: string) {
    this.token = token;
    this.cookie = cookie;
  }

  async authTest(): Promise<{ user_id: string; user: string }> {
    const data = await this.request("auth.test");
    return { user_id: data.user_id, user: data.user };
  }

  async searchMessages(
    query: string,
    page: number = 1,
    count: number = 100
  ): Promise<{
    messages: { matches: any[]; total: number; paging: { pages: number; page: number } };
  }> {
    return this.request("search.messages", { query, page: String(page), count: String(count) });
  }

  async conversationsList(
    types: string = "public_channel,private_channel,mpim,im",
    cursor?: string
  ): Promise<{ channels: any[]; response_metadata: { next_cursor: string } }> {
    const params: Record<string, string> = {
      types,
      limit: "200",
      exclude_archived: "true",
    };
    if (cursor) params.cursor = cursor;
    return this.request("conversations.list", params);
  }

  async conversationsHistory(
    channel: string,
    oldest: string,
    latest: string,
    cursor?: string
  ): Promise<{ messages: any[]; has_more: boolean; response_metadata?: { next_cursor: string } }> {
    const params: Record<string, string> = {
      channel,
      oldest,
      latest,
      limit: "200",
    };
    if (cursor) params.cursor = cursor;
    return this.request("conversations.history", params);
  }

  private async request(method: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(`${SLACK_API}/${method}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    };
    if (this.cookie) {
      headers.Cookie = `d=${this.cookie}`;
    }

    const res = await fetch(url.toString(), { headers });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") || "5");
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.request(method, params);
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Slack API error ${res.status}: ${body}`);
    }

    const data: any = await res.json();
    if (!data.ok) {
      const err = new Error(`Slack API error: ${data.error} (method: ${method})`) as Error & { slackError: string };
      err.slackError = data.error;
      throw err;
    }

    return data;
  }
}
