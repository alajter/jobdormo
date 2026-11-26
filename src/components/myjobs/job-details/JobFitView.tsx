"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OutreachStatusBadge } from "../OutreachStatusBadge";
import { getWorkplaceTypeLabel, type JobResponse } from "@/models/job.model";
import type { JobMatchData } from "@/models/ai.schemas";
import { getCompanyAreaLabel } from "@/models/companyArea.model";
import { FOCUS_VERBS, focusFor } from "@/lib/focus";
import { DEFAULT_SEARCH_RULES, isTooBig, locationCheck, type SearchRules } from "@/models/searchRules.model";
import { parseMatchBody, postingRequirements, type FitItem } from "@/lib/jobs/matchSections";
import { postedAgo } from "@/lib/jobs/postedDate";
import { cn } from "@/lib/utils";
import { getPeopleAtCompany, type PersonRow } from "@/actions/people.actions";
import { MessageDialog } from "@/components/people/PersonDialogs";

type FitJob = JobResponse & { cvReview?: string | null; automationId?: string | null };

// The first sentence, capped: the full text is in the list below.
const short = (s: string, max = 110) => {
  const first = s.split(/(?<=[.;])\s/)[0].replace(/[.;]$/, "");
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,:;]$/, "")}…`;
};


const VERB_CLASS = {
  apply: "text-signal",
  tailor: "text-amber-700 dark:text-amber-400",
  talk: "text-foreground",
  look: "text-muted-foreground",
  skip: "text-red-700 dark:text-red-400",
} as const;

export function FitSection({
  title,
  meta,
  children,
  className,
  id,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("grid min-w-0 scroll-mt-20 grid-cols-[minmax(0,1fr)] content-start gap-2", className)}>
      <div className="flex items-baseline justify-between gap-2 border-b pb-1.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

function Reasons({ items, tone }: { items: string[]; tone: "good" | "bad" }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{tone === "good" ? "Nothing stands out yet." : "Nothing serious found."}</p>;
  return (
    <ul className="grid gap-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-snug">
          <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", tone === "good" ? "bg-signal" : "bg-red-600 dark:bg-red-400")} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

const MARK = {
  met: { label: "Met", dot: "bg-signal", text: "text-signal" },
  partial: { label: "Partly", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  missing: { label: "Missing", dot: "bg-red-600 dark:bg-red-400", text: "text-red-700 dark:text-red-400" },
} as const;

function FitRow({ item, kind }: { item: FitItem; kind: keyof typeof MARK }) {
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span className={cn("flex items-center gap-1.5 text-xs font-semibold", MARK[kind].text)}>
        <span aria-hidden className={cn("h-2 w-2 rounded-full", MARK[kind].dot)} />
        {MARK[kind].label}
      </span>
      <div className="text-sm leading-snug">
        {item.label && <div className="font-medium">{item.label}</div>}
        <div className="text-muted-foreground">{item.detail}</div>
      </div>
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function JobFitView({
  job,
  matchData,
  peopleCount,
  chatBusy,
  onMatch,
  onTailor,
  onTab,
  cv,
  main,
  side,
  rules = DEFAULT_SEARCH_RULES,
  status,
}: {
  rules?: SearchRules;
  // The status from the job's current timeline stage (the job prop can lag).
  status?: { label: string; value: string };
  cv?: React.ReactNode;
  main?: React.ReactNode;
  side?: React.ReactNode;
  job: FitJob;
  matchData: JobMatchData | null;
  peopleCount: number;
  chatBusy?: boolean;
  onMatch: () => void;
  onTailor: () => void;
  onTab: (tab: string) => void;
}) {
  const m = useMemo(() => (matchData?.analyzed === false ? null : parseMatchBody(matchData?.body)), [matchData]);
  const asks = useMemo(() => postingRequirements(job.description), [job.description]);
  const [now] = useState(() => Date.now());
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [writeTo, setWriteTo] = useState<PersonRow | null>(null);
  const companyId = job.Company?.id;
  useEffect(() => {
    let alive = true;
    if (companyId) getPeopleAtCompany(companyId).then((p) => alive && setPeople(p));
    return () => {
      alive = false;
    };
  }, [companyId]);
  const known = people ?? [];
  const knownCount = Math.max(known.length, peopleCount);

  const highIssues = useMemo(() => {
    try {
      return (JSON.parse(job.cvReview ?? "[]") as { severity?: string }[]).filter((i) => i.severity === "high").length;
    } catch {
      return 0;
    }
  }, [job.cvReview]);

  const company = job.Company as JobResponse["Company"] & {
    size?: string | null;
    stage?: string | null;
    description?: string | null;
    areas?: string[];
    websiteUrl?: string | null;
    linkedinUrl?: string | null;
  };
  const tailored = job.tailoredCv ? (job.atsTailored ?? null) : null;
  const pick = focusFor({
    id: job.id,
    title: job.JobTitle?.label ?? "",
    company: company?.label ?? "",
    size: company?.size,
    stage: company?.stage,
    match: job.matchScore ?? null,
    atsBase: job.atsBase ?? null,
    atsTailored: job.atsTailored ?? null,
    hasTailored: !!job.tailoredCv,
    highIssues,
    outreachStatus: job.outreachStatus,
    postedAt: job.postedAt,
    addedByYou: !job.automationId && job.createdVia !== "daily-web-agent",
    now: new Date(now),
  }, rules);
  const open = ["new", "draft"].includes((status ?? job.Status)?.value ?? "");

  const location = job.Location?.label ?? "";
  const why: string[] = [
    ...(m?.met ?? []).slice(0, 5).map((i) => (i.label ? `${i.label}.` : `${short(i.detail)}.`)),
    ...(company?.size && rules.maxCompanySize && !isTooBig(company.size, rules) ? [`${[company.stage, `${company.size} people`].filter(Boolean).join(", ")}: within your size limit.`] : []),
    ...(tailored != null && tailored >= rules.atsTarget && !highIssues ? [`Your CV for it is ready (${tailored}% ATS).`] : []),
    ...(job.outreachStatus === "referred" ? ["You have a referral."] : job.outreachStatus === "replied" ? ["Someone there replied to you."] : []),
    ...(known.length
      ? [`You know ${known.slice(0, 2).map((p) => `${p.name}${p.title ? ` (${p.title})` : ""}`).join(" and ")}${known.length > 2 ? ` and ${known.length - 2} more` : ""} there: ask before applying.`]
      : []),
  ];
  const age = job.postedAt ? Math.floor((now - new Date(job.postedAt).getTime()) / 86_400_000) : null;
  const whyNot: string[] = [
    ...(m?.dealBreakers ? [short(m.dealBreakers, 140)] : []),
    ...(m?.missing ?? []).map((i) => (i.label ? `Missing: ${i.label} (${short(i.detail, 90)})` : `${short(i.detail)}.`)),
    ...(m?.partial ?? []).slice(0, 3).map((i) => (i.label ? `Partly: ${i.label} (${short(i.detail, 90)})` : `${short(i.detail)}.`)),
    ...(isTooBig(company?.size, rules) ? [`Bigger than you want (${company?.size} people).`] : []),
    ...(() => {
      const loc = locationCheck(location, job.workplaceType ?? "", rules);
      return loc ? [loc.reason] : [];
    })(),
    ...(age != null && age > rules.staleDays ? [`Posted ${age} days ago; it may be filled.`] : []),
    ...(tailored == null
      ? [`No CV for it yet; your generic CV matches ${job.atsBase ?? "?"}% of its keywords.`]
      : tailored < rules.atsTarget
        ? [`CV at ${tailored}% ATS, below ${rules.atsTarget}%.`]
        : highIssues
          ? [`CV has ${highIssues} must-fix issue${highIssues === 1 ? "" : "s"}.`]
          : []),
  ];

  return (
    <div className="grid gap-8">
      {/* Decision: the verdict, why apply, why not. */}
      <div className="grid gap-6 rounded-md border bg-card p-5 @5xl/main:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] @5xl/main:gap-8">
        <div className="grid content-start gap-2">
          <div className="text-xs text-muted-foreground">{open ? "Jobdormo says" : `Status: ${(status ?? job.Status)?.label}`}</div>
          {open && <div className={cn("text-2xl font-semibold tracking-tight", VERB_CLASS[pick.verb])}>{FOCUS_VERBS[pick.verb].label}</div>}
          <div className="text-sm text-muted-foreground">{pick.reason}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-sm tabular-nums">
            <span>
              <span className="text-muted-foreground">Match </span>
              <span className="font-semibold">{job.matchScore ?? "–"}</span>
            </span>
            <span>
              <span className="text-muted-foreground">CV </span>
              <span className={cn("font-semibold", tailored != null && tailored >= rules.atsTarget ? "text-signal" : "")}>
                {tailored != null ? `${tailored}%` : job.atsBase != null ? `${job.atsBase}% generic` : "–"}
              </span>
            </span>
          </div>
          {m?.summary && <p className="pt-2 text-sm leading-relaxed">{m.summary}</p>}
          {open && (pick.verb === "tailor" || tailored == null) && (
            <div className="pt-2">
              <Button size="sm" onClick={onTailor}>
                Tailor CV
              </Button>
            </div>
          )}
        </div>
        <FitSection title="Why apply">
          <Reasons items={why} tone="good" />
        </FitSection>
        <FitSection title="Why not">
          <Reasons items={whyNot} tone="bad" />
        </FitSection>
      </div>

      <div className="grid gap-8 @5xl/main:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] @5xl/main:gap-10">
        {/* What they ask for, and how you fit. */}
        <div className="grid min-w-0 content-start gap-8">
          {m ? (
            <FitSection
              title="What they ask for, and how you fit"
              meta={`${m.met.length} met · ${m.partial.length} partly · ${m.missing.length} missing`}
            >
              <ul>
                {m.met.map((i, k) => (
                  <FitRow key={`m${k}`} item={i} kind="met" />
                ))}
                {m.partial.map((i, k) => (
                  <FitRow key={`p${k}`} item={i} kind="partial" />
                ))}
                {m.missing.map((i, k) => (
                  <FitRow key={`x${k}`} item={i} kind="missing" />
                ))}
              </ul>
            </FitSection>
          ) : (
            <FitSection title="How you fit">
              <div className="grid justify-items-start gap-3 py-2 text-sm text-muted-foreground">
                <p>No fit analysis for this job yet. It reads the posting against your CV and marks each requirement met, partly met or missing.</p>
                <Button size="sm" variant="outline" onClick={onMatch} disabled={chatBusy}>
                  <Sparkles className="mr-2 h-4 w-4" /> Analyse the fit
                </Button>
              </div>
            </FitSection>
          )}

          {m && (m.skills.matched || m.skills.missing || m.skills.bonus) && (
            <FitSection title="Skills">
              <dl className="grid gap-1">
                {m.skills.matched && <Fact label="You have">{m.skills.matched}</Fact>}
                {m.skills.transferable && <Fact label="Transferable">{m.skills.transferable}</Fact>}
                {m.skills.missing && <Fact label="Missing">{m.skills.missing}</Fact>}
                {m.skills.bonus && <Fact label="Extra">{m.skills.bonus}</Fact>}
              </dl>
            </FitSection>
          )}

          {m && m.tips.length > 0 && (
            <FitSection title="How to close the gaps" meta={<button className="underline underline-offset-2 hover:text-foreground" onClick={onTailor}>Tailor CV</button>}>
              <ul className="grid gap-2">
                {m.tips.map((t, k) => (
                  <li key={k} className="text-sm leading-snug">
                    {t.label && <span className="font-medium">{t.label}: </span>}
                    <span className="text-muted-foreground">{t.detail}</span>
                  </li>
                ))}
              </ul>
            </FitSection>
          )}
          {main}
        </div>

        {/* The company, their literal requirements, and the job's facts. */}
        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-8">
          {cv && (
            <FitSection id="job-cv" title="Your CV for this job">
              {cv}
            </FitSection>
          )}
          <FitSection title={company?.label ?? "Company"}>
            {company?.description ? (
              <p className="text-sm leading-relaxed">{company.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No company profile yet.</p>
            )}
            <dl className="grid">
              {(company?.stage || company?.size) && (
                <Fact label="Stage, size">
                  <span className="capitalize">{[company.stage, company.size && `${company.size} people`].filter(Boolean).join(" · ")}</span>
                </Fact>
              )}
              {(company?.areas?.length ?? 0) > 0 && <Fact label="Area">{company.areas!.map(getCompanyAreaLabel).join(", ")}</Fact>}
              <Fact label="Where">{[location, job.workplaceType ? getWorkplaceTypeLabel(job.workplaceType) : null].filter(Boolean).join(" · ") || "–"}</Fact>
              {knownCount === 0 && people !== null && (
                <Fact label="People">
                  <span className="text-muted-foreground">Nobody in your connections works here.</span>
                </Fact>
              )}
              {(company?.websiteUrl || company?.linkedinUrl) && (
                <Fact label="Links">
                  <span className="flex flex-wrap gap-3">
                    {company.websiteUrl && (
                      <a href={company.websiteUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        Website
                      </a>
                    )}
                    {company.linkedinUrl && (
                      <a href={company.linkedinUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        LinkedIn
                      </a>
                    )}
                  </span>
                </Fact>
              )}
            </dl>
          </FitSection>

          {known.length > 0 && (
            <FitSection id="job-people" title="People you know there" meta={`${known.length}`}>
              <ul>
                {known.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[p.title, p.outreachStatus && p.outreachStatus !== "to_contact" ? `status: ${p.outreachStatus}` : null].filter(Boolean).join(" · ") || "Connection"}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="h-8 shrink-0 px-3 text-xs" onClick={() => setWriteTo(p)}>
                      Message
                    </Button>
                  </li>
                ))}
              </ul>
              {known.length > 8 && (
                <button className="justify-self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => onTab("people")}>
                  All {known.length}
                </button>
              )}
            </FitSection>
          )}

          {asks.length > 0 && (
            <FitSection
              title="Their requirements"
              meta={
                <button className="underline underline-offset-2 hover:text-foreground" onClick={() => onTab("posting")}>
                  Full posting
                </button>
              }
            >
              <ul className="grid list-disc gap-1.5 pl-4 text-sm leading-snug">
                {asks.map((a, k) => (
                  <li key={k}>{a}</li>
                ))}
              </ul>
            </FitSection>
          )}

          <FitSection title="This job">
            <dl className="grid">
              <Fact label="Status">{(status ?? job.Status)?.label}</Fact>
              <Fact label="Reach-out">
                <OutreachStatusBadge key={job.outreachStatus ?? "none"} jobId={job.id} status={job.outreachStatus} updatedAt={job.outreachUpdatedAt} />
              </Fact>
              <Fact label="Posted">{job.postedAt ? postedAgo(job.postedAt) : "–"}</Fact>
              <Fact label="Applied">{job.appliedDate ? format(job.appliedDate, "d MMM yyyy") : "Not yet"}</Fact>
              <Fact label="Source">{job.JobSource?.label ?? "–"}</Fact>
              {job.salaryRange && <Fact label="Salary">{job.salaryRange}</Fact>}
              {job.Resume && (
                <Fact label="Resume">
                  <Link href={`/dashboard/profile/resume/${job.Resume.id}`} className="underline-offset-2 hover:underline">
                    {job.Resume.title}
                  </Link>
                </Fact>
              )}
              {(job.tags?.length ?? 0) > 0 && (
                <Fact label="Skills">
                  <span className="flex flex-wrap gap-1">
                    {job.tags!.map((tag) => (
                      <span key={tag.id} className="rounded-md border px-1.5 py-0.5 text-xs">
                        {tag.label}
                      </span>
                    ))}
                  </span>
                </Fact>
              )}
              {job.jobUrl && (
                <Fact label="Posting">
                  <a href={job.jobUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                    Open <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Fact>
              )}
            </dl>
          </FitSection>
          {side}
        </aside>
      </div>
      {writeTo && <MessageDialog person={writeTo} onClose={() => setWriteTo(null)} onLogged={() => setWriteTo(null)} />}
    </div>
  );
}
