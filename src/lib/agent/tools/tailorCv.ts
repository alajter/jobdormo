import "server-only";
import { tool } from "ai";
import prisma from "@/lib/db";
import { AGENT_TOOL_DESCRIPTIONS } from "@/lib/agent/prompt";
import { AgentTailorCvSchema } from "@/models/agent.schema";
import { tailorCvForJob } from "@/lib/cv/tailor";
import { log } from "@/lib/telemetry";
import type { AgentTailorCvResult } from "@/models/agent.model";

// userId from the session and pageJobId from page context are closure
// parameters, never model input: the same IDOR boundary as match_job.
export function buildTailorCvTool(ctx: { userId: string; pageJobId?: string }) {
  return tool({
    description: AGENT_TOOL_DESCRIPTIONS.tailor_cv,
    inputSchema: AgentTailorCvSchema,
    execute: async (raw): Promise<AgentTailorCvResult> => {
      if (!ctx.pageJobId) return { status: "no_job" };
      try {
        const job = await prisma.job.findFirst({
          where: { id: ctx.pageJobId, userId: ctx.userId },
          select: { id: true, JobTitle: { select: { label: true } }, Company: { select: { label: true } } },
        });
        if (!job) return { status: "no_job" };
        const r = await tailorCvForJob(ctx.userId, job.id, { instructions: raw?.instructions, facts: raw?.facts });
        return {
          status: "ok",
          jobTitle: `${job.JobTitle.label} at ${job.Company.label}`,
          trackLabel: r.trackLabel,
          atsBefore: r.ats.before,
          atsAfter: r.ats.after,
          missing: r.ats.missing,
          changes: r.changes.length,
          highlights: r.changes
            .filter((c) => c.after)
            .slice(0, 6)
            .map((c) => `${c.context}: ${c.after}`),
          pages: r.pages,
          pdfUrl: `/api/cv/job/${job.id}`,
        };
      } catch (error) {
        log.error("[agent-chat] tailor_cv failed", { error: String(error) });
        return { status: "failed", reason: error instanceof Error ? error.message : "The CV could not be tailored." };
      }
    },
  });
}
