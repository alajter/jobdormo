"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { checkAts } from "@/actions/tailorCv.actions";
import { toastError } from "@/lib/toast";
import { AtsScore } from "./AtsScore";

// The jobs table's ATS cell: "Check" scores a job that has no score yet; a
// score below the target opens the job straight into Tailor CV.
const TARGET = 75;

export function AtsCell({ jobId, base, tailored }: { jobId: string; base?: number | null; tailored?: number | null }) {
  const router = useRouter();
  const [scores, setScores] = useState({ base: base ?? null, tailored: tailored ?? null });
  const [pending, start] = useTransition();

  if (scores.base == null && scores.tailored == null) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await checkAts(jobId);
            if (!res.success) return toastError(res.message);
            setScores({ base: res.base ?? null, tailored: res.tailored ?? null });
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
        title="Score this job's ATS keyword match against your CV"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {pending ? "Checking" : "Check"}
      </button>
    );
  }
  const best = scores.tailored ?? scores.base ?? 0;
  if (best >= TARGET) return <AtsScore base={scores.base} tailored={scores.tailored} />;
  return (
    <Link
      href={`/dashboard/myjobs/${jobId}?tailor=1`}
      className="rounded px-1 hover:bg-muted"
      title={scores.tailored != null ? "Below 75%: open Tailor CV to answer the questions" : "Not tailored yet: open Tailor CV"}
    >
      <AtsScore base={scores.base} tailored={scores.tailored} />
    </Link>
  );
}
