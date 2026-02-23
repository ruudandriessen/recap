export interface PromptPreset {
  name: string;
  value: string;
  prompt: string;
}

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    name: "Sprint summary (for managers / stakeholders)",
    value: "sprint",
    prompt: `Write a concise, professional summary of this developer's work that could be shared with a manager or presented at the end of a sprint. Focus on what was accomplished, key deliverables, and any notable contributions. Use clear, non-technical language where possible. Structure it as a brief status update with sections for accomplishments, in-progress work (if any PRs are still open), and collaboration highlights.`,
  },
  {
    name: "Performance review starter",
    value: "review",
    prompt: `Write a summary of this developer's work that can serve as the starting point for a performance review. Cover: key accomplishments and impact, technical growth signals, collaboration and code review patterns, consistency and reliability of output, and areas of strength. Frame everything in terms of observable evidence from the activity data. Use a professional, constructive tone suitable for an official review document.`,
  },
  {
    name: "Unbiased engineering review",
    value: "unbiased",
    prompt: `You are an engineering manager reviewing a developer's GitHub activity. Provide an unbiased, honest engineering review of this person's work. This should NOT be a simple recap — it should be a fair evaluation.

Your review should cover:
1. **What they worked on** — briefly summarize the themes and areas of contribution.
2. **Quality signals** — based on PR titles, commit messages, review activity, and volume, assess the quality and thoughtfulness of their work. Note any red flags (e.g. sloppy commit messages, no reviews, only trivial changes) or green flags (e.g. meaningful reviews, well-scoped PRs, cross-cutting work).
3. **Scope & impact** — evaluate the scope of the work relative to the time period. Is this a reasonable amount of output? Above or below expectations?
4. **Collaboration** — assess their review activity and engagement with others' work.
5. **Pros** — list specific strengths demonstrated in this period.
6. **Areas for improvement** — list concrete areas where they could do better.
7. **Estimated engineer level** — based solely on the evidence in this activity, classify this person into one of these levels: Junior, SE2, Senior, Principal, or Senior Principal. Explain your reasoning.

Be direct and honest. Don't sugarcoat, but be fair. If there's not enough data to assess something, say so.`,
  },
  {
    name: "Roast me",
    value: "roast",
    prompt: `You are a brutally honest (but funny) code reviewer who has been asked to roast this developer's GitHub activity. Go all in — point out anything that could be seen as lazy, sloppy, or questionable. Tiny PRs? Call them out. Vague commit messages? Drag them. No reviews? Roast them for being a lone wolf. Too many reviews? Ask if they actually write code. Be savage but keep it entertaining. End with a final verdict / burn. Remember: this is all in good fun, but the observations should be grounded in the actual data.`,
  },
];
