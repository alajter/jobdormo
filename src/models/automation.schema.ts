import { z } from "zod";
import { APP_CONSTANTS } from "@/lib/constants";
// Deep-import (NOT the barrel) — utils.ts is pure; the barrel pulls scraper
// network code into the client bundle via this file's client consumers.
import { ATS_TOKEN_REGEX } from "@/lib/scraper/utils";
import { COMEET_TOKEN_REGEX } from "@/lib/scraper/comeet/token";
import { VC_BOARD_TOKENS } from "@/lib/scraper/vcboards/boards";
import { REMOTE_BOARD_TOKENS } from "@/lib/scraper/remoteboards/boards";

export const JobBoardSchema = z.enum([
  "greenhouse",
  "lever",
  "ashby",
  "vcboards",
  "comeet",
  "teamtailor",
  "workable",
  "remoteboards",
]);

export const AutomationStatusSchema = z.enum(["active", "paused"]);

export const AutomationRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "completed_with_errors",
  "blocked",
  "rate_limited",
]);

export const DiscoveryStatusSchema = z.enum(["new", "accepted", "dismissed"]);

export const GreenhouseCompanySchema = z.object({
  name: z.string().min(1).max(200),
  token: z.string().min(1).max(80),
});

export const GreenhouseSourceConfigSchema = z.object({
  companies: z
    .array(GreenhouseCompanySchema)
    .max(APP_CONSTANTS.ATS_MAX_COMPANIES),
  targetTitles: z.array(z.string().min(1).max(100)).optional(),
  keywords: z.array(z.string().min(1).max(100)).optional(),
  locations: z.array(z.string().min(1).max(100)).optional(),
  strictLocation: z.boolean().optional(),
  topK: z.number().int().min(1).max(APP_CONSTANTS.ATS_LISTING_CAP).optional(),
  saveUnanalyzed: z.boolean().optional(),
  // Hard title gate: keep only jobs whose title matches a target title, and
  // drop titles containing any excluded word (e.g. "marketing", "engineer").
  strictTitles: z.boolean().optional(),
  excludeTitleTerms: z.array(z.string().min(1).max(50)).max(30).optional(),
});

// Override `token` with the allowlist regex so a directly-POSTed Lever config
// can't smuggle a malformed token past the save boundary.
export const LeverCompanySchema = GreenhouseCompanySchema.extend({
  token: z.string().regex(ATS_TOKEN_REGEX),
  host: z.enum(["default", "eu"]).optional(),
});

// Same fields/MAX/cap as Greenhouse, `companies` swapped to LeverCompanySchema.
export const LeverSourceConfigSchema = GreenhouseSourceConfigSchema.extend({
  companies: z
    .array(LeverCompanySchema)
    .max(APP_CONSTANTS.ATS_MAX_COMPANIES),
});

// Same token allowlist as Lever (rejects path/query injection at the save
// boundary); no `host` — Ashby is single-host.
export const AshbyCompanySchema = GreenhouseCompanySchema.extend({
  token: z.string().regex(ATS_TOKEN_REGEX),
});

export const AshbySourceConfigSchema = GreenhouseSourceConfigSchema.extend({
  companies: z
    .array(AshbyCompanySchema)
    .max(APP_CONSTANTS.ATS_MAX_COMPANIES),
});

// Board tokens are an allowlist, so a saved config can't name an arbitrary host.
export const VcBoardsSourceConfigSchema = GreenhouseSourceConfigSchema.extend({
  companies: z
    .array(z.object({ name: z.string().min(1).max(100), token: z.enum(VC_BOARD_TOKENS) }))
    .max(APP_CONSTANTS.ATS_MAX_COMPANIES),
  excludeCompanies: z.array(z.string().min(1).max(100)).max(100).optional(),
  requireTerms: z.array(z.string().min(1).max(50)).max(20).optional(),
  remoteOk: z.boolean().optional(),
});

// Hard filters shared by the boards below (same meaning as on VC boards).
const hardFilters = {
  excludeCompanies: z.array(z.string().min(1).max(100)).max(100).optional(),
  requireTerms: z.array(z.string().min(1).max(50)).max(20).optional(),
  remoteOk: z.boolean().optional(),
};

// Comeet tokens are "{slug}/{uid}"; Teamtailor and Workable tokens are the
// account slug. Both regexes reject path/query injection at the save boundary.
const companyBoardSchema = (token: RegExp) =>
  GreenhouseSourceConfigSchema.extend({
    companies: z
      .array(GreenhouseCompanySchema.extend({ token: z.string().regex(token) }))
      .max(APP_CONSTANTS.ATS_MAX_COMPANIES),
    ...hardFilters,
  });

export const ComeetSourceConfigSchema = companyBoardSchema(COMEET_TOKEN_REGEX);
export const TeamtailorSourceConfigSchema = companyBoardSchema(ATS_TOKEN_REGEX);
export const WorkableSourceConfigSchema = companyBoardSchema(ATS_TOKEN_REGEX);

// Remote board tokens are an allowlist, like VC boards.
export const RemoteBoardsSourceConfigSchema = GreenhouseSourceConfigSchema.extend({
  companies: z
    .array(z.object({ name: z.string().min(1).max(100), token: z.enum(REMOTE_BOARD_TOKENS) }))
    .max(APP_CONSTANTS.ATS_MAX_COMPANIES),
  ...hardFilters,
});

export const SourceConfigSchema = z.object({
  vcboards: VcBoardsSourceConfigSchema.optional(),
  comeet: ComeetSourceConfigSchema.optional(),
  teamtailor: TeamtailorSourceConfigSchema.optional(),
  workable: WorkableSourceConfigSchema.optional(),
  remoteboards: RemoteBoardsSourceConfigSchema.optional(),
  greenhouse: GreenhouseSourceConfigSchema.optional(),
  lever: LeverSourceConfigSchema.optional(),
  ashby: AshbySourceConfigSchema.optional(),
});

// Only a malformed id gets the custom text; a missing one keeps Zod's own.
const invalidResume = (issue: { code: string }) =>
  issue.code === "invalid_format" ? "Invalid resume" : undefined;

export const CreateAutomationSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    jobBoard: JobBoardSchema,
    keywords: z.string().max(200).optional(),
    location: z.string().max(100).optional(),
    sourceConfig: SourceConfigSchema.optional(),
    resumeId: z.uuid({ error: invalidResume }),
    matchThreshold: z.number().min(0).max(100),
    scheduleHour: z.number().min(0).max(23),
  })
  .superRefine((data, ctx) => {
    const companies = data.sourceConfig?.[data.jobBoard]?.companies ?? [];
    if (companies.length < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceConfig", data.jobBoard, "companies"],
        message: "Select at least one company",
      });
    }
  });

export const UpdateAutomationSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    jobBoard: JobBoardSchema.optional(),
    keywords: z.string().max(200).optional(),
    location: z.string().max(100).optional(),
    sourceConfig: SourceConfigSchema.optional(),
    resumeId: z.uuid({ error: invalidResume }).optional(),
    matchThreshold: z.number().min(0).max(100).optional(),
    scheduleHour: z.number().min(0).max(23).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.jobBoard) return;
    const companies = data.sourceConfig?.[data.jobBoard]?.companies ?? [];
    if (companies.length < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceConfig", data.jobBoard, "companies"],
        message: "Select at least one company",
      });
    }
  });

export type CreateAutomationInput = z.infer<typeof CreateAutomationSchema>;
export type UpdateAutomationInput = z.infer<typeof UpdateAutomationSchema>;
export type SourceConfigInput = z.infer<typeof SourceConfigSchema>;
export type GreenhouseSourceConfigInput = z.infer<
  typeof GreenhouseSourceConfigSchema
>;
