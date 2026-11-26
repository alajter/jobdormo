"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addCvFromText } from "@/actions/setup.actions";
import { updateCandidateNotes } from "@/actions/userSettings.actions";
import type { SetupStep } from "@/lib/setup/setup.server";
import { toastError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

const COPY: Record<SetupStep["id"], { title: string; why: string }> = {
  ai: {
    title: "Connect an AI model",
    why: "Jobdormo reads postings, tailors CVs and drafts messages with it. An Anthropic (Claude) key gives the best writing; Ollama runs locally for free.",
  },
  cv: {
    title: "Add your CV",
    why: "Paste your CV as text, once per kind of role you're going for (for example Product Manager, Head of Product). Every tailored CV starts from these and is fact-checked against them.",
  },
  notes: {
    title: "Tell Jobdormo about you",
    why: "What you want next, what you avoid, and the rules it must follow: titles you don't use, companies or stories never to mention, facts that aren't in your CV.",
  },
  rules: {
    title: "Set your search rules",
    why: "Where you can work, how big a company you'd join, roles you only take at a senior level. Optional; without them nothing is filtered out.",
  },
  connections: {
    title: "Import your LinkedIn connections",
    why: "So every job shows who you know there, and Today suggests who to ask before you apply. Optional.",
  },
};

function Step({ n, step, children }: { n: number; step: SetupStep; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b py-5 last:border-0">
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold",
          step.done ? "border-signal bg-signal text-signal-foreground" : "text-muted-foreground",
        )}
        aria-label={step.done ? "Done" : `Step ${n}`}
      >
        {step.done ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-base font-semibold">{COPY[step.id].title}</h2>
          <span className="text-xs text-muted-foreground">{step.done ? "Done" : step.required ? "Needed" : "Optional"}</span>
        </div>
        <p className="text-sm text-muted-foreground">{COPY[step.id].why}</p>
        {children}
      </div>
    </li>
  );
}

export function SetupPage({ steps, tracks, notes }: { steps: SetupStep[]; tracks: { label: string }[]; notes: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [cvText, setCvText] = useState("");
  const [about, setAbout] = useState(notes);
  const [busy, start] = useTransition();
  const done = steps.filter((s) => s.required && s.done).length;
  const required = steps.filter((s) => s.required).length;

  const addCv = () =>
    start(async () => {
      const res = await addCvFromText({ label, text: cvText });
      if (!res.success) return toastError(res.message);
      toastSuccess(`${res.label} CV created${res.pages ? ` (${res.pages} page${res.pages === 1 ? "" : "s"})` : ""}. Check it in My CVs.`);
      setLabel("");
      setCvText("");
      router.refresh();
    });

  const saveNotes = () =>
    start(async () => {
      const res = await updateCandidateNotes(about);
      if (!res?.success) return toastError(res?.message ?? "Couldn't save.");
      toastSuccess("Saved.");
      router.refresh();
    });

  const step = (id: SetupStep["id"]) => steps.find((s) => s.id === id)!;

  return (
    <div className="col-span-3 mx-auto grid w-full max-w-3xl gap-6 pb-10 pt-1">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Set up Jobdormo</h1>
        <p className="text-sm text-muted-foreground">
          {done === required ? "You're set. Everything below can be changed any time." : `${done} of ${required} needed steps done. About ten minutes in all.`}
        </p>
      </header>

      <ol>
        <Step n={1} step={step("ai")}>
          <div>
            <Button size="sm" variant={step("ai").done ? "outline" : "default"} asChild>
              <Link href="/dashboard/settings?section=ai-provider">Choose a model and add a key</Link>
            </Button>
          </div>
        </Step>

        <Step n={2} step={step("cv")}>
          {tracks.length > 0 && (
            <p className="text-sm">
              Your CVs: {tracks.map((t) => t.label).join(", ")}.{" "}
              <Link href="/dashboard/cvs" className="underline underline-offset-2">
                Open My CVs
              </Link>
            </p>
          )}
          <div className="grid gap-2 rounded-md border bg-card p-3">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Kind of role this CV is for, e.g. Product Manager"
              aria-label="Kind of role this CV is for"
              disabled={busy}
            />
            <Textarea
              rows={8}
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              placeholder="Paste the full text of your CV (copy it from the PDF or Word file)"
              aria-label="CV text"
              className="max-h-80 [field-sizing:fixed]"
              disabled={busy}
            />
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={addCv} disabled={busy || !label.trim() || cvText.trim().length < 200}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {tracks.length ? "Add another CV" : "Create my CV"}
              </Button>
              <span className="text-xs text-muted-foreground">Nothing is reworded: it keeps your text and puts it in a clean two-page layout.</span>
            </div>
          </div>
        </Step>

        <Step n={3} step={step("notes")}>
          <Textarea
            rows={6}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder={"What I'm looking for next: …\nWhat I avoid: …\nRules: never call me a …; don't mention …\nFacts not in my CV: …"}
            aria-label="About you"
            className="max-h-72 [field-sizing:fixed]"
            disabled={busy}
          />
          <div>
            <Button size="sm" variant="outline" onClick={saveNotes} disabled={busy || !about.trim()}>
              Save
            </Button>
          </div>
        </Step>

        <Step n={4} step={step("rules")}>
          <div>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/settings?section=search-rules">Set search rules</Link>
            </Button>
          </div>
        </Step>

        <Step n={5} step={step("connections")}>
          <div>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/settings?section=connections">Import Connections.csv</Link>
            </Button>
          </div>
        </Step>
      </ol>

      {done === required && (
        <Button asChild className="justify-self-start">
          <Link href="/dashboard">Go to Today</Link>
        </Button>
      )}
    </div>
  );
}
