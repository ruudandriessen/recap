import type { ActivityData, DateRange } from "../../types.ts";
import type { CacheKey, DataSource } from "../source.ts";

export interface PullRequest {
  title: string;
  url: string;
  repo: string; // "owner/repo"
  number: number;
  state: "open" | "closed";
  merged: boolean;
  createdAt: string;
  mergedAt: string | null;
  reviewCommentCount?: number;
}

export interface Commit {
  message: string;
  sha: string;
  url: string;
  repo: string;
  date: string;
}

const GITHUB_API = "https://api.github.com";

export interface GitHubCacheKey extends CacheKey {
  source: "github";
  username: string;
  org?: string;
}

export function createGitHubSource(token: string, org?: string) {
  async function request(path: string): Promise<any> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${body}`);
    }

    return res.json();
  }

  async function fetchSearchPage(
    endpoint: string,
    q: string,
    page: number,
    perPage: number,
    accept: string
  ): Promise<{ items: any[]; total_count: number }> {
    const url = `${GITHUB_API}${endpoint}?q=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
      },
    });

    if (res.status === 403) {
      const resetAt = res.headers.get("X-RateLimit-Reset");
      if (resetAt) {
        const waitMs = Math.max(0, Number(resetAt) * 1000 - Date.now()) + 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        return fetchSearchPage(endpoint, q, page, perPage, accept);
      }
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${body}`);
    }

    return (await res.json()) as { items: any[]; total_count: number };
  }

  async function searchAll(endpoint: string, q: string, dateRange: DateRange): Promise<any[]> {
    const perPage = 100;

    const accept =
      endpoint === "/search/commits"
        ? "application/vnd.github.cloak-preview+json"
        : "application/vnd.github.v3+json";

    const firstPage = await fetchSearchPage(endpoint, q, 1, perPage, accept);

    // GitHub Search API caps at 1000 results. Split date range and retry.
    if (firstPage.total_count > 1000) {
      const mid = midpointDate(dateRange.since, dateRange.until);
      if (mid !== dateRange.since) {
        const dateStr = `${dateRange.since}..${dateRange.until}`;
        const firstHalf: DateRange = { since: dateRange.since, until: mid };
        const secondHalf: DateRange = { since: nextDay(mid), until: dateRange.until };
        const q1 = q.replace(dateStr, `${firstHalf.since}..${firstHalf.until}`);
        const q2 = q.replace(dateStr, `${secondHalf.since}..${secondHalf.until}`);
        const [items1, items2] = await Promise.all([
          searchAll(endpoint, q1, firstHalf),
          searchAll(endpoint, q2, secondHalf),
        ]);
        return [...items1, ...items2];
      }
    }

    const items = [...firstPage.items];
    let page = 2;

    while (items.length < firstPage.total_count && firstPage.items.length === perPage) {
      const data = await fetchSearchPage(endpoint, q, page, perPage, accept);
      items.push(...data.items);
      if (data.items.length < perPage) break;
      page++;
    }

    return items;
  }

  async function searchPRsCreated(
    username: string,
    dateRange: DateRange,
    orgFilter: string
  ): Promise<PullRequest[]> {
    const { since, until } = dateRange;
    const q = `is:pr author:${username} created:${since}..${until}${orgFilter}`;
    const items = await searchAll("/search/issues", q, dateRange);
    return items.map(mapPR);
  }

  async function searchPRsReviewed(
    username: string,
    dateRange: DateRange,
    orgFilter: string
  ): Promise<PullRequest[]> {
    const { since, until } = dateRange;
    const q = `is:pr reviewed-by:${username} -author:${username} updated:${since}..${until}${orgFilter}`;
    const items = await searchAll("/search/issues", q, dateRange);
    return items.map(mapPR);
  }

  async function searchCommits(
    username: string,
    dateRange: DateRange,
    orgFilter: string
  ): Promise<Commit[]> {
    const { since, until } = dateRange;
    const q = `author:${username} author-date:${since}..${until}${orgFilter}`;
    const items = await searchAll("/search/commits", q, dateRange);
    return items.map((item) => ({
      message: item.commit.message.split("\n")[0],
      sha: item.sha,
      url: item.html_url,
      repo: extractRepo(item.repository.url),
      date: item.commit.author.date,
    }));
  }

  async function fetchReviewCommentCount(
    repo: string,
    prNumber: number,
    username: string
  ): Promise<number> {
    let count = 0;
    let page = 1;
    const perPage = 100;
    while (true) {
      const comments = await request(
        `/repos/${repo}/pulls/${prNumber}/comments?per_page=${perPage}&page=${page}`
      );
      count += comments.filter((c: any) => c.user?.login === username).length;
      if (comments.length < perPage) break;
      page++;
    }
    return count;
  }

  return {
    name: "github",

    makeCacheKey(username: string): GitHubCacheKey {
      const key: GitHubCacheKey = { source: "github", username };
      if (org) key.org = org;
      return key;
    },

    async resolveUsername(): Promise<string> {
      const res = await request("/user");
      return res.login;
    },

    async fetch(key: GitHubCacheKey, dateRange: DateRange): Promise<ActivityData> {
      const orgFilter = key.org ? ` org:${key.org}` : "";
      const [prsCreated, prsReviewed, commits] = await Promise.all([
        searchPRsCreated(key.username, dateRange, orgFilter),
        searchPRsReviewed(key.username, dateRange, orgFilter),
        searchCommits(key.username, dateRange, orgFilter),
      ]);

      await Promise.all(
        prsReviewed.map(async (pr) => {
          pr.reviewCommentCount = await fetchReviewCommentCount(pr.repo, pr.number, key.username);
        })
      );

      return {
        source: "github",
        dateRange,
        username: key.username,
        prsCreated,
        prsReviewed,
        commits,
      };
    },
  } satisfies DataSource<GitHubCacheKey>;
}

function midpointDate(since: string, until: string): string {
  const start = new Date(since);
  const end = new Date(until);
  const mid = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
  return mid.toISOString().slice(0, 10);
}

function nextDay(date: string): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function extractRepo(repositoryUrl: string): string {
  // repositoryUrl is like "https://api.github.com/repos/owner/repo"
  const parts = repositoryUrl.split("/");
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function mapPR(item: any): PullRequest {
  return {
    title: item.title,
    url: item.html_url,
    repo: extractRepo(item.repository_url),
    number: item.number,
    state: item.state as "open" | "closed",
    merged: item.pull_request?.merged_at != null,
    createdAt: item.created_at,
    mergedAt: item.pull_request?.merged_at ?? null,
  };
}
