"use client";

import { AgentMarkdown } from "@/components/agent/AgentMarkdown";
import { NoResumesNotice } from "@/components/agent/AgentResultCard/NoResumesNotice";
import { ResumeSelectionPrompt } from "@/components/agent/AgentResultCard/ResumeSelectionPrompt";
import type { AgentRecruiterReviewResult } from "@/models/agent.model";

export function RecruiterReviewResult({
  output,
}: {
  output: AgentRecruiterReviewResult;
}) {
  if (output.status === "no_job") {
    return (
      <p className="text-sm">
        Open the job you&apos;re applying for first. The recruiter reviews
        your CV for the job you&apos;re looking at.
      </p>
    );
  }

  if (output.status === "no_resumes") {
    return <NoResumesNotice />;
  }

  if (output.status === "needs_selection") {
    return (
      <ResumeSelectionPrompt
        prompt="Which resume should the recruiter review?"
        resumes={output.resumes}
        messageFor={(title) => `Recruiter review of my resume "${title}" for this job`}
      />
    );
  }

  if (output.status === "unreadable") {
    return (
      <p className="text-sm">
        Couldn&apos;t read <strong>{output.title}</strong> — {output.reason}
      </p>
    );
  }

  if (output.status === "generation_failed") {
    return (
      <p className="text-sm">
        Couldn&apos;t review for <strong>{output.jobTitle}</strong> — {output.reason}
      </p>
    );
  }

  return (
    <div className="text-sm">
      <AgentMarkdown text={output.body} />
      <p className="mt-2 text-xs text-muted-foreground">
        {output.personaName} · {output.jobTitle}
        {output.company ? ` at ${output.company}` : ""} · reviewed{" "}
        {output.resumeTitle}
      </p>
    </div>
  );
}
