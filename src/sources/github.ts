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
    { since, until }: DateRange,
    orgFilter: string
  ): Promise<PullRequest[]> {
    const q = `is:pr author:${username} created:${since}..${until}${orgFilter}`;
    const items = await this.searchAll("/search/issues", q);
    return items.map(mapPR);
  }

  private async searchPRsReviewed(
    username: string,
    { since, until }: DateRange,
    orgFilter: string
  ): Promise<PullRequest[]> {
    const q = `is:pr reviewed-by:${username} -author:${username} created:${since}..${until}${orgFilter}`;
    const items = await this.searchAll("/search/issues", q);
    return items.map(mapPR);
  }

  private async searchPRComments(
    username: string,
    { since, until }: DateRange,
    orgFilter: string
  ): Promise<PRComment[]> {
    const q = `is:pr commenter:${username} -author:${username} created:${since}..${until}${orgFilter}`;
    const items = await this.searchAll("/search/issues", q);
    return items.map((item) => ({
      prTitle: item.title,
      prUrl: item.html_url,
      prNumber: item.number,
      repo: extractRepo(item.repository_url),
    }));
  }

  private async searchCommits(
    username: string,
    { since, until }: DateRange,
    orgFilter: string
  ): Promise<Commit[]> {
    const q = `author:${username} author-date:${since}..${until}${orgFilter}`;
    const items = await this.searchAll("/search/commits", q);
    return items.map((item) => ({
      message: item.commit.message.split("\n")[0], // first line only
      sha: item.sha,
      url: item.html_url,
      repo: extractRepo(item.repository.url),
      date: item.commit.author.date,
    }));
  }

  private async searchAll(endpoint: string, q: string): Promise<any[]> {
    const items: any[] = [];
    let page = 1;
    const perPage = 100;

    const accept =
      endpoint === "/search/commits"
        ? "application/vnd.github.cloak-preview+json"
        : "application/vnd.github.v3+json";

    while (true) {
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
          continue; // retry same page
        }
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GitHub API error ${res.status}: ${body}`);
      }

      const data = (await res.json()) as { items: any[]; total_count: number };
      items.push(...data.items);

      if (items.length >= data.total_count || data.items.length < perPage) {
        break;
      }
      page++;
    }

    return items;
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
