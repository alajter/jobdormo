import "server-only";
import { readCandidateNotes } from "@/lib/agent/candidateNotes";

import { tool, type LanguageModel, type UIMessageStreamWriter } from "ai";
import { APP_CONSTANTS, TEMPERATURES } from "@/lib/constants";
import { AGENT_TOOL_DESCRIPTIONS } from "@/lib/agent/prompt";
import { AgentRecruiterReviewSchema } from "@/models/agent.schema";
import { resolveJobForAgent } from "@/lib/agent/jobLookup";
import { resolveResumeForAgent } from "@/lib/agent/resumeLookup";
import { preprocessResume } from "@/lib/ai/tools/preprocessing";
import { preprocessJob } from "@/lib/ai/tools/preprocessing-job";
import { stripThinking } from "@/lib/ai/stripThinking";
import {
  RECRUITER_PERSONAS,
  buildRecruiterReviewPrompt,
  buildRecruiterReviewSystemPrompt,
  pickRecruiterPersona,
} from "@/lib/ai/prompts/recruiter-review";
import {
  runNestedGeneration,
  type NestedGenerationGuard,
} from "@/lib/agent/nestedGeneration";
import type { AgentRecruiterReviewResult } from "@/models/agent.model";
import db from "@/lib/db";

type RecruiterReviewContext = {
  userId: string;
  pageJobId?: string;
  pastedText?: string;
  model: LanguageModel;
  provider: string;
  modelName: string;
  writer: UIMessageStreamWriter;
  guard: NestedGenerationGuard;
};

/**
 * A recruiter, picked to fit the role, reviews the user's resume (and any
 * letter or note) for the job they are viewing: in character first, then
 * plain fixes. Same lookup and IDOR boundary as match_job: the job comes from
 * server-held page context, never from model input. Nothing is written.
 */
export function buildRecruiterReviewTool(ctx: RecruiterReviewContext) {
  return tool({
    description: AGENT_TOOL_DESCRIPTIONS.recruiter_review,
    inputSchema: AgentRecruiterReviewSchema,
    execute: async (raw, { toolCallId, abortSignal }): Promise<AgentRecruiterReviewResult> => {
      const jobLookup = await resolveJobForAgent(ctx.userId, ctx.pageJobId);
      if (jobLookup.status === "no_job") return { status: "no_job" };

      const job = jobLookup.job;
      const jobTitle = job.JobTitle?.label ?? "this job";
      const company = job.Company?.label ?? "";

      const resumeLookup = await resolveResumeForAgent(ctx.userId, {
        title: raw?.resumeTitle,
        pageResumeId: job.resumeId ?? undefined,
      });
      if (resumeLookup.status === "no_resumes") return { status: "no_resumes" };
      if (resumeLookup.status === "needs_selection") {
        return { status: "needs_selection", resumes: resumeLookup.resumes };
      }

      const resume = resumeLookup.resume;
      const [resumePre, jobPre] = await Promise.all([
        preprocessResume(resume),
        preprocessJob(job),
      ]);
      if (!jobPre.success) {
        return {
          status: "unreadable",
          what: "job",
          title: jobTitle,
          reason: "Its description may be too short or missing. Add the full posting and try again.",
        };
      }
      if (!resumePre.success) {
        return {
          status: "unreadable",
          what: "resume",
          title: resume.title,
          reason: "It may be too short or missing content. Check it in Profile → Resumes.",
        };
      }

      const personaId =
        raw?.persona && raw.persona !== "auto"
          ? raw.persona
          : pickRecruiterPersona({ title: jobTitle, description: job.description });
      const persona = RECRUITER_PERSONAS[personaId];

      // The model copies a letter it was given into documents; a paste chip
      // on this turn is the same material arriving the other way.
      const documents = raw?.documents?.trim() || ctx.pastedText?.trim() || undefined;

      const candidateNotes = await readCandidateNotes(ctx.userId);

      const generation = await runNestedGeneration({
        model: ctx.model,
        userId: ctx.userId,
        system: buildRecruiterReviewSystemPrompt(personaId),
        prompt: buildRecruiterReviewPrompt({
          resumeText: resumePre.data.normalizedText,
          jobText: jobPre.data.normalizedText,
          documents,
          candidateNotes,
        }),
        temperature: TEMPERATURES.FEEDBACK,
        numCtx: APP_CONSTANTS.AI_OLLAMA_NUM_CTX,
        timeoutMs: APP_CONSTANTS.AI_JOB_MATCH_TIMEOUT_MS,
        writer: ctx.writer,
        toolCallId,
        abortSignal,
        guard: ctx.guard,
        label: "recruiter_review",
        provider: ctx.provider,
        modelName: ctx.modelName,
        attrs: {
          "jobsync.input.resume_chars": resumePre.data.normalizedText.length,
          "jobsync.input.job_chars": jobPre.data.normalizedText.length,
          "jobsync.input.documents_chars": documents?.length ?? 0,
          "jobsync.recruiter_persona": personaId,
          "jobsync.input.candidate_notes_chars": candidateNotes?.length ?? 0,
        },
      });
      if (generation.status === "busy") {
        return {
          status: "generation_failed",
          jobTitle,
          reason: "Another analysis is already running — ask for this one once it finishes.",
        };
      }
      if (generation.status === "incomplete") {
        return {
          status: "generation_failed",
          jobTitle,
          reason: "The review stopped before it finished.",
        };
      }
      if (generation.status === "failed") {
        return {
          status: "generation_failed",
          jobTitle,
          reason: "The review could not be generated. Try again in a moment.",
        };
      }

      return {
        status: "ok",
        jobId: job.id!,
        jobTitle,
        company,
        resumeId: resume.id!,
        resumeTitle: resume.title,
        persona: personaId,
        personaName: persona.name,
        body: stripThinking(generation.text),
      };
    },
  });
}
