"use client";

import {
  ArrowLeft,
  FileText,
  MoreVertical,
  Pencil,
  Sparkles,
  StickyNote,
  Trash,
  Trash2,
  Send,
  FileUser,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  JobResponse,
  getJobTypeLabel,
  getWorkplaceTypeLabel,
} from "@/models/job.model";
import { CompanyLogo } from "../CompanyLogo";

type JobDetailsHeaderProps = {
  job: JobResponse;
  updateStatusMenu?: React.ReactNode;
  coverLetterBlockedReason?: string;
  chatBusy: boolean;
  onBack: () => void;
  onMatch: () => void;
  onCoverLetter: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddNote: () => void;
  onOutreach: () => void;
  onTailorCv: () => void;
  onMarkApplied?: () => void;
};

export function JobDetailsHeader({
  job,
  updateStatusMenu,
  coverLetterBlockedReason,
  chatBusy,
  onBack,
  onMatch,
  onCoverLetter,
  onEdit,
  onDelete,
  onAddNote,
  onOutreach,
  onTailorCv,
  onMarkApplied,
}: JobDetailsHeaderProps) {
  const details = [
    job.Location?.label,
    getJobTypeLabel(job.jobType),
    job.workplaceType ? getWorkplaceTypeLabel(job.workplaceType) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3 @7xl/main:flex-row @7xl/main:items-center">
      <div className="flex flex-1 min-w-0 items-center gap-3">
        <Button title="Go Back" variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <CompanyLogo
          logoUrl={job.Company?.logoUrl}
          className="h-8 w-8 min-w-8"
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg leading-snug">
            {job.Company?.label && (
              <Link
                href={`/dashboard/admin/companies/${job.Company.id}`}
                className="font-semibold underline-offset-4 hover:underline"
              >
                {job.Company.label}
              </Link>
            )}
            {job.Company?.label && <span className="text-muted-foreground"> · </span>}
            <span className="font-normal">{job.JobTitle?.label}</span>
          </h1>
          {details && <p className="text-sm text-muted-foreground">{details}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 @7xl/main:justify-end">
        {updateStatusMenu}
        <Button
          variant={job.tailoredCv ? "outline" : "default"}
          className="cursor-pointer"
          title="A CV for this job, matched to the posting's keywords"
          onClick={onTailorCv}
        >
          <FileUser className="h-4 w-4 sm:mr-2" />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
            {job.tailoredCv ? "CV for this job" : "Tailor CV"}
          </span>
        </Button>
        <Button
          variant="outline"
          className="cursor-pointer"
          title="Draft a LinkedIn note, message or email about this job"
          onClick={onOutreach}
        >
          <Send className="h-4 w-4 sm:mr-2" />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Message someone</span>
        </Button>
        {job.jobUrl && (
          <Button variant="outline" className="cursor-pointer" asChild>
            <a href={job.jobUrl} target="_blank" rel="noopener noreferrer" title={job.jobUrl}>
              <ExternalLink className="h-4 w-4 sm:mr-2" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Open posting</span>
            </a>
          </Button>
        )}
        {onMarkApplied && (
          <Button className="cursor-pointer" variant={job.tailoredCv ? "default" : "outline"} onClick={onMarkApplied}>
            Mark applied
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-haspopup="true"
              size="icon"
              variant="ghost"
              data-testid="job-details-actions-menu-btn"
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer" disabled={chatBusy} onClick={onMatch}>
                <Sparkles className="mr-2 h-4 w-4" />
                Match with AI
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" disabled={!!coverLetterBlockedReason} onClick={onCoverLetter}>
                <FileText className="mr-2 h-4 w-4" />
                {job.coverLetterId ? "Regenerate letter" : "Cover letter"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit job
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={onAddNote}>
                <StickyNote className="mr-2 h-4 w-4" />
                Add a Note
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 cursor-pointer"
                onClick={onDelete}
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
