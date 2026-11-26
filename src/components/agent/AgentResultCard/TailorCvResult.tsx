"use client";

import { Download, ExternalLink } from "lucide-react";
import type { AgentTailorCvResult } from "@/models/agent.model";

// The tailored CV: ATS keyword match before and after, what changed, and the PDF.
export function TailorCvResult({ output }: { output: AgentTailorCvResult }) {
  if (output.status === "no_job") {
    return <p className="text-sm">Open the job&apos;s page first, then ask again.</p>;
  }
  if (output.status === "failed") {
    return <p className="text-sm">Couldn&apos;t tailor the CV: {output.reason}</p>;
  }
  return (
    <div className="grid gap-2 text-sm">
      <p>
        CV for <strong>{output.jobTitle}</strong>, from your {output.trackLabel} CV.
      </p>
      <p>
        ATS keyword match: <span className="text-muted-foreground line-through">{output.atsBefore}%</span>{" "}
        <strong>{output.atsAfter}%</strong> · {output.changes} changes ·{" "}
        {output.pages && output.pages <= 2 ? `${output.pages} page${output.pages === 1 ? "" : "s"}` : `${output.pages ?? "?"} pages, check it`}
      </p>
      {output.missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Left out because they&apos;re not in your CV or notes: {output.missing.join(", ")}. Have any of them? Tell me
          where and how, and I&apos;ll redo the CV with them (and remember them for next time).
        </p>
      )}
      <div className="flex gap-3 text-sm">
        <a href={output.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
          <ExternalLink className="h-3.5 w-3.5" /> Open PDF
        </a>
        <a href={`${output.pdfUrl}?download=1`} className="inline-flex items-center gap-1 underline">
          <Download className="h-3.5 w-3.5" /> Download
        </a>
      </div>
    </div>
  );
}
