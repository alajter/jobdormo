"use client";
import { useState, useTransition } from "react";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setOutreachStatus } from "@/actions/outreach.actions";
import { OUTREACH_STATUSES, OUTREACH_STATUS_CODES, isOutreachStatus } from "@/models/outreach.model";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";

// Reach-out status for a job: a small badge that opens a menu to change it.
export function OutreachStatusBadge({
  jobId,
  status,
  updatedAt,
  className,
}: {
  jobId: string;
  status?: string | null;
  updatedAt?: Date | string | null;
  className?: string;
}) {
  // Optimistic: shows the pick at once, reverts if saving fails.
  const [value, setValue] = useState<string | null>(status ?? null);
  const [pending, startTransition] = useTransition();
  const current = isOutreachStatus(value) ? OUTREACH_STATUSES[value] : null;

  const choose = (next: string | null) => {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const res = await setOutreachStatus(jobId, next);
      if (!res.success) {
        setValue(prev);
        toastError("Couldn't update the reach-out status.");
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          title={
            current && updatedAt
              ? `Reach-out: ${current.label} (${format(new Date(updatedAt), "PP")})`
              : "Reach-out status: not contacted"
          }
          className={cn(
            "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium",
            current ? current.className : "border border-dashed text-muted-foreground",
            className,
          )}
        >
          {current ? current.label : "Not contacted"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {OUTREACH_STATUS_CODES.map((code) => (
          <DropdownMenuItem key={code} onClick={() => choose(code)}>
            {OUTREACH_STATUSES[code].label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => choose(null)}>Not contacted</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
