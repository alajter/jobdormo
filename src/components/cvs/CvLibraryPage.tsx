"use client";
import Link from "next/link";
import { format } from "date-fns";
import { Download, ExternalLink } from "lucide-react";
import type { CvLibrary } from "@/actions/cvLibrary.actions";
import { cn } from "@/lib/utils";

const TARGET = 75;
const CLOSED = ["Archived", "Rejected", "Withdrawn", "Expired", "Offer Declined"];
const fileUrl = (rel: string, download = false) =>
  `/api/cv/file?path=${encodeURIComponent(rel)}${download ? "&download=1" : ""}`;

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
      <div className="flex items-baseline justify-between gap-2 border-b pb-1.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {meta && <span className="hidden text-xs text-muted-foreground sm:inline">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function PdfLinks({ open, download }: { open: string; download: string }) {
  return (
    <div className="flex shrink-0 gap-1">
      <a href={open} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-accent">
        <ExternalLink className="h-3.5 w-3.5" /> Open
      </a>
      <a href={download} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-accent" aria-label="Download">
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">{children}</li>
);

export function CvLibraryPage({ data, gaps, knowledge }: { data: CvLibrary; gaps: React.ReactNode; knowledge: React.ReactNode }) {
  const isReady = (j: CvLibrary["jobCvs"][number]) => (j.ats ?? 0) >= TARGET && j.mustFix === 0;
  // Open jobs first, ready-to-send at the top; closed ones folded away.
  const openCvs = data.jobCvs
    .filter((j) => !CLOSED.includes(j.status))
    .sort((a, b) => Number(isReady(b)) - Number(isReady(a)) || (b.ats ?? 0) - (a.ats ?? 0));
  const closedCvs = data.jobCvs.filter((j) => CLOSED.includes(j.status));
  const ready = openCvs.filter(isReady).length;
  const jobCvRow = (j: CvLibrary["jobCvs"][number]) => {
    const ok = isReady(j);
    return (
      <Row key={j.jobId}>
        <Link href={`/dashboard/myjobs/${j.jobId}?tab=cv`} className="min-w-0 flex-1">
          <div className="truncate text-sm">
            <span className="font-medium">{j.company}</span>
            <span className="text-muted-foreground"> · {j.title}</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            <span className={cn("font-medium tabular-nums", ok ? "text-signal" : "text-amber-700 dark:text-amber-400")}>
              {j.ats != null ? `${j.ats}% ATS` : "not scored"}
            </span>
            {j.mustFix ? ` · ${j.mustFix} must-fix` : ok ? " · ready" : ""} · {j.status}
            {j.updatedAt ? ` · ${format(j.updatedAt, "d MMM")}` : ""}
          </div>
        </Link>
        {j.pdf && <PdfLinks open={`/api/cv/job/${j.jobId}`} download={`/api/cv/job/${j.jobId}?download=1`} />}
      </Row>
    );
  };
  return (
    <div className="col-span-3 mx-auto grid w-full max-w-[2400px] grid-cols-[minmax(0,1fr)] gap-8 pb-6 pt-1">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">My CVs</h1>
        <p className="text-sm text-muted-foreground">
          One CV per kind of role, a CV made for each job, and what Jobdormo knows about you. Every tailored CV is built from
          these and fact-checked against them.
        </p>
      </header>

      <div className="grid items-start gap-8 @5xl/main:grid-cols-2 @5xl/main:gap-10">
      <div className="grid min-w-0 content-start gap-8">
      <Section title="By kind of role" meta="Edit them in your CV folder">
        <ul>
          {data.tracks.map((t) => (
            <Row key={t.id}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">
                  {t.updatedAt ? `Updated ${format(t.updatedAt, "d MMM yyyy")}` : "No PDF yet"}
                </div>
              </div>
              {t.pdf && <PdfLinks open={fileUrl(t.pdf)} download={fileUrl(t.pdf, true)} />}
            </Row>
          ))}
        </ul>
      </Section>

      {data.other.length > 0 && (
        <Section title="Portfolio, letters and other PDFs">
          <ul>
            {data.other.map((o) => (
              <Row key={o.pdf}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{o.name}</div>
                  <div className="text-xs text-muted-foreground">{format(o.updatedAt, "d MMM yyyy")}</div>
                </div>
                <PdfLinks open={fileUrl(o.pdf)} download={fileUrl(o.pdf, true)} />
              </Row>
            ))}
          </ul>
        </Section>
      )}
      </div>
      <Section title="Made for a job" meta={`${ready} of ${openCvs.length} open jobs ready to send`}>
        {data.jobCvs.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">None yet. Open a job and press Tailor CV.</p>
        ) : (
          <>
            <ul>{openCvs.map(jobCvRow)}</ul>
            {closedCvs.length > 0 && (
              <details className="pt-1">
                <summary className="cursor-pointer py-1 text-xs text-muted-foreground hover:text-foreground">
                  {closedCvs.length} for closed jobs (rejected, archived or withdrawn)
                </summary>
                <ul>{closedCvs.map(jobCvRow)}</ul>
              </details>
            )}
          </>
        )}
      </Section>


      </div>

      <div className="grid items-start gap-8 @5xl/main:grid-cols-2 @5xl/main:gap-10">
      <Section title="What the jobs ask for that your CVs don't show">{gaps}</Section>

      <Section title="What Jobdormo knows about you">{knowledge}</Section>
      </div>
    </div>
  );
}
