import { z } from "zod";
import { RECRUITER_PERSONA_IDS } from "@/lib/ai/prompts/recruiter-review/personas";
import { McpAddJobInputShape } from "@/models/mcp.schema";

export const AgentChatRequestSchema = z.object({
  // Validated by the SDK downstream, not here. The whole array is
  // client-supplied; nothing in it widens what the request can touch,
  // because userId always comes from the session.
  messages: z.array(z.any()),
  pageContext: z
    .object({
      route: z.string().optional(),
      jobId: z.string().optional(),
      resumeId: z.string().optional(),
    })
    .optional(),
});

export type AgentChatRequest = z.infer<typeof AgentChatRequestSchema>;

// Derived from the MCP RAW shape, not McpAddJobSchema: AI SDK's tool()
// uses one schema for both the JSON schema the model reads and the
// validation of what it returns, so the date transforms are deferred to
// AgentAddJobParseSchema. status keeps its z.preprocess — that is what
// keeps enum: [...] on the input side of the emitted JSON schema.
export const AgentAddJobSchema = z
  .object(McpAddJobInputShape)
  .omit({ upsert: true, allowDuplicate: true })
  .extend({
    jobDescription: z
      .string()
      .refine((val) => val === "N/A" || val.length >= 10, "jobDescription must be at least 10 characters")
      .optional()
      .describe("What the job involves, in the user's own words, copied verbatim and never summarised. Always include this field, even if their description is only one sentence and looks nothing like a full posting, and never condense it into tags instead. If you were shown only the opening portion of a pasted posting, copy the portion you were shown. Use 'N/A' only if the user explicitly declines to give any description after being asked once."),
  });

export const AgentAddJobInputShape = AgentAddJobSchema.shape;

// Parsed inside execute, after the model's input has been validated.
export const AgentAddJobParseSchema = AgentAddJobSchema.extend({
  dueDate: z.iso.datetime({ offset: true }).optional().transform((v) => (v ? new Date(v) : undefined)),
  appliedDate: z.iso.datetime({ offset: true }).optional().transform((v) => (v ? new Date(v) : undefined)),
});

export type AgentAddJobInput = z.infer<typeof AgentAddJobParseSchema>;

// One optional field, and never an id: the model names a resume the way the
// user did, and the server resolves it ownership-scoped. An id-shaped input
// would be an IDOR surface the model could be talked into filling.
export const AgentGetResumeSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume to read, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume they are currently viewing, or their default resume."),
});

export type AgentGetResumeInput = z.infer<typeof AgentGetResumeSchema>;

// Same one-optional-field shape as AgentGetResumeSchema, and never an id: the
// model names a resume the way the user did, and the server resolves it
// ownership-scoped.
export const AgentReviewResumeSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume to review, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume they are currently viewing, or their default resume."),
});

export type AgentReviewResumeInput = z.infer<typeof AgentReviewResumeSchema>;

// No job field of any kind: match_job scores the job the user is viewing, and
// the id comes from server-held page context. An id-shaped input would be an
// IDOR surface the model could be talked into filling.
export const AgentMatchJobSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume to match against, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume linked to the job, or their default resume."),
});

export type AgentMatchJobInput = z.infer<typeof AgentMatchJobSchema>;

// No job field of any kind, for the same reason AgentMatchJobSchema has none:
// the letter is written for the job the user is viewing, and the id comes from
// server-held page context.
export const AgentCoverLetterSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume the letter should draw on, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume linked to the job, or their default resume."),
  instructions: z.string().max(1000).optional().describe("The user's own requests about this letter, in their words: tone, length, what to stress or leave out (for example 'less formal, don't repeat the CV'). Omit this entirely if they gave none."),
});

export type AgentCoverLetterInput = z.infer<typeof AgentCoverLetterSchema>;

// No job field, like AgentMatchJobSchema: the review is for the job the user
// is viewing, and the id comes from server-held page context.
export const AgentRecruiterReviewSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume to review, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume linked to the job, or their default resume."),
  persona: z.enum(["auto", ...RECRUITER_PERSONA_IDS]).optional().describe("Which recruiter reviews it. Omit it, or pass auto, unless the user asked for a specific kind of reviewer: kingmaker (stealth/seed founder lens), calibrator (scale-up hiring manager), partner (executive search, VP/C-level), gatekeeper (corporate ATS screener), talent_partner (VC talent partner)."),
  documents: z.string().optional().describe("A cover letter, personal note or other text the user wants reviewed together with the resume, copied exactly as they gave it. Omit it if they gave none."),
});

export type AgentRecruiterReviewInput = z.infer<typeof AgentRecruiterReviewSchema>;

// tailor_cv: no job field (the job comes from page context, like match_job).
export const AgentTailorCvSchema = z.object({
  instructions: z.string().max(1000).optional().describe("The user's own requests for this CV version, in their words (what to stress or leave out). Omit this entirely if they gave none."),
  facts: z.array(z.object({
    keyword: z.string().max(80).describe("A missing keyword from the last tailor_cv result that the user says they have."),
    answer: z.string().max(800).describe("How they have it, in their own words (where, what they did). Never add anything they didn't say."),
  })).max(25).optional().describe("Missing keywords the user just told you they DO have, each with how, in their words. Omit this entirely if they confirmed none."),
});

