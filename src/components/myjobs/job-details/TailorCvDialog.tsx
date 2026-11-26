"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileUser, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { fixCvIssue, getTailorState, reviewCv, tailorCv, type TailorState } from "@/actions/tailorCv.actions";
import type { CvIssue } from "@/lib/cv/review";
import type { TailorResult } from "@/lib/cv/tailor";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Result = Omit<TailorResult, "pdf">;

// "Tailor CV": a CV (up to two pages) for this job, from the CV for its
// track, with the posting's ATS keywords used wherever they're true. Ready to
// send at the ATS target; below it, the missing keywords become questions.
export function TailorCvDialog({
  jobId,
  jobLabel,
  hasTailored,
  onClose,
}: {
  jobId: string;
  jobLabel: string;
  hasTailored: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [instructions, setInstructions] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [state, setState] = useState<TailorState | null>(null);
  // Missing keywords the user says they do have: keyword -> how, in their words.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [fixing, startFix] = useTransition();
  // The fact-check of the tailored CV; updated after each fix or re-review.
  const [review, setReview] = useState<CvIssue[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const pdfUrl = `/api/cv/job/${jobId}`;

  useEffect(() => {
    let alive = true;
    getTailorState(jobId).then((s) => {
      if (!alive) return;
      setState(s);
      setReview(s?.review ?? null);
    });
    return () => {
      alive = false;
    };
  }, [jobId]);

  const target = state?.target ?? 75;
  const before = result?.ats.before ?? state?.base ?? null;
  const after = result?.ats.after ?? state?.tailored ?? null;
  const missing = result?.ats.missing ?? state?.missing ?? [];
  const tailoredExists = !!result || !!state?.hasTailored || hasTailored;
  const issues = (review ?? []).filter((i) => !hidden.includes(i.quote));
  const highIssues = issues.filter((i) => i.severity === "high").length;
  const ready = after != null && after >= target && highIssues === 0;

  // After a fix or a re-check: reload scores, missing keywords and review.
  const refreshState = async () => {
    const s = await getTailorState(jobId);
    if (!s) return;
    setState(s);
    setReview(s.review);
    setResult((r) => (r ? { ...r, ats: { ...r.ats, after: s.tailored ?? r.ats.after, missing: s.missing } } : r));
  };

  const facts = Object.entries(answers)
    .filter(([, a]) => a.trim())
    .map(([keyword, answer]) => ({ keyword, answer }));

  const run = (withFacts = false) =>
    start(async () => {
      const res = await tailorCv(jobId, { instructions, facts: withFacts ? facts : [] });
      if (!res.success || !res.result) return toastError(res.message);
      setResult(res.result);
      setReview(res.result.review);
      setHidden([]);
      setAnswers({});
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUser className="h-4 w-4" /> Tailor my CV
          </DialogTitle>
          <DialogDescription>
            A CV for {jobLabel} (up to two pages), made from your CV for this kind of role. It uses the posting&apos;s
            keywords wherever they&apos;re true for you and never invents titles, skills or results. Ready to send at{" "}
            {target}%+.
          </DialogDescription>
        </DialogHeader>

        {tailoredExists && after != null && (
          <div className="flex flex-wrap items-center gap-4 rounded-md border p-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">ATS keyword match</div>
              <div className="text-2xl font-semibold">
                {before != null && <span className="text-muted-foreground line-through decoration-1">{before}%</span>}{" "}
                <span className={cn(ready ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-300")}>
                  {after}%
                </span>
              </div>
            </div>
            {ready ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ready to send
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {after < target ? `Below ${target}%: answer the questions below` : `Fix the ${highIssues} serious issue${highIssues === 1 ? "" : "s"} below`}
              </span>
            )}
            {result && (
              <span className="text-xs text-muted-foreground">
                From your {result.trackLabel} CV · {result.changes.length} changes ·{" "}
                {result.pages && result.pages <= 2 ? `${result.pages} page${result.pages === 1 ? "" : "s"}` : `${result.pages ?? "?"} pages, check it`}
              </span>
            )}
          </div>
        )}

        {!tailoredExists && (
          <div className="grid gap-3 text-sm">
            <Textarea
              rows={2}
              placeholder="Optional: anything to stress or leave out (e.g. lead with the AI security work)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={pending}
            />
          </div>
        )}

        {pending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the posting, tailoring and rendering the PDF… about a
            minute.
          </p>
        )}

        {tailoredExists && review !== null && (
          <div className="grid gap-2 rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" /> Fact-check
                <span className="text-xs font-normal text-muted-foreground">
                  {issues.length === 0 ? "no issues found" : `${issues.length} to look at`}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={fixing || pending}
                onClick={() =>
                  startFix(async () => {
                    const res = await reviewCv(jobId);
                    if (!res.success || !res.review) return toastError(res.message);
                    setHidden([]);
                    await refreshState();
                  })
                }
              >
                {fixing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Check again
              </Button>
            </div>
            {issues.map((i) => (
              <div key={i.quote} className="grid gap-1 rounded-md border p-2 text-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={cn(
                      "h-3.5 w-3.5",
                      i.severity === "high" ? "text-red-600" : i.severity === "medium" ? "text-amber-600" : "text-muted-foreground",
                    )}
                  />
                  <span className="font-medium">{i.severity === "high" ? "Must fix" : i.severity === "medium" ? "Should fix" : "Wording"}</span>
                  <span className="text-muted-foreground">· {i.kind}</span>
                </div>
                <div className="text-muted-foreground line-through">{i.quote}</div>
                <div>{i.problem}</div>
                {i.fix && <div className="text-green-700 dark:text-green-400">→ {i.fix}</div>}
                <div className="flex gap-2">
                  {i.kind !== "structure" && (
                    <Button
                      size="sm"
                      className="h-7"
                      disabled={fixing}
                      onClick={() =>
                        startFix(async () => {
                          const res = await fixCvIssue(jobId, { quote: i.quote, fix: i.fix });
                          if (!res.success) return toastError(res.message);
                          setReview((r) => (r ?? []).filter((x) => x.quote !== i.quote));
                          await refreshState();
                          router.refresh();
                        })
                      }
                    >
                      {i.fix ? "Apply fix" : "Remove it"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setHidden((h) => [...h, i.quote])}>
                    It&apos;s fine
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tailoredExists && missing.length > 0 && (
          <div className="grid gap-2 rounded-md border border-dashed p-3 text-sm">
            <div>
              <div className="font-medium">Do you have any of these?</div>
              <p className="text-xs text-muted-foreground">
                The posting asks for them, and they&apos;re not in your CVs, LinkedIn or notes. For each one you really
                have, say where and how in a few words; leave the rest empty. Answers are saved for every later CV.
              </p>
            </div>
            {missing.map((k) => (
              <label key={k} className="grid grid-cols-[minmax(120px,190px)_1fr] items-center gap-2 text-xs">
                <span className="font-medium">{k}</span>
                <Input
                  className="h-8 text-xs"
                  placeholder="Where and how (or leave empty)"
                  value={answers[k] ?? ""}
                  disabled={pending}
                  onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))}
                />
              </label>
            ))}
            <div>
              <Button size="sm" onClick={() => run(true)} disabled={pending || facts.length === 0}>
                {`Update the CV with ${facts.length || "my"} answer${facts.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}

        {result && result.changes.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              What changed ({result.changes.length})
            </summary>
            <ul className="mt-2 grid gap-2">
              {result.changes.map((c, i) => (
                <li key={i} className="rounded-md border p-2 text-xs">
                  <div className="mb-1 text-muted-foreground">
                    {c.action === "remove" ? "Removed" : c.action === "insert_after" ? "New bullet" : "Rewritten"} · {c.context}
                  </div>
                  {c.before && <div className="text-muted-foreground line-through">{c.before}</div>}
                  {c.after && <div>{c.after}</div>}
                </li>
              ))}
            </ul>
          </details>
        )}

        {tailoredExists && (
          <p className="text-xs text-muted-foreground">
            Read it before sending: every line should be something you can talk about in an interview.
          </p>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Close</Button>
          {tailoredExists && (
            <>
              <Button variant="outline" asChild>
                <a href={pdfUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Open PDF
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`${pdfUrl}?download=1`}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </a>
              </Button>
            </>
          )}
          <Button onClick={() => run(false)} disabled={pending} variant={tailoredExists ? "outline" : "default"}>
            {pending ? "Tailoring…" : tailoredExists ? "Tailor again" : "Tailor my CV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
