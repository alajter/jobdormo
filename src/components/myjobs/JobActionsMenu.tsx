"use client";
import { ListCollapse, MoreVertical, Pencil, StickyNote, Tags, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { JobResponse, JobStatus } from "@/models/job.model";
import { JobStatusMenuItems } from "./JobStatusMenuItems";

type JobActionsMenuProps = {
  job: JobResponse;
  jobStatuses: JobStatus[];
  onChangeJobStatus: (id: string, status: JobStatus) => void;
  onAddNote: (jobId: string) => void;
  onEdit?: (jobId: string) => void;
  onDelete?: (jobId: string) => void;
};

export function JobActionsMenu({
  job,
  jobStatuses,
  onChangeJobStatus,
  onAddNote,
  onEdit,
  onDelete,
}: JobActionsMenuProps) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-haspopup="true"
          size="icon"
          variant="ghost"
          data-testid="job-actions-menu-btn"
        >
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => router.push(`/dashboard/myjobs/${job?.id}`)}
          >
            <ListCollapse className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => onAddNote(job.id)}
          >
            <StickyNote className="mr-2 h-4 w-4" />
            Add a Note
          </DropdownMenuItem>
          {onEdit && (
            <DropdownMenuItem className="cursor-pointer" onClick={() => onEdit(job.id)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Tags className="mr-2 h-4 w-4" />
              Change status
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="p-0">
                <JobStatusMenuItems
                  jobStatuses={jobStatuses}
                  currentStatusId={job.Status.id}
                  onSelectStatus={(status) => onChangeJobStatus(job.id, status)}
                />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => onDelete(job.id)}>
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
