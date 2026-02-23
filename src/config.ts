import type { CliOptions, DateRange } from "./types.ts";

export function resolveDateRange(options: CliOptions): DateRange {
  if (options.period === "custom") {
    if (!options.since || !options.until) {
      throw new Error("--since and --until are required with --period custom");
    }
    return { since: options.since, until: options.until };
  }

  const now = new Date();
  const until = formatDate(now);
  let since: string;

  switch (options.period) {
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      since = formatDate(d);
      break;
    }
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      since = formatDate(d);
      break;
    }
    case "quarter": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      since = formatDate(d);
      break;
    }
    case "year": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      since = formatDate(d);
      break;
    }
  }

  return { since, until };
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
