import type { ActivityData, Commit, DataSource, DateRange, PRComment, PullRequest } from "../types.ts";

const GITHUB_API = "https://api.github.com";

export class GitHubSource implements DataSource {
  name = "github";
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async resolveUsername(): Promise<string> {
    const res = await this.request("/user");
    return res.login;
  }

  async fetch(username: string, dateRange: DateRange, org?: string): Promise<ActivityData> {
    const orgFilter = org ? ` org:${org}` : "";
    const [prsCreated, prsReviewed, prCommentedOn, commits] = await Promise.all([
      this.searchPRsCreated(username, dateRange, orgFilter),
      this.searchPRsReviewed(username, dateRange, orgFilter),
      this.searchPRComments(username, dateRange, orgFilter),
      this.searchCommits(username, dateRange, orgFilter),
    ]);

    // Deduplicate PR comments against PRs reviewed (by URL)
    const reviewedUrls = new Set(prsReviewed.map((pr) => pr.url));
    const prComments = prCommentedOn.filter((c) => !reviewedUrls.has(c.prUrl));

    return {
      source: "github",
      dateRange,
      username,
      prsCreated,
      prsReviewed,
      commits,
      prComments,
    };
  }

  private async searchPRsCreated(
    username: string,
    dateRange: DateRange,
    orgFilter: string
  ): Promise<PullRequest[]> {
    const { since, until } = dateRange;
    const q = `is:pr author:${username} created:${since}..${until}${orgFilter}`;
    const items = await this.searchAll("/search/issues", q, dateRange);
    return items.map(mapPR);
  }

  private async searchPRsReviewed(
    username: string,
    dateRange: DateRange,
    orgFilter: string
  ): Promise<PullRequest[]> {
    const { since, until } = dateRange;
    const q = `is:pr reviewed-by:${username} -author:${username} created:${since}..${until}${orgFilter}`;
    const items = await this.searchAll("/search/issues", q, dateRange);
    return items.map(mapPR);
  }

  private async searchPRComments(
    username: string,
    dateRange: DateRange,
    orgFilter: string
  ): Promise<PRComment[]> {
    const { since, until } = dateRange;
    const q = `is:pr commenter:${username} -author:${username} created:${since}..${until}${orgFilter}`;
    const items = await this.searchAll("/search/issues", q, dateRange);
    return items.map((item) => ({
      prTitle: item.title,
      prUrl: item.html_url,
      prNumber: item.number,
      repo: extractRepo(item.repository_url),
    }));
  }

  private async searchCommits(
    username: string,
    dateRange: DateRange,
    orgFilter: string
  ): Promise<Commit[]> {
    const { since, until } = dateRange;
    const q = `author:${username} author-date:${since}..${until}${orgFilter}`;
    const items = await this.searchAll("/search/commits", q, dateRange);
    return items.map((item) => ({
      message: item.commit.message.split("\n")[0], // first line only
      sha: item.sha,
      url: item.html_url,
      repo: extractRepo(item.repository.url),
      date: item.commit.author.date,
    }));
  }

  private async searchAll(endpoint: string, q: string, dateRange: DateRange): Promise<any[]> {
    const perPage = 100;

    const accept =
      endpoint === "/search/commits"
        ? "application/vnd.github.cloak-preview+json"
        : "application/vnd.github.v3+json";

    // Fetch first page to check total_count
    const firstPage = await this.fetchSearchPage(endpoint, q, 1, perPage, accept);

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
          this.searchAll(endpoint, q1, firstHalf),
          this.searchAll(endpoint, q2, secondHalf),
        ]);
        return [...items1, ...items2];
      }
    }

    // Normal pagination (within 1000 limit)
    const items = [...firstPage.items];
    let page = 2;

    while (items.length < firstPage.total_count && firstPage.items.length === perPage) {
      const data = await this.fetchSearchPage(endpoint, q, page, perPage, accept);
      items.push(...data.items);
      if (data.items.length < perPage) break;
      page++;
    }

    return items;
  }

  private async fetchSearchPage(
    endpoint: string,
    q: string,
    page: number,
    perPage: number,
    accept: string
  ): Promise<{ items: any[]; total_count: number }> {
    const url = `${GITHUB_API}${endpoint}?q=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: accept,
      },
    });

    if (res.status === 403) {
      const resetAt = res.headers.get("X-RateLimit-Reset");
      if (resetAt) {
        const waitMs = Math.max(0, Number(resetAt) * 1000 - Date.now()) + 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        return this.fetchSearchPage(endpoint, q, page, perPage, accept);
      }
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${body}`);
    }

    return (await res.json()) as { items: any[]; total_count: number };
  }

  private async request(path: string): Promise<any> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${body}`);
    }

    return res.json();
  }
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
