"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  applyCvImprovement,
  getCvQuestions,
  proposeCvEdits,
  type CvQuestion,
  type ProposedEdit,
} from "@/actions/cvImprove.actions";
import { toastError, toastSuccess } from "@/lib/toast";
import type { GapCluster } from "@/models/gapReport.model";
import { useCvTracks } from "./CvTracksContext";
import { ALL_TRACKS, useActiveTrack } from "@/hooks/useActiveTrack";

type Step = "questions" | "edits";

// The track most of the gaps' jobs are on, so the right CV opens by default.
function mostCommonTrack(gaps: GapCluster[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const g of gaps)
    for (const j of g.jobs) if (j.track) counts.set(j.track, (counts.get(j.track) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

// Mounted only while open (keyed by its gaps), so its state starts fresh.
// One gap, or every gap on the panel at once.
export function ImproveCvDialog({
  gaps,
  onClose,
}: {
  gaps: GapCluster[];
  onClose: () => void;
}) {
  const tracks = useCvTracks();
  const router = useRouter();
  const [activeTrack] = useActiveTrack();
  const [trackId, setTrackId] = useState(() =>
    activeTrack !== ALL_TRACKS && tracks.some((t) => t.id === activeTrack)
      ? activeTrack
      : mostCommonTrack(gaps, tracks[0]?.id ?? ""),
  );
  const [step, setStep] = useState<Step>("questions");
  const [questions, setQuestions] = useState<CvQuestion[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [edits, setEdits] = useState<ProposedEdit[]>([]);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  // Same facts into the other CVs too (on by default).
  const [alsoOthers, setAlsoOthers] = useState(true);
  const otherCount = Math.max(0, tracks.length - 1);
  const [pending, startTransition] = useTransition();

  // Ask the AI for questions whenever the chosen CV changes.
  useEffect(() => {
    if (!trackId) return;
    let alive = true;
    getCvQuestions({
      trackId,
      gaps: gaps.map((g) => ({
        gap: g.gap,
        advice: g.advice,
        jobs: g.jobs.map((j) => `${j.company} · ${j.title}`),
      })),
    }).then((res) => {
      if (!alive) return;
      setLoadingQuestions(false);
      if (!res.success || !res.questions) return setError(res.message ?? "No questions.");
      setError(null);
      setQuestions(res.questions);
      setSkipped(res.skipped ?? []);
      setAnswers(res.questions.map(() => ""));
    });
    return () => {
      alive = false;
    };
  }, [gaps, trackId]);

  const changeTrack = (v: string) => {
    setTrackId(v);
    setQuestions([]);
    setLoadingQuestions(true);
  };

  const qa = () =>
    questions.map((q, i) => ({ question: `[${q.gap}] ${q.question}`, answer: answers[i] ?? "" }));
  const gapNames = gaps.map((g) => g.gap);

  const propose = () => {
    setError(null);
    startTransition(async () => {
      const res = await proposeCvEdits({ gaps: gapNames, trackId, answers: qa() });
      if (!res.success || !res.edits) return setError(res.message ?? "No edits.");
      if (res.edits.length === 0) {
        return setError("The AI found nothing it could add truthfully from these answers. Add more detail and try again.");
      }
      setEdits(res.edits);
      setPicked(res.edits.map(() => true));
      setStep("edits");
    });
  };

  const apply = () => {
    const chosen = edits.filter((_, i) => picked[i]);
    if (!chosen.length) return setError("Pick at least one edit.");
    startTransition(async () => {
      const res = await applyCvImprovement({
        gaps: gapNames,
        trackId,
        edits: chosen.map(({ action, index, html }) => ({ action, index, html })),
        answers: qa(),
        alsoOthers: alsoOthers && otherCount > 0,
      });
      if (!res.success) return toastError(res.message);
      toastSuccess(
        `${res.message} Re-matching your jobs in the background; reload in a few minutes to see the updated gaps.`,
      );
      onClose();
      router.refresh();
    });
  };

  const track = tracks.find((t) => t.id === trackId);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Improve my CV: {gaps.length === 1 ? gaps[0].gap : `${gaps.length} gaps at once`}
          </DialogTitle>
          <DialogDescription>
            {step === "questions"
              ? "Answer with real facts only. The AI turns them into CV edits; nothing is invented and nothing is saved until you apply."
              : "Pick the edits to apply. The CV file is backed up first, and the PDF is re-rendered."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">CV:</span>
          <Select
            value={trackId}
            disabled={pending || step === "edits"}
            onValueChange={changeTrack}
          >
            <SelectTrigger className="h-8 w-auto min-w-[220px]">
              <SelectValue placeholder="Choose a CV" />
            </SelectTrigger>
            <SelectContent>
              {tracks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {track && <span className="truncate text-xs text-muted-foreground">{track.file}</span>}
        </div>

        {step === "questions" && (
          <div className="flex flex-col gap-4">
            {loadingQuestions && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading your CV and preparing questions… (up to a minute when there are many gaps)
              </p>
            )}
            {skipped.length > 0 && (
              <p className="text-xs text-muted-foreground">
                No CV edit can honestly close: {skipped.join("; ")}. Those are for interview prep.
              </p>
            )}
            {questions.map((q, i) => (
              <label key={`${q.gap}-${i}`} className="flex flex-col gap-1.5 text-sm">
                {(i === 0 || questions[i - 1].gap !== q.gap) && gaps.length > 1 && (
                  <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {q.gap}
                  </span>
                )}
                <span className="font-medium">{q.question}</span>
                <Textarea
                  rows={2}
                  value={answers[i] ?? ""}
                  placeholder="Real facts, numbers, examples. Leave empty to skip."
                  onChange={(e) =>
                    setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
              </label>
            ))}
          </div>
        )}

        {step === "edits" && (
          <ul className="flex flex-col gap-3">
            {edits.map((e, i) => (
              <li key={i} className="rounded-md border p-3 text-sm">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={picked[i] ?? false}
                    onChange={() => setPicked((p) => p.map((x, j) => (j === i ? !x : x)))}
                  />
                  <span className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {e.action === "replace" ? "Rewrite" : "New bullet"} · {e.context}
                    </span>
                    {e.before && (
                      <span className="text-muted-foreground line-through">{e.before}</span>
                    )}
                    <span dangerouslySetInnerHTML={{ __html: e.html }} />
                    {e.reason && <span className="text-xs text-muted-foreground">Why: {e.reason}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {step === "edits" && otherCount > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-md bg-muted/50 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={alsoOthers}
              disabled={pending}
              onChange={() => setAlsoOthers((v) => !v)}
            />
            <span>
              Also update my other {otherCount} CVs with the same facts, fitted to each.
              <span className="block text-xs text-muted-foreground">
                Each file is backed up first; a CV that would go past two pages is left unchanged.
                This adds a minute or two.
              </span>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {step === "edits" && (
            <Button variant="ghost" disabled={pending} onClick={() => setStep("questions")}>
              Back to answers
            </Button>
          )}
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          {step === "questions" ? (
            <Button disabled={pending || loadingQuestions || questions.length === 0} onClick={propose}>
              {pending ? "Drafting edits…" : "Draft CV edits"}
            </Button>
          ) : (
            <Button disabled={pending} onClick={apply}>
              {pending
                ? alsoOthers && otherCount > 0
                  ? "Updating your CVs…"
                  : "Applying…"
                : alsoOthers && otherCount > 0
                  ? "Apply to all CVs"
                  : "Apply to CV"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
