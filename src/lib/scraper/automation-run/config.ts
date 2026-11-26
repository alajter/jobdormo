import { APP_CONSTANTS } from "@/lib/constants";
import type { JobBoard } from "@/models/automation.model";

export interface AtsRunConfig {
  companies: { name: string; token: string; host?: "default" | "eu" }[];
  targetTitles: string[];
  keywords: string[];
  locations: string[];
  strictLocation: boolean;
  topK: number;
  saveUnanalyzed: boolean;
  excludeCompanies: string[];
  requireTerms: string[];
  remoteOk: boolean;
  strictTitles: boolean;
  excludeTitleTerms: string[];
}

export function parseAtsConfig(
  sourceConfig: string | null | undefined,
  jobBoard: JobBoard,
): AtsRunConfig | null {
  if (!sourceConfig) return null;
  try {
    const parsed = JSON.parse(sourceConfig);
    const cfg = parsed?.[jobBoard];
    if (!cfg || !Array.isArray(cfg.companies)) return null;
    return {
      companies: cfg.companies,
      targetTitles: Array.isArray(cfg.targetTitles) ? cfg.targetTitles : [],
      keywords: Array.isArray(cfg.keywords) ? cfg.keywords : [],
      locations: Array.isArray(cfg.locations) ? cfg.locations : [],
      strictLocation: !!cfg.strictLocation,
      topK:
        typeof cfg.topK === "number" && cfg.topK > 0
          ? cfg.topK
          : APP_CONSTANTS.MAX_JOBS_PER_RUN,
      saveUnanalyzed: cfg.saveUnanalyzed !== false,
      excludeCompanies: Array.isArray(cfg.excludeCompanies) ? cfg.excludeCompanies : [],
      requireTerms: Array.isArray(cfg.requireTerms) ? cfg.requireTerms : [],
      remoteOk: !!cfg.remoteOk,
      strictTitles: !!cfg.strictTitles,
      excludeTitleTerms: Array.isArray(cfg.excludeTitleTerms) ? cfg.excludeTitleTerms : [],
    };
  } catch {
    return null;
  }
}
