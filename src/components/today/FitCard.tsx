"use client";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIT_VERDICTS, type FitCheck } from "@/lib/fit/fitRules";
import { cn } from "@/lib/utils";

const VERDICT_CLASS = {
  apply: "text-signal",
  long_shot: "text-amber-700 dark:text-amber-400",
  skip: "text-red-700 dark:text-red-400",
} as const;

const MARK = {
  met: { label: "Met", dot: "bg-signal", text: "text-signal" },
  partial: { label: "Partly", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  missing: { label: "Missing", dot: "bg-red-600 dark:bg-red-400", text: "text-red-700 dark:text-red-400" },
} as const;

function Reasons({ items, tone }: { items: string[]; tone: "good" | "bad" }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing stands out.</p>;
  return (
    <ul className="grid gap-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm leading-snug">
          <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", tone === "good" ? "bg-signal" : "bg-red-600 dark:bg-red-400")} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

// "Does this position fit me?": the verdict for a pasted posting, with the
// reasons, each requirement against the CV, the quick checks, and the way on.
export function FitCard({
  fit,
  busy,
  onAdd,
  onClose,
}: {
  fit: FitCheck;
  busy: "add" | "tailor" | null;
  onAdd: (tailor: boolean) => void;
  onClose: () => void;
}) {
  const facts = [
    fit.location && `${fit.location}${fit.workplace ? ` · ${fit.workplace}` : ""}`,
    fit.size && `${fit.size} people`,
    fit.ats && `generic ${fit.trackLabel ?? ""} CV matches ${fit.ats.score}% of its keywords`.replace("  ", " "),
  ].filter(Boolean);
  return (
    <div className="grid min-w-0 gap-4 rounded-md border bg-card p-4 text-sm">
      <div className="grid gap-1">
        <div className="text-xs text-muted-foreground">Fit check</div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={cn("text-xl font-semibold", VERDICT_CLASS[fit.verdict])}>{FIT_VERDICTS[fit.verdict].label}</span>
          <span className="min-w-0">
            <span className="font-semibold">{fit.company}</span>
            <span className="text-muted-foreground"> · {fit.title}</span>
          </span>
        </div>
        {facts.length > 0 && <div className="text-xs text-muted-foreground">{facts.join(" · ")}</div>}
        {fit.summary && <p className="pt-1 leading-relaxed">{fit.summary}</p>}
        {fit.about && <p className="text-xs text-muted-foreground">{fit.about}</p>}
      </div>

      {fit.onBoard && (
        <p className="rounded-md bg-muted px-3 py-2">
          Already on your board ({fit.onBoard.title}, {fit.onBoard.status}).{" "}
          <Link href={`/dashboard/myjobs/${fit.onBoard.jobId}`} className="font-medium underline underline-offset-2">
            Open it
          </Link>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <div className="border-b pb-1 text-xs font-semibold">Why apply</div>
          <Reasons items={[...fit.whyApply, ...(fit.known.length ? [`You know ${fit.known.slice(0, 2).map((k) => `${k.name}${k.title ? ` (${k.title})` : ""}`).join(" and ")}${fit.known.length > 2 ? ` and ${fit.known.length - 2} more` : ""} there.`] : [])]} tone="good" />
        </div>
        <div className="grid content-start gap-1.5">
          <div className="border-b pb-1 text-xs font-semibold">Why not</div>
          <Reasons items={fit.whyNot} tone="bad" />
        </div>
      </div>

      {fit.requirements.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Their requirements against your CV ({fit.requirements.filter((r) => r.status === "met").length} met ·{" "}
            {fit.requirements.filter((r) => r.status === "partial").length} partly · {fit.requirements.filter((r) => r.status === "missing").length} missing)
          </summary>
          <ul className="pt-2">
            {fit.requirements.map((r, i) => (
              <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-b border-border/60 py-2 last:border-0">
                <span className={cn("flex items-center gap-1.5 text-xs font-semibold", MARK[r.status].text)}>
                  <span aria-hidden className={cn("h-2 w-2 rounded-full", MARK[r.status].dot)} />
                  {MARK[r.status].label}
                </span>
                <span className="leading-snug">
                  {r.text}
                  {r.evidence && <span className="block text-xs text-muted-foreground">{r.evidence}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        {!fit.onBoard && (
          <>
            <Button size="sm" onClick={() => onAdd(true)} disabled={!!busy}>
              {busy === "tailor" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Add &amp; tailor CV
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAdd(false)} disabled={!!busy}>
              {busy === "add" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Add to board
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={onClose} disabled={!!busy}>
          {fit.verdict === "skip" ? "Not for me" : "Close"}
        </Button>
      </div>
    </div>
  );
}
