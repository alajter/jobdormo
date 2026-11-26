"use client";
import { postedAgo } from "@/lib/jobs/postedDate";
import { getCompanyAreaLabel } from "@/models/companyArea.model";
import { useTrackLabel } from "./CvTracksContext";
import { OutreachStatusBadge } from "./OutreachStatusBadge";
import { AtsCell } from "./AtsCell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Pencil, StickyNote, Trash } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { format } from "date-fns";
import { useState } from "react";
import {
  JobResponse,
  JobSortField,
  JobStatus,
  getJobTypeLabel,
  getWorkplaceTypeLabel,
} from "@/models/job.model";
import type { SortState } from "@/models/sort.model";
import { SortableTableHead } from "../SortableTableHead";
import Link from "next/link";
import { DeleteAlertDialog } from "../DeleteAlertDialog";
import { CircularScore } from "@/components/CircularScore";
import { JobStatusBadgeMenu } from "./JobStatusBadgeMenu";
import { TooltipProvider } from "../ui/tooltip";
import { JobActionsMenu } from "./JobActionsMenu";
import { MatchJobButton } from "./MatchJobButton";
import { CompanyLogo } from "./CompanyLogo";

type MyJobsTableProps = {
  jobs: JobResponse[];
  jobStatuses: JobStatus[];
  deleteJob: (id: string) => void;
  editJob: (id: string) => void;
  onChangeJobStatus: (id: string, status: JobStatus) => void;
  onAddNote: (jobId: string) => void;
  sort: SortState<JobSortField> | null;
  onSort: (field: JobSortField) => void;
};

function MyJobsTable({
  jobs,
  jobStatuses,
  deleteJob,
  editJob,
  onChangeJobStatus,
  onAddNote,
  sort,
  onSort,
}: MyJobsTableProps) {
  const trackLabel = useTrackLabel();
  const [alertOpen, setAlertOpen] = useState(false);
  const [jobIdToDelete, setJobIdToDelete] = useState("");

  const onDeleteJob = (jobId: string) => {
    setAlertOpen(true);
    setJobIdToDelete(jobId);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Table className="[&_td]:px-3 [&_td]:py-2 [&_th]:h-10 [&_th]:px-3">
        <TableHeader>
          <TableRow>
            <SortableTableHead field="title" sort={sort} onSort={onSort}>
              Job
            </SortableTableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell whitespace-nowrap">Reach-out</TableHead>
            <SortableTableHead
              field="appliedDate"
              sort={sort}
              onSort={onSort}
              className="hidden lg:table-cell whitespace-nowrap"
            >
              Applied
            </SortableTableHead>
            <SortableTableHead
              field="matchScore"
              sort={sort}
              onSort={onSort}
              className="hidden md:table-cell text-center"
            >
              Match
            </SortableTableHead>
            <TableHead className="text-center" title="ATS keyword match of the CV you'd send: generic → tailored">
              CV
            </TableHead>
            <SortableTableHead
              field="postedAt"
              sort={sort}
              onSort={onSort}
              className="hidden lg:table-cell whitespace-nowrap"
            >
              Posted
            </SortableTableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job: JobResponse) => {
            return (
              <TableRow key={job.id}>
                <TableCell className="font-medium cursor-pointer max-w-[220px] md:max-w-[360px]">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/dashboard/myjobs/${job?.id}`}
                      className="block min-w-0 truncate underline-offset-4 hover:underline"
                    >
                      <span className="font-semibold text-foreground">{job.Company?.label}</span>
                      <span className="font-normal text-muted-foreground"> · {job.JobTitle?.label}</span>
                    </Link>
                    {(job._count?.Notes ?? 0) > 0 && (
                      <Badge
                        variant="secondary"
                        title={`${job._count!.Notes} ${job._count!.Notes === 1 ? "note" : "notes"}`}
                        aria-label={`${job._count!.Notes} ${job._count!.Notes === 1 ? "note" : "notes"}`}
                        className="text-xs px-1.5 py-0 h-5 shrink-0"
                      >
                        <StickyNote className="h-3 w-3 mr-0.5" />
                        {job._count!.Notes}
                      </Badge>
                    )}
                  </div>
                  <span
                    className="block truncate text-xs font-normal text-muted-foreground"
                    title={[job.Location?.label, job.Company?.description].filter(Boolean).join(" · ") || undefined}
                  >
                    {[
                      job.Company?.stage && job.Company.stage !== "unknown" ? job.Company.stage : null,
                      job.Company?.size ? `${job.Company.size} people` : null,
                      job.workplaceType ? getWorkplaceTypeLabel(job.workplaceType) : null,
                      trackLabel(job.track),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </TableCell>
                <TableCell>
                  <JobStatusBadgeMenu
                    job={job}
                    jobStatuses={jobStatuses}
                    onChangeJobStatus={onChangeJobStatus}
                    className="w-[92px] whitespace-nowrap justify-center"
                  />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <OutreachStatusBadge
                    key={job.outreachStatus ?? "none"}
                    jobId={job.id}
                    status={job.outreachStatus}
                    updatedAt={job.outreachUpdatedAt}
                  />
                </TableCell>
                <TableCell
                  className="hidden lg:table-cell whitespace-nowrap text-muted-foreground"
                  title={job.createdAt ? `Added ${format(job.createdAt, "PP")}` : undefined}
                >
                  {job.appliedDate ? format(job.appliedDate, "MMM d") : "–"}
                </TableCell>
                <TableCell className="hidden md:table-cell text-center">
                  {job.matchScore != null ? (
                    <CircularScore
                      score={job.matchScore}
                      size="sm"
                      animate={false}
                      className="mx-auto"
                    />
                  ) : (
                    <MatchJobButton jobId={job.id} />
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <AtsCell key={`${job.id}-${job.atsBase}-${job.atsTailored}`} jobId={job.id} base={job.atsBase} tailored={job.atsTailored} />
                </TableCell>
                <TableCell
                  className="hidden lg:table-cell whitespace-nowrap text-muted-foreground"
                  title={job.postedAt ? format(job.postedAt, "PP") : undefined}
                >
                  {job.postedAt ? postedAgo(job.postedAt) : "–"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <JobActionsMenu
                      job={job}
                      jobStatuses={jobStatuses}
                      onChangeJobStatus={onChangeJobStatus}
                      onAddNote={onAddNote}
                      onEdit={editJob}
                      onDelete={onDeleteJob}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <DeleteAlertDialog
        pageTitle="job"
        open={alertOpen}
        onOpenChange={setAlertOpen}
        onDelete={() => deleteJob(jobIdToDelete)}
      />
    </TooltipProvider>
  );
}

export default MyJobsTable;
