"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowRight, NotebookPen, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { PersonRow } from "@/actions/people.actions";
import { PEOPLE_STATUSES, PEOPLE_STATUS_CODES, WEEKLY_CONVERSATION_GOAL } from "@/models/people.model";

// Same as ATS_TARGET in src/lib/cv/tailor.ts (server-only).
const ATS_TARGET = 75;
import { LogDialog, MessageDialog } from "./PersonDialogs";

export type SearchHQData = {
  weekStart: Date;
  conversations: number;
  sentThisWeek: number;
  due: PersonRow[];
  pipeline: Record<string, number>;
  newJobs: { id: string; score: number | null; title: string; company: string }[];
  posts: { id: string; topic: string | null; body: string; status: string; updatedAt: Date; scheduledFor: Date | null }[];
  lastPostedAt: Date | null;
};

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

const More = ({ href, label }: { href: string; label: string }) => (
  <Link href={href} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
    {label} <ArrowRight className="h-3 w-3" />
  </Link>
);

// The job search as a project: this week's goal, who to follow up with
// today, the pipeline, jobs worth acting on, and posts.
export type CvToFinish = { id: string; title: string; company: string; base: number | null; tailored: number | null; missing: number; issues: number };

export function SearchHQ({ data, cvsToFinish = [] }: { data: SearchHQData; cvsToFinish?: CvToFinish[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<{ kind: "message" | "log"; person: PersonRow } | null>(null);
  const pct = Math.min(100, Math.round((data.conversations / WEEKLY_CONVERSATION_GOAL) * 100));
  const inPipeline = Object.values(data.pipeline).reduce((a, b) => a + b, 0);

  return (
    <div className="col-span-3 flex flex-col gap-4">
      <div>
        <h3 className="text-2xl font-semibold leading-none tracking-tight">Job search</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Week of {format(new Date(data.weekStart), "d MMM")}. The goal is conversations, not applications.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="This week">
          <div className="text-3xl font-semibold">
            {data.conversations}
            <span className="text-base font-normal text-muted-foreground"> / {WEEKLY_CONVERSATION_GOAL} conversations</span>
          </div>
          <Progress value={pct} />
          <p className="text-xs text-muted-foreground">
            {data.sentThisWeek} message{data.sentThisWeek === 1 ? "" : "s"} sent. A reply, a call or an intro counts as a
            conversation.
          </p>
        </Card>

        <Card title="Pipeline" action={<More href="/dashboard/people" label="People" />}>
          {inPipeline === 0 ? (
            <p className="text-sm text-muted-foreground">No one yet. Add the people who know you, starting with investors and ex-colleagues.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {PEOPLE_STATUS_CODES.filter((s) => s !== "closed").map((s) => (
                <li key={s} className="flex justify-between">
                  <span className="text-muted-foreground">{PEOPLE_STATUSES[s].label}</span>
                  <span className="font-medium">{data.pipeline[s] ?? 0}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="LinkedIn" action={<More href="/dashboard/posts" label="Posts" />}>
          <p className="text-sm">
            {data.lastPostedAt
              ? `Last post ${formatDistanceToNow(new Date(data.lastPostedAt), { addSuffix: true })}.`
              : "Nothing posted yet."}
          </p>
          {data.posts.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {data.posts.map((p) => (
                <li key={p.id} className="truncate text-muted-foreground">
                  {p.scheduledFor ? format(new Date(p.scheduledFor), "EEE d MMM") : p.status === "idea" ? "Idea" : "Draft"}: {p.topic || p.body.slice(0, 60)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Follow up today (${data.due.length})`} action={<More href="/dashboard/people" label="All people" />}>
          {data.due.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due. A good day to reach out to someone new.</p>
          ) : (
            <ul className="grid gap-2">
              {data.due.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[p.company, p.outreachStatus && PEOPLE_STATUSES[p.outreachStatus as keyof typeof PEOPLE_STATUSES]?.label,
                        p.nextFollowUpAt && `due ${format(new Date(p.nextFollowUpAt), "d MMM")}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen({ kind: "message", person: p })}>
                      <Send className="mr-1 h-3.5 w-3.5" /> Message
                    </Button>
                    <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen({ kind: "log", person: p })}>
                      <NotebookPen className="mr-1 h-3.5 w-3.5" /> Log
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Jobs worth acting on (70+)" action={<More href="/dashboard/myjobs" label="Jobs" />}>
          {data.newJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No new jobs at 70 or above. The daily scan adds them each morning.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {data.newJobs.map((j) => (
                <li key={j.id}>
                  <Link href={`/dashboard/myjobs/${j.id}`} className="flex justify-between gap-2 hover:underline">
                    <span className="truncate">{j.company} · {j.title}</span>
                    <span className="font-medium">{j.score}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Before applying, find someone to talk to at the company.</p>
        </Card>
      </div>

      <Card title={`CVs to finish (${cvsToFinish.length})`} action={<More href="/dashboard/myjobs" label="Jobs" />}>
        {cvsToFinish.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every open job has a CV ready to send ({ATS_TARGET}%+ ATS match).</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Open jobs without a CV at {ATS_TARGET}%+ ATS match. Open each one → Tailor CV, and answer the questions about the
              missing keywords.
            </p>
            <ul className="grid gap-1 text-sm">
              {cvsToFinish.map((j) => (
                <li key={j.id}>
                  <Link href={`/dashboard/myjobs/${j.id}`} className="flex justify-between gap-2 hover:underline">
                    <span className="truncate">{j.company} · {j.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {j.tailored != null
                        ? `${j.tailored}% · ${j.missing} question${j.missing === 1 ? "" : "s"}${j.issues ? ` · ${j.issues} to fix` : ""}`
                        : `not tailored (${j.base ?? "?"}%)`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {open?.kind === "message" && (
        <MessageDialog person={open.person} onClose={() => setOpen(null)} onLogged={() => router.refresh()} />
      )}
      {open?.kind === "log" && (
        <LogDialog person={open.person} onClose={() => setOpen(null)} onLogged={() => router.refresh()} />
      )}
    </div>
  );
}
