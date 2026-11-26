"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { Archive, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TellBox } from "./TellBox";
import type { TodayData, TodayFocusRow } from "@/actions/today.actions";
import type { Finding } from "@/lib/results";
import { FindingsList } from "@/components/results/ResultsPage";
import { applyTell } from "@/actions/tell.actions";
import { runScanNow } from "@/actions/dailyScan.actions";
import { FOCUS_VERBS, type FocusVerb } from "@/lib/focus";
import type { PersonRow } from "@/actions/people.actions";
import { LogDialog, MessageDialog } from "@/components/people/PersonDialogs";
import { toastError, toastInfo, toastSuccess } from "@/lib/toast";
import { checkAts, tailorCv } from "@/actions/tailorCv.actions";
import { TailorCvDialog } from "@/components/myjobs/job-details/TailorCvDialog";
import { OutreachDialog } from "@/components/myjobs/job-details/OutreachDialog";
import { cn } from "@/lib/utils";

const VERB_CLASS: Record<FocusVerb, string> = {
  apply: "text-signal",
  tailor: "text-amber-700 dark:text-amber-400",
  talk: "text-foreground",
  look: "text-muted-foreground",
  skip: "text-muted-foreground",
};

function Section({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
      <div className="flex items-baseline justify-between gap-2 border-b pb-1.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

type QuickAction = "tailor" | "applied" | "message" | "check" | "archive" | "ask";

function FocusRow({
  r,
  busy,
  running,
  onAction,
  atsTarget = 75,
}: {
  atsTarget?: number;
  r: TodayFocusRow;
  busy?: boolean;
  running?: boolean;
  onAction: (a: QuickAction) => void;
}) {
  const href = `/dashboard/myjobs/${r.id}${r.verb === "tailor" ? "?tab=cv" : ""}`;
  const btn = "h-8 shrink-0 px-3 text-xs";
  let actions: React.ReactNode = null;
  if (r.verb === "apply")
    actions = (
      <>
        <Button size="sm" variant="ghost" className={btn} asChild>
          <a href={`/api/cv/job/${r.id}`} target="_blank" rel="noreferrer">
            CV
          </a>
        </Button>
        {r.jobUrl && (
          <Button size="sm" variant="ghost" className={btn} asChild>
            <a href={r.jobUrl} target="_blank" rel="noopener noreferrer" title={r.jobUrl}>
              Posting
            </a>
          </Button>
        )}
        <Button size="sm" variant="outline" className={btn} disabled={busy} onClick={() => onAction("applied")}>
          Mark applied
        </Button>
      </>
    );
  else if (r.verb === "tailor")
    actions = (
      <Button size="sm" className={btn} disabled={busy || running} onClick={() => onAction("tailor")}>
        {running ? (
          <>
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Tailoring
          </>
        ) : (
          "Tailor"
        )}
      </Button>
    );
  else if (r.verb === "talk")
    actions = (
      <Button size="sm" variant="outline" className={btn} onClick={() => onAction("message")}>
        Message
      </Button>
    );
  else if (r.verb === "look" && r.ats == null)
    actions = (
      <Button size="sm" variant="outline" className={btn} disabled={busy} onClick={() => onAction("check")}>
        Check ATS
      </Button>
    );
  else if (r.verb === "skip")
    actions = (
      <Button size="sm" variant="ghost" className={btn} disabled={busy} onClick={() => onAction("archive")}>
        Archive
      </Button>
    );

  return (
    <li className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 py-2.5 last:border-0">
      <span className={cn("w-[4.5rem] shrink-0 pl-1 text-sm font-semibold", VERB_CLASS[r.verb])}>{FOCUS_VERBS[r.verb].label}</span>
      <span className="hidden w-12 shrink-0 text-right text-sm tabular-nums sm:inline" title="AI match: how well you fit the posting">
        {r.match ?? <span className="text-muted-foreground">–</span>}
      </span>
      <span
        className="w-14 shrink-0 text-right tabular-nums"
        title={r.ats == null ? "Not scored yet" : r.atsTailored ? "ATS keyword match of the CV made for this job" : "ATS keyword match of your generic CV (no CV for this job yet)"}
      >
        {r.ats == null || (!r.atsTailored && r.ats === 0) ? (
          <span className="text-sm text-muted-foreground">–</span>
        ) : (
          <>
            <span
              className={cn(
                "text-sm font-semibold",
                r.atsTailored && r.ats >= atsTarget ? "text-signal" : r.atsTailored ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
              )}
            >
              {r.ats}%
            </span>
            {!r.atsTailored && <span className="block text-[10px] leading-none text-muted-foreground">generic</span>}
          </>
        )}
      </span>
      <Link href={href} className="min-w-0 flex-1 basis-[18rem]">
        <div className="truncate text-sm">
          <span className="font-medium">{r.company}</span>
          <span className="text-muted-foreground"> · {r.title}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {running ? "Reading the posting, tailoring and fact-checking… about a minute" : r.reason}
          {!running && r.companyMeta ? ` · ${r.companyMeta}` : ""}
        </div>
        {!running && r.known.count > 0 && r.verb !== "skip" && (
          <div className="truncate text-xs">
            <span className="text-muted-foreground">You know: </span>
            {r.known.people.map((p) => `${p.name}${p.title ? ` (${p.title})` : ""}`).join(", ")}
            {r.known.count > r.known.people.length ? ` +${r.known.count - r.known.people.length}` : ""}
          </div>
        )}
      </Link>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {r.known.count > 0 && (r.verb === "apply" || r.verb === "tailor") && (
          <Button size="sm" variant="outline" className={btn} onClick={() => onAction("ask")} title={`Write to ${r.known.people[0]?.name}`}>
            Ask {r.known.people[0]?.name.split(" ")[0]}
          </Button>
        )}
        {actions}
        {r.verb !== "skip" && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            title={`Archive ${r.company}`}
            aria-label={`Archive ${r.company}`}
            disabled={busy || running}
            onClick={() => onAction("archive")}
          >
            <Archive className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

export function TodayPage({ data, findings = [], setupLeft = 0 }: { data: TodayData; findings?: Finding[]; setupLeft?: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState<{ kind: "message" | "log"; person: PersonRow } | null>(null);
  const [jobDialog, setJobDialog] = useState<{ kind: "tailor" | "outreach"; row: TodayFocusRow } | null>(null);
  const [tailoring, setTailoring] = useState<string[]>([]);

  const quick = (r: TodayFocusRow, a: QuickAction) => {
    const label = `${r.company} · ${r.title}`;
    if (a === "message") return setJobDialog({ kind: "outreach", row: r });
    if (a === "ask" && r.known.people[0]) return setOpen({ kind: "message", person: r.known.people[0] });
    if (a === "archive") return archive(r);
    if (a === "tailor") {
      setTailoring((t) => [...t, r.id]);
      // Runs outside the transition so other rows stay usable meanwhile.
      tailorCv(r.id)
        .then((res) => {
          if (!res.success || !res.result) return toastError(res.message ?? `Couldn't tailor ${r.company}.`);
          const { after, missing } = res.result.ats;
          const high = (res.result.review ?? []).filter((i) => i.severity === "high").length;
          if (after >= data.atsTarget && high === 0) toastSuccess(`${r.company}: CV ready, ${after}% ATS.`);
          else {
            toastInfo(`${r.company}: ${after}% ATS${high ? `, ${high} must-fix` : ""}. ${missing.length ? "Answer the questions to raise it." : ""}`);
            setJobDialog({ kind: "tailor", row: r });
          }
          router.refresh();
        })
        .finally(() => setTailoring((t) => t.filter((x) => x !== r.id)));
      return;
    }
    start(async () => {
      if (a === "applied") {
        const res = await applyTell([{ kind: "job_status", jobId: r.id, status: "applied", label }], "");
        if (!res.success) return toastError("Couldn't mark it applied.");
        toastSuccess(`${r.company}: marked applied. Follow up in a week if you don't hear back.`);
      } else if (a === "check") {
        const res = await checkAts(r.id);
        if (!res.success) return toastError(res.message);
        toastSuccess(`${r.company}: ${res.base ?? "?"}% ATS with your generic CV.`);
      }
      router.refresh();
    });
  };
  const act = data.focus.filter((f) => f.verb !== "skip");
  const skip = data.focus.filter((f) => f.verb === "skip");
  const counts = act.reduce<Record<string, number>>((m, f) => ({ ...m, [f.verb]: (m[f.verb] ?? 0) + 1 }), {});
  const lastRun = data.scan?.lastRun ? new Date(data.scan.lastRun) : null;
  const scanLine = data.scan?.running
    ? "The morning scan is running."
    : lastRun
      ? `${isToday(lastRun) ? "Scan ran" : "Last scan"} ${isToday(lastRun) ? format(lastRun, "HH:mm") : formatDistanceToNow(lastRun, { addSuffix: true })}.`
      : "No scan yet.";
  const staleScan = !data.scan?.running && (!lastRun || !isToday(lastRun));
  const weekMet = data.week.conversations >= data.week.goal;
  const followUps = data.due.length + data.quiet.length;

  const archive = (r: TodayFocusRow) =>
    start(async () => {
      const res = await applyTell([{ kind: "job_status", jobId: r.id, status: "archived", label: `${r.company} · ${r.title}` }], "");
      if (!res.success) return toastError("Couldn't archive it.");
      toastSuccess(`Archived ${r.company}. It stays in Jobs → Closed.`);
      router.refresh();
    });

  return (
    <div className="col-span-3 mx-auto grid w-full max-w-[2400px] grid-cols-[minmax(0,1fr)] gap-7 pb-6 pt-1">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE d MMMM")} · {scanLine}{" "}
          {staleScan && data.scan?.supported && (
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-2"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const res = await runScanNow();
                  (res.success ? toastSuccess : toastError)(res.message);
                  router.refresh();
                })
              }
            >
              Run now
            </button>
          )}
        </p>
      </header>

      <div className="grid items-start gap-8 @5xl/main:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] @5xl/main:grid-rows-[auto_1fr] @5xl/main:gap-10 @8xl/main:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] @8xl/main:grid-rows-[auto]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-7 @5xl/main:row-span-2 @8xl/main:row-span-1">
      {setupLeft > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-4 py-3 text-sm">
          <span>
            <span className="font-semibold">Finish setting up Jobdormo.</span>{" "}
            <span className="text-muted-foreground">
              {setupLeft} needed step{setupLeft === 1 ? "" : "s"} left: your AI model, your CV and a few lines about you.
            </span>
          </span>
          <Button size="sm" asChild>
            <Link href="/dashboard/setup">Set up</Link>
          </Button>
        </div>
      )}
      <TellBox />

      <Section
        title="Focus"
        meta={
          act.length
            ? [counts.apply && `${counts.apply} to apply`, counts.tailor && `${counts.tailor} to tailor`].filter(Boolean).join(" · ")
            : undefined
        }
      >
        {act.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            Nothing waiting. New jobs come in with the {data.scan?.enabled ? `${String(data.scan.hour).padStart(2, "0")}:${String(data.scan.minute).padStart(2, "0")} ` : ""}
            morning scan, or paste one above.
          </p>
        ) : (
          <>
          <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground" aria-hidden>
            <span className="w-[4.5rem] shrink-0" />
            <span className="hidden w-12 shrink-0 text-right sm:inline">Match</span>
            <span className="w-14 shrink-0 text-right">ATS</span>
          </div>
          <ul>
            {act.map((r) => (
              <FocusRow key={r.id} r={r} busy={busy} running={tailoring.includes(r.id)} onAction={(a) => quick(r, a)} atsTarget={data.atsTarget} />
            ))}
          </ul>
          </>
        )}
        {skip.length > 0 && (
          <details className="pt-1">
            <summary className="cursor-pointer py-1 text-xs text-muted-foreground hover:text-foreground">
              {skip.length} to skip, with the reason
            </summary>
            <ul>
              {skip.map((r) => (
                <FocusRow key={r.id} r={r} busy={busy} onAction={(a) => quick(r, a)} atsTarget={data.atsTarget} />
              ))}
            </ul>
          </details>
        )}
      </Section>

      </div>
      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-7">
      <Section title="Follow up" meta={followUps ? `${followUps} due` : undefined}>
        {followUps === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Nobody is waiting on you. A good day to message someone new.</p>
        ) : (
          <ul>
            {data.due.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    <span className="font-medium">{p.name}</span>
                    {p.company && <span className="text-muted-foreground"> · {p.company}</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.lastActivity
                      ? `Last: ${p.lastActivity.kind === "sent" ? "you wrote" : p.lastActivity.kind} ${formatDistanceToNow(new Date(p.lastActivity.at), { addSuffix: true })}`
                      : "No messages logged yet"}
                    {p.nextFollowUpAt ? ` · due ${format(new Date(p.nextFollowUpAt), "d MMM")}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen({ kind: "message", person: p })}>
                    Message
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen({ kind: "log", person: p })}>
                    Log
                  </Button>
                </div>
              </li>
            ))}
            {data.quiet.map((q) => (
              <li key={q.id} className="border-b border-border/60 py-2.5 last:border-0">
                <Link href={`/dashboard/myjobs/${q.id}`} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      <span className="font-medium">{q.company}</span>
                      <span className="text-muted-foreground"> · {q.title}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      Applied {q.days} days ago, no reply.{" "}
                      {q.known.count
                        ? `You know ${q.known.people.map((p) => p.name).join(", ")}${q.known.count > q.known.people.length ? ` and ${q.known.count - q.known.people.length} more` : ""} there.`
                        : "Find someone there to write to."}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="This week">
        <div className="grid gap-3 py-2 text-sm sm:grid-cols-2 @5xl/main:grid-cols-1">
          <Link href="/dashboard/people" className="grid gap-0.5 hover:underline">
            <span className="tabular-nums">
              <span className={cn("text-lg font-semibold", weekMet && "text-signal")}>{data.week.conversations}</span>
              <span className="text-muted-foreground"> of {data.week.goal} conversations</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {data.week.sent} message{data.week.sent === 1 ? "" : "s"} sent. A reply, a call or an intro counts.
            </span>
          </Link>
          <Link href="/dashboard/posts" className="grid gap-0.5 hover:underline">
            <span className="truncate">
              {data.nextPost ? (
                <>
                  <span className="font-medium">Next post</span>
                  {data.nextPost.scheduledFor ? ` ${format(new Date(data.nextPost.scheduledFor), "EEE d MMM, HH:mm")}` : ""}:{" "}
                  {data.nextPost.topic || data.nextPost.body.slice(0, 60)}
                </>
              ) : (
                <span className="font-medium">No post planned</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {data.nextPost?.body.trim() ? "Draft ready: read it, copy it into LinkedIn at that time. " : ""}
              {data.lastPostedAt
                ? `Last posted ${formatDistanceToNow(new Date(data.lastPostedAt), { addSuffix: true })}.`
                : "Nothing posted yet."}
            </span>
            {data.resultsDue.length > 0 && (
              <span className="text-xs">
                Log how{" "}
                {data.resultsDue.map((p, i) => (
                  <span key={p.id}>
                    {i ? ", " : ""}&ldquo;{p.topic ?? "your post"}&rdquo;
                  </span>
                ))}{" "}
                did: impressions, reactions, comments.
              </span>
            )}
          </Link>
        </div>
      </Section>

      </aside>
      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-7 @5xl/main:col-start-2 @8xl/main:col-start-3 @8xl/main:row-start-1">
      <Section title="What's working" meta={undefined}>
        {findings.length ? (
          <div className="grid gap-3 pt-1">
            <FindingsList findings={findings} limit={6} />
            <Link href="/dashboard/results" className="text-xs font-medium underline-offset-2 hover:underline">
              All results
            </Link>
          </div>
        ) : (
          <p className="py-3 text-sm text-muted-foreground">Nothing to measure yet.</p>
        )}
      </Section>
      </aside>
      </div>

      {jobDialog?.kind === "tailor" && (
        <TailorCvDialog
          jobId={jobDialog.row.id}
          jobLabel={`${jobDialog.row.title} at ${jobDialog.row.company}`}
          hasTailored
          onClose={() => {
            setJobDialog(null);
            router.refresh();
          }}
        />
      )}
      {jobDialog?.kind === "outreach" && (
        <OutreachDialog
          jobId={jobDialog.row.id}
          jobLabel={`${jobDialog.row.title} at ${jobDialog.row.company}`}
          onClose={() => setJobDialog(null)}
        />
      )}
      {open?.kind === "message" && (
        <MessageDialog person={open.person} onClose={() => setOpen(null)} onLogged={() => router.refresh()} />
      )}
      {open?.kind === "log" && <LogDialog person={open.person} onClose={() => setOpen(null)} onLogged={() => router.refresh()} />}
    </div>
  );
}
