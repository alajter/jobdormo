"use client";
import { X } from "lucide-react";
import { EMPTY_JOB_FACETS, OPEN_JOB_STATUSES, hasJobFacets, jobViewFor } from "@/lib/jobs/jobFacets";
import {
  JobFacets,
  JobStatus,
  getJobTypeLabel,
  getWorkplaceTypeLabel,
} from "@/models/job.model";
import { getCompanyAreaLabel } from "@/models/companyArea.model";
import { useTrackLabel } from "../CvTracksContext";
import { OUTREACH_STATUSES } from "@/models/outreach.model";

// "Filtered by" row for the popover facets; deep-link chips stay in the
// header (D6), so Clear all here leaves company/title/location/source alone.
export function JobsFilterChips({
  statuses,
  facets,
  onChange,
}: {
  statuses: JobStatus[];
  facets: JobFacets;
  onChange: (facets: JobFacets) => void;
}) {
  const trackLabel = useTrackLabel();
  if (!hasJobFacets(facets)) return null;

  const isOpenSet =
    !facets.acceptedDiscovered &&
    facets.statuses.length === OPEN_JOB_STATUSES.length &&
    OPEN_JOB_STATUSES.every((s) => facets.statuses.includes(s));
  const statusLabels = isOpenSet ? ["Open"] : [
    ...facets.statuses.map(
      (value) => statuses.find((s) => s.value === value)?.label ?? value,
    ),
    ...(facets.acceptedDiscovered ? ["Accepted (discovered)"] : []),
  ];

  // The view tabs (Review / Pursuing / Closed) already show these statuses.
  const isView = facets.statuses.length > 0 && !facets.acceptedDiscovered && jobViewFor(facets.statuses) !== null;
  const chips = [
    {
      name: "Status",
      value: statusLabels.join(", "),
      clear: { statuses: [], acceptedDiscovered: false },
    },
    {
      name: "Job type",
      value: facets.jobTypes.map((c) => getJobTypeLabel(c)).join(", "),
      clear: { jobTypes: [] },
    },
    {
      name: "Workplace",
      value: facets.workplaces.map((c) => getWorkplaceTypeLabel(c)).join(", "),
      clear: { workplaces: [] },
    },
    {
      name: "Reach-out",
      value: facets.outreach
        .map((o) => (o === "none" ? "Not contacted" : OUTREACH_STATUSES[o as keyof typeof OUTREACH_STATUSES]?.label ?? o))
        .join(", "),
      clear: { outreach: [] },
    },
    {
      name: "Track",
      value: facets.tracks.map((t) => trackLabel(t)).join(", "),
      clear: { tracks: [] },
    },
    {
      name: "Area",
      value: facets.areas.map((c) => getCompanyAreaLabel(c)).join(", "),
      clear: { areas: [] },
    },
    {
      name: "Match",
      value: facets.minScore ? `${facets.minScore}%+` : "",
      clear: { minScore: 0 },
    },
    {
      name: "Dismissed",
      value: facets.includeDismissed ? "Included" : "",
      clear: { includeDismissed: false },
    },
  ].filter((chip) => chip.value && !(isView && chip.name === "Status"));
  if (chips.length === 0) return null;

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="mr-0.5 text-xs text-muted-foreground">Filtered by</span>
      {chips.map((chip) => (
        <button
          key={chip.name}
          type="button"
          aria-label={`Remove ${chip.name} filter`}
          title={chip.value}
          onClick={() => onChange({ ...facets, ...chip.clear })}
          className="inline-flex h-7 max-w-[280px] items-center gap-1.5 rounded-md bg-muted pl-2.5 pr-2 text-[13px] hover:bg-muted/70"
        >
          <span className="text-muted-foreground">{chip.name}</span>
          <span className="truncate font-medium">{chip.value}</span>
          <X className="h-3 w-3 shrink-0" />
        </button>
      ))}
      <button
        type="button"
        className="h-7 px-2 text-[13px] text-muted-foreground underline hover:text-foreground"
        onClick={() => onChange(EMPTY_JOB_FACETS)}
      >
        Clear all
      </button>
    </div>
  );
}
