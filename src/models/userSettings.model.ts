import { AiProvider } from "./ai.model";
import type { GoalTargetsByMonth } from "./dailyGoals.model";

export interface AiSettings {
  provider: AiProvider;
  model: string | undefined;
}

export interface DisplaySettings {
  theme: "light" | "dark" | "system";
}

export interface GoalSettings {
  targets: GoalTargetsByMonth;
}

// Free text the candidate writes about themselves: facts the AI should know
// and rules it must follow (e.g. "never claim sales at my startups").
// Read by the recruiter review.
export interface CandidateSettings {
  notes: string;
  // Facts the user gave while improving their CV, newest last. Kept apart
  // from `notes` so they can never push the user's own rules out.
  facts?: string;
}

export const CANDIDATE_FACTS_MAX_CHARS = 12000;

export const CANDIDATE_NOTES_MAX_CHARS = 4000;

// Job-search preferences the daily hunt applies.
export interface JobSearchSettings {
  // Gaps the user marked "Not for me": jobs with them get archived.
  dealbreakers: string[];
}

export interface UserSettingsData {
  ai: AiSettings;
  candidate?: CandidateSettings;
  jobSearch?: JobSearchSettings;
  display: DisplaySettings;
  goals?: GoalSettings;
}

export interface UserSettings {
  userId: string;
  settings: UserSettingsData;
}

export const defaultUserSettings: UserSettingsData = {
  ai: {
    provider: AiProvider.ANTHROPIC,
    model: undefined,
  },
  display: {
    theme: "system",
  },
};
