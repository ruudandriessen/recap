import { test, expect, mock, beforeEach } from "bun:test";
import { createSlackSource } from "../src/sources/slack/index.ts";

// Mock fetch globally
const mockFetch = mock(() => Promise.resolve(new Response()));

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as any;
});

function jsonResponse(data: any): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    headers: { "Content-Type": "application/json" },
  });
}

const authTestResponse = { user_id: "U123", user: "testuser" };

const conversationsListResponse = {
  channels: [
    { id: "C001", name: "general", is_im: false, is_mpim: false, is_private: false },
    { id: "C002", name: "engineering", is_im: false, is_mpim: false, is_private: false },
    { id: "D001", name: "D001", is_im: true, is_mpim: false, is_private: false },
  ],
  response_metadata: { next_cursor: "" },
};

test("fetchActivity uses search.messages when available", async () => {
  const searchResponse = {
    messages: {
      matches: [
        { text: "hello world", channel: { id: "C001", name: "general" }, ts: "1700000000.000000", permalink: "https://slack.com/msg/1" },
        { text: "fix deployed", channel: { id: "C002", name: "engineering" }, ts: "1700000100.000000", permalink: "https://slack.com/msg/2" },
      ],
      total: 2,
      paging: { pages: 1, page: 1 },
    },
  };

  mockFetch
    .mockResolvedValueOnce(jsonResponse(authTestResponse))
    .mockResolvedValueOnce(jsonResponse(searchResponse));

  const source = createSlackSource({ token: "xoxp-test-token" });
  const result = await source.fetchActivity({ since: "2023-11-14", until: "2023-11-15" });

  expect(result.totalCount).toBe(2);
  expect(result.messages).toHaveLength(2);
  expect(result.messages[0]!.text).toBe("hello world");
  expect(result.messages[0]!.channel).toBe("general");
  expect(result.messages[0]!.channelType).toBe("public");
  expect(result.messages[1]!.text).toBe("fix deployed");
  expect(result.channelBreakdown).toEqual({ general: 1, engineering: 1 });
});

test("fetchActivity falls back to conversations.history on missing_scope", async () => {
  const historyResponseGeneral = {
    messages: [
      { user: "U123", type: "message", text: "bot msg", ts: "1700000000.000000" },
      { user: "U999", type: "message", text: "other user", ts: "1700000050.000000" },
    ],
    has_more: false,
  };
  const historyResponseEngineering = {
    messages: [],
    has_more: false,
  };

  mockFetch
    .mockResolvedValueOnce(jsonResponse(authTestResponse))
    // search.messages fails with missing_scope
    .mockResolvedValueOnce(errorResponse("missing_scope"))
    // falls back: conversations.list (DMs excluded) then per-channel history
    .mockResolvedValueOnce(jsonResponse(conversationsListResponse))
    .mockResolvedValueOnce(jsonResponse(historyResponseGeneral))
    .mockResolvedValueOnce(jsonResponse(historyResponseEngineering));

  const source = createSlackSource({ token: "xoxb-bot-token" });
  const result = await source.fetchActivity({ since: "2023-11-14", until: "2023-11-15" });

  expect(result.totalCount).toBe(1);
  expect(result.messages[0]!.text).toBe("bot msg");
  expect(result.messages[0]!.channel).toBe("general");
  expect(result.channelBreakdown).toEqual({ general: 1 });
});

test("fetchActivity handles empty results", async () => {
  const searchResponse = {
    messages: {
      matches: [],
      total: 0,
      paging: { pages: 0, page: 1 },
    },
  };

  mockFetch
    .mockResolvedValueOnce(jsonResponse(authTestResponse))
    .mockResolvedValueOnce(jsonResponse(searchResponse));

  const source = createSlackSource({ token: "xoxp-test-token" });
  const result = await source.fetchActivity({ since: "2023-11-14", until: "2023-11-15" });

  expect(result.totalCount).toBe(0);
  expect(result.messages).toHaveLength(0);
  expect(result.channelBreakdown).toEqual({});
});

test("fetchActivity paginates search results", async () => {
  const page1 = {
    messages: {
      matches: Array.from({ length: 100 }, (_, i) => ({
        text: `msg ${i}`,
        channel: { id: "C001", name: "general" },
        ts: `170000${String(i).padStart(4, "0")}.000000`,
      })),
      total: 150,
      paging: { pages: 2, page: 1 },
    },
  };
  const page2 = {
    messages: {
      matches: Array.from({ length: 50 }, (_, i) => ({
        text: `msg ${100 + i}`,
        channel: { id: "C001", name: "general" },
        ts: `170001${String(i).padStart(4, "0")}.000000`,
      })),
      total: 150,
      paging: { pages: 2, page: 2 },
    },
  };

  mockFetch
    .mockResolvedValueOnce(jsonResponse(authTestResponse))
    .mockResolvedValueOnce(jsonResponse(page1))
    .mockResolvedValueOnce(jsonResponse(page2));

  const source = createSlackSource({ token: "xoxp-test-token" });
  const result = await source.fetchActivity({ since: "2023-11-14", until: "2023-11-15" });

  expect(result.totalCount).toBe(150);
  expect(result.messages).toHaveLength(150);
});

test("fetchActivity passes cookie header for xoxc tokens", async () => {
  const searchResponse = {
    messages: {
      matches: [
        { text: "hello", channel: { id: "C001", name: "general" }, ts: "1700000000.000000" },
      ],
      total: 1,
      paging: { pages: 1, page: 1 },
    },
  };

  mockFetch
    .mockResolvedValueOnce(jsonResponse(authTestResponse))
    .mockResolvedValueOnce(jsonResponse(searchResponse));

  const source = createSlackSource({ token: "xoxc-browser-token", cookie: "abc123" });
  await source.fetchActivity({ since: "2023-11-14", until: "2023-11-15" });

  // Verify cookie was passed in all requests
  for (const call of mockFetch.mock.calls as any[]) {
    const options = call[1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers.Cookie).toBe("d=abc123");
  }
});
