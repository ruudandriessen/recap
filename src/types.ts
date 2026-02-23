export interface DateRange {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

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

export interface ActivityData {
  source: string;
  dateRange: DateRange;
  username: string;
  prsCreated: PullRequest[];
  prsReviewed: PullRequest[];
  commits: Commit[];
}

export interface DataSource {
  name: string;
  fetch(username: string, dateRange: DateRange): Promise<ActivityData>;
}

export interface CliOptions {
  period: "week" | "month" | "quarter" | "year" | "custom";
  since?: string;
  until?: string;
  format: "text" | "summary" | "both";
  username?: string;
  org?: string;
}
