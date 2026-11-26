export const OUTREACH_KINDS = ["connection_note", "linkedin_message", "email"] as const;
export type OutreachKind = (typeof OUTREACH_KINDS)[number];

export const OUTREACH_KIND_LABELS: Record<OutreachKind, string> = {
  connection_note: "LinkedIn connection note (300 chars)",
  linkedin_message: "LinkedIn message",
  email: "Email",
};

// Where reaching out about a job stands. No status = not contacted yet.
export const OUTREACH_STATUSES = {
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  replied: { label: "Replied", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  referred: { label: "Referred", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  no_reply: { label: "No reply", className: "bg-muted text-muted-foreground" },
} as const;

export type OutreachStatus = keyof typeof OUTREACH_STATUSES;
export const OUTREACH_STATUS_CODES = Object.keys(OUTREACH_STATUSES) as OutreachStatus[];

export const isOutreachStatus = (v: unknown): v is OutreachStatus =>
  typeof v === "string" && v in OUTREACH_STATUSES;
