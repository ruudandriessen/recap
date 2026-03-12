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

export interface SlackMessage {
  text: string;
  channel: string;
  channelType: "public" | "private" | "dm" | "group_dm";
  timestamp: string;
  permalink?: string;
}

export interface SlackActivity {
  messages: SlackMessage[];
  channelBreakdown: Record<string, number>;
  totalCount: number;
}

export interface ActivityData {
  source: string;
  dateRange: DateRange;
  username: string;
  prsCreated: PullRequest[];
  prsReviewed: PullRequest[];
  commits: Commit[];
  slack?: SlackActivity;
}

export interface DataSource {
  name: string;
  fetch(username: string, dateRange: DateRange): Promise<ActivityData>;
}

export type SourceOption = "github" | "slack" | "all";

export interface CliOptions {
  period: "week" | "month" | "quarter" | "year" | "custom";
  since?: string;
  until?: string;
  format: "text" | "summary" | "both";
  username?: string;
  org?: string;
  prompt?: string;
  source?: SourceOption;
}
