import type { LeverSourceConfig } from "@/models/automation.model";

// The step is provider-agnostic; it edits the canonical Lever config shape — a
// superset of Greenhouse's, where the extra per-company `host` is unused and
// UI-invisible for Greenhouse.
export type AtsConfigValue = LeverSourceConfig;

export type EntityOption = { id: string; label: string; value: string };

export const PROVIDER_META: Record<
  string,
  { label: string; urlHint: string; searchExample: string }
> = {
  greenhouse: {
    label: "Greenhouse",
    urlHint: "Or paste a boards.greenhouse.io link",
    searchExample: "Anthropic",
  },
  lever: {
    label: "Lever",
    urlHint: "Or paste a jobs.lever.co link or token",
    searchExample: "Netflix",
  },
  ashby: {
    label: "Ashby",
    urlHint: "Or paste a jobs.ashbyhq.com link or token",
    searchExample: "Ramp",
  },
  vcboards: {
    label: "VC boards",
    urlHint: "Pick boards from the list; custom boards aren't supported",
    searchExample: "Team8",
  },
  comeet: {
    label: "Comeet",
    urlHint: "Or paste a comeet.com/jobs/{company}/{id} link",
    searchExample: "Claroty",
  },
  teamtailor: {
    label: "Teamtailor",
    urlHint: "Or paste a {company}.teamtailor.com or career-site link",
    searchExample: "Dreeze",
  },
  workable: {
    label: "Workable",
    urlHint: "Or paste an apply.workable.com link or account name",
    searchExample: "Hugging Face",
  },
  remoteboards: {
    label: "Remote boards",
    urlHint: "Pick boards from the list; custom boards aren't supported",
    searchExample: "Himalayas",
  },
};
