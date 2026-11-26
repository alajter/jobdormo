"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addCheckedJob, applyTell, checkPostingFit, planTell } from "@/actions/tell.actions";
import type { FitCheck } from "@/lib/fit/fitRules";
import { FitCard } from "./FitCard";
import type { TellPlan } from "@/lib/tell";
import { toastError, toastSuccess } from "@/lib/toast";

const EXAMPLES = [
  "Acme rejected me",
  "Got an interview with Globex on Tuesday at 10",
  "Sent Dana the intro note, follow up next Monday",
];

// One line about what happened; Jobdormo proposes the changes and nothing is
// saved until Apply.
export function TellBox() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<TellPlan | null>(null);
  const [off, setOff] = useState<number[]>([]);
  const [reading, startRead] = useTransition();
  const [saving, startSave] = useTransition();
  const [added, setAdded] = useState<string | null>(null);
  const [fit, setFit] = useState<FitCheck | null>(null);
  const [fitBusy, setFitBusy] = useState<"add" | "tailor" | null>(null);
  // A long paste is a job posting: check the fit instead of reading it as news.
  const isPosting = (s: string) => s.trim().length > 400;

  const read = () =>
    startRead(async () => {
      setAdded(null);
      if (isPosting(text)) {
        setPlan(null);
        const res = await checkPostingFit(text);
        if (!res.success || !res.fit) return toastError(res.message);
        setFit(res.fit);
        return;
      }
      const res = await planTell(text);
      if (!res.success || !res.plan) return toastError(res.message);
      setPlan(res.plan);
      setOff([]);
    });

  const apply = () =>
    startSave(async () => {
      if (!plan) return;
      const kept = plan.changes.filter((_, i) => !off.includes(i));
      const res = await applyTell(kept, text);
      if (res.done) toastSuccess(`Saved ${res.done} change${res.done === 1 ? "" : "s"}.`);
      if (res.failed.length) toastError(`Couldn't save: ${res.failed.join("; ")}`);
      setAdded(res.addedJobId ?? null);
      setPlan(null);
      setText("");
      router.refresh();
    });

  const keptCount = plan ? plan.changes.length - off.length : 0;

  const addFit = async (tailor: boolean) => {
    if (!fit) return;
    setFitBusy(tailor ? "tailor" : "add");
    const res = await addCheckedJob(fit, text, tailor);
    setFitBusy(null);
    if (!res.success || !res.jobId) return toastError(res.message);
    toastSuccess(tailor ? `${fit.company} added. Tailoring the CV now; it shows up on the job in about a minute.` : `${fit.company} added to your board.`);
    setAdded(res.jobId);
    setFit(null);
    setText("");
    router.refresh();
  };

  return (
    <section aria-label="Tell Jobdormo" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <form
        className="flex min-w-0 items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) read();
        }}
      >
        <Textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) read();
            }
          }}
          placeholder="Tell Jobdormo what happened, or paste a job to check the fit"
          aria-label="Tell Jobdormo what happened, or paste a job to check the fit"
          className="max-h-40 min-h-11 min-w-0 resize-none overflow-y-auto bg-card text-[15px] [field-sizing:fixed] sm:text-sm"
          disabled={reading || saving}
        />
        <Button type="submit" className="h-11 shrink-0" disabled={!text.trim() || reading || saving}>
          {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
        </Button>
      </form>

      {!plan && !fit && !text && !added && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>For example:</span>
          {EXAMPLES.map((e) => (
            <button key={e} type="button" className="underline-offset-2 hover:text-foreground hover:underline" onClick={() => setText(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {added && (
        <p className="text-sm">
          Added.{" "}
          <Link href={`/dashboard/myjobs/${added}`} className="font-medium underline underline-offset-2">
            Open it
          </Link>{" "}
          to check the fit and tailor a CV.
        </p>
      )}

      {reading && isPosting(text) && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the posting and checking it against your CV… about half a minute.
        </p>
      )}

      {fit && <FitCard fit={fit} busy={fitBusy} onAdd={addFit} onClose={() => { setFit(null); setText(""); }} />}

      {plan && (
        <div className="grid gap-3 rounded-md border bg-card p-3 text-sm">
          {plan.summary && <p className="text-muted-foreground">{plan.summary}</p>}
          {plan.changes.length > 0 && (
            <ul className="grid gap-2">
              {plan.changes.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id={`tell-${i}`}
                    className="mt-1 h-4 w-4 accent-[hsl(var(--signal))]"
                    checked={!off.includes(i)}
                    onChange={(e) => setOff((o) => (e.target.checked ? o.filter((x) => x !== i) : [...o, i]))}
                  />
                  <label htmlFor={`tell-${i}`} className="leading-snug">
                    {c.label}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {plan.question && <p className="font-medium">{plan.question}</p>}
          {plan.changes.length === 0 && !plan.question && <p>Nothing to change. Say it with a name or a company?</p>}
          <div className="flex gap-2">
            {plan.changes.length > 0 && (
              <Button size="sm" onClick={apply} disabled={saving || keptCount === 0}>
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Apply {keptCount > 1 ? `${keptCount} changes` : ""}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setPlan(null)} disabled={saving}>
              {plan.changes.length ? "Cancel" : "Close"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
