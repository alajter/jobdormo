"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, RefreshCw, Sparkles, Target, ThumbsDown } from "lucide-react";
import { getRematchStatus, rematchAllJobs } from "@/actions/rematch.actions";
import { format } from "date-fns";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { archiveJobsForGap } from "@/actions/gapReport.actions";
import { toastError, toastSuccess } from "@/lib/toast";
import type { GapCluster, GapReportView } from "@/models/gapReport.model";
import { ImproveCvDialog } from "./ImproveCvDialog";
import { useCvTracks, useTrackLabel } from "./CvTracksContext";
import { ALL_TRACKS, useActiveTrack } from "@/hooks/useActiveTrack";

const COLLAPSED_COUNT = 5;

// "What you're missing": gaps that repeat across job matches, most common
// first, each with how to address it and the jobs where it came up.
export function GapsSummary({ report }: { report: GapReportView | null }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [rejecting, setRejecting] = useState<GapCluster | null>(null);
  const [improving, setImproving] = useState<GapCluster[] | null>(null);
  const router = useRouter();
  const [rematching, startRematch] = useTransition();
  // Whether a background re-match is running (polled, so it survives reloads).
  const [running, setRunning] = useState(false);
  const wasRunning = useRef(false);
  useEffect(() => {
    let alive = true;
    const check = () =>
      getRematchStatus().then(({ running: now }) => {
        if (!alive) return;
        if (wasRunning.current && !now) {
          toastSuccess("Re-match finished: scores and gaps are updated.");
          router.refresh();
        }
        wasRunning.current = now;
        setRunning(now);
      });
    check();
    const id = setInterval(check, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [router]);
  const rematch = () =>
    startRematch(async () => {
      const res = await rematchAllJobs();
      if (res.success) {
        toastSuccess(res.message);
        wasRunning.current = true;
        setRunning(true);
      } else toastError(res.message);
    });
  const hasTracks = useCvTracks().length > 0;
  const [pending, startTransition] = useTransition();
  const [activeTrack] = useActiveTrack();
  const trackLabel = useTrackLabel();
  if (!report || report.clusters.length === 0) return null;

  // Scoped to the track being viewed: recount each gap on that track's jobs.
  const allTracks = activeTrack === ALL_TRACKS;
  const visible = allTracks
    ? report.clusters
    : report.clusters
        .map((c) => ({ ...c, jobs: c.jobs.filter((j) => j.track === activeTrack) }))
        .filter((c) => c.jobs.length > 0)
        .sort((a, b) => b.jobs.length - a.jobs.length);
  const jobCount = allTracks
    ? report.jobCount
    : new Set(visible.flatMap((c) => c.jobs.map((j) => j.id))).size;

  const confirmReject = () => {
    if (!rejecting) return;
    const cluster = rejecting;
    startTransition(async () => {
      const res = await archiveJobsForGap(cluster.gap, cluster.jobs.map((j) => j.id));
      setRejecting(null);
      if (!res.success) return toastError(res.message);
      toastSuccess(`Archived ${res.archived} ${res.archived === 1 ? "job" : "jobs"}.`);
      router.refresh();
    });
  };

  const clusters = showAll ? visible : visible.slice(0, COLLAPSED_COUNT);

  return (
    <Card className="mb-4 p-4">
      <div className="flex items-center gap-2">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Target className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">What you&apos;re missing</span>
        <span className="text-sm text-muted-foreground">
          top gaps across {jobCount} matched jobs{allTracks ? "" : ` on the ${trackLabel(activeTrack)} track`} · {format(report.createdAt, "PP")}
        </span>
      </button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0"
        disabled={rematching || running}
        title={
          running
            ? "A re-match is running in the background; this page refreshes when it finishes"
            : "Re-run the full AI match on every open job against its track's CV, then rebuild these gaps"
        }
        onClick={rematch}
      >
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${rematching || running ? "animate-spin" : ""}`} />
        {running ? "Re-matching…" : "Re-match all jobs"}
      </Button>
      {open && hasTracks && visible.length > 1 && (
        <Button
          size="sm"
          className="h-8 shrink-0"
          title="One pass over every gap shown: questions for all, one set of CV edits"
          onClick={() => setImproving(visible)}
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Improve my CV for all {visible.length} gaps
        </Button>
      )}
      </div>

      {open && (
        <ul className="mt-3 flex flex-col divide-y">
          {clusters.map((c) => {
            const isOpen = expanded === c.gap;
            return (
              <li key={c.gap} className="py-2.5">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : c.gap)}
                >
                  <Badge variant="secondary" className="mt-0.5 shrink-0 tabular-nums">
                    {c.jobs.length} {c.jobs.length === 1 ? "job" : "jobs"}
                  </Badge>
                  <span className="flex-1">
                    <span className="text-sm font-medium">{c.gap}</span>
                    {c.advice && (
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {c.advice}
                      </span>
                    )}
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[72px]">
                    {c.jobs.map((j) => (
                      <Link
                        key={j.id}
                        href={`/dashboard/myjobs/${j.id}`}
                        className="rounded-md bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
                      >
                        {j.company} · {j.title}
                      </Link>
                    ))}
                    {hasTracks && (
                      <Button
                        size="sm"
                        className="ml-auto h-7"
                        onClick={() => setImproving([c])}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        Improve my CV
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className={hasTracks ? "h-7" : "ml-auto h-7"}
                      onClick={() => setRejecting(c)}
                    >
                      <ThumbsDown className="mr-1.5 h-3.5 w-3.5" />
                      Not for me
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
          {visible.length > COLLAPSED_COUNT && (
            <li className="pt-2.5">
              <button
                type="button"
                className="text-sm text-muted-foreground underline hover:text-foreground"
                onClick={() => setShowAll((s) => !s)}
              >
                {showAll ? "Show fewer" : `Show all ${visible.length} gaps`}
              </button>
            </li>
          )}
        </ul>
      )}

      {improving && (
        <ImproveCvDialog
          key={improving.map((g) => g.gap).join("|")}
          gaps={improving}
          onClose={() => setImproving(null)}
        />
      )}

      <AlertDialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Not for me: {rejecting?.gap}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Exactly these jobs will be archived (you can restore them by
                  changing their status). Jobs you applied to are never touched.
                  The web search agent will also stop looking for roles that
                  need this.
                </p>
                <ul className="list-disc pl-5">
                  {rejecting?.jobs.map((j) => (
                    <li key={j.id}>
                      {j.company} · {j.title}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={confirmReject}>
              {pending ? "Archiving…" : "Archive these jobs"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
