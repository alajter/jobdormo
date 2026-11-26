"use client";
import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTailorState, setAppliedCv, type TailorState } from "@/actions/tailorCv.actions";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";

// The job page's CV tab: where this job's CV stands, in one look, and the
// way into Tailor CV. The dialog does the work; this only reports.
export function JobCvPanel({ jobId, onOpen }: { jobId: string; onOpen: () => void }) {
  const [state, setState] = useState<TailorState | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const correct = async (cv: "tailored" | "generic") => {
    setSaving(true);
    const res = await setAppliedCv(jobId, cv);
    setSaving(false);
    if (!res.success) return toastError("Couldn't save which CV you sent.");
    setState(await getTailorState(jobId));
  };

  useEffect(() => {
    let alive = true;
    getTailorState(jobId).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [jobId]);

  if (state === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const target = state?.target ?? 75;
  const high = (state?.review ?? []).filter((i) => i.severity === "high").length;
  const other = (state?.review ?? []).length - high;
  const tailored = state?.hasTailored ? state.tailored : null;
  const ready = tailored != null && tailored >= target && high === 0;
  const pdf = `/api/cv/job/${jobId}`;

  return (
    <div className="grid gap-4 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <div className="text-xs text-muted-foreground">ATS keyword match</div>
          <div className="tabular-nums">
            {state?.base != null && (
              <span className="text-muted-foreground">
                generic CV {state.base}%{tailored != null ? " → " : ""}
              </span>
            )}
            {tailored != null && (
              <span className={cn("text-xl font-semibold", ready ? "text-signal" : "text-amber-700 dark:text-amber-400")}>
                {tailored}%
              </span>
            )}
            {state?.base == null && tailored == null && <span className="text-muted-foreground">Not checked yet</span>}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Fact-check</div>
          <div>
            {!state?.hasTailored
              ? "No CV for this job yet"
              : state.review == null
                ? "Not run yet"
                : high
                  ? `${high} must-fix${other ? `, ${other} to look at` : ""}`
                  : other
                    ? `${other} to look at`
                    : "No issues"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Status</div>
          <div className={cn("font-medium", ready ? "text-signal" : "")}>
            {ready
              ? "Ready to send"
              : !state?.hasTailored
                ? "Tailor it before applying"
                : tailored != null && tailored < target
                  ? `Below ${target}%: answer the questions`
                  : "Fix the must-fix issues"}
          </div>
        </div>
      </div>
      {state?.appliedCv && (
        <p className="text-sm">
          <span className="text-muted-foreground">Sent with: </span>
          <span className="font-medium">
            {state.appliedCv === "tailored" ? "the tailored CV" : "the generic CV"}
            {state.appliedAts != null ? ` (${state.appliedAts}% ATS)` : ""}
          </span>
          {(state.appliedCv === "generic" ? state.hasTailored : true) && (
            <button
              type="button"
              disabled={saving}
              className="ml-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => correct(state.appliedCv === "tailored" ? "generic" : "tailored")}
            >
              Actually sent the {state.appliedCv === "tailored" ? "generic" : "tailored"} one
            </button>
          )}
        </p>
      )}
      {state?.hasTailored && (state.missing?.length ?? 0) > 0 && (
        <p className="text-muted-foreground">
          Missing from the CV: {state.missing.slice(0, 8).join(", ")}
          {state.missing.length > 8 ? "…" : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onOpen}>{state?.hasTailored ? "Open Tailor CV" : "Tailor CV"}</Button>
        {state?.hasTailored && (
          <>
            <Button variant="outline" asChild>
              <a href={pdf} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Open PDF
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`${pdf}?download=1`}>
                <Download className="mr-2 h-4 w-4" /> Download
              </a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
