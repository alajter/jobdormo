"use client";
import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setPersonStatus } from "@/actions/people.actions";
import { PEOPLE_STATUSES, PEOPLE_STATUS_CODES, isPeopleStatus } from "@/models/people.model";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";

// Where a person stands in the outreach pipeline; click to change.
export function PeopleStatusBadge({
  id,
  status,
  onChanged,
}: {
  id: string;
  status: string | null;
  onChanged?: (status: string | null) => void;
}) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const current = isPeopleStatus(value) ? PEOPLE_STATUSES[value] : null;
  const choose = (next: string | null) => {
    const prev = value;
    setValue(next);
    start(async () => {
      const res = await setPersonStatus(id, next);
      if (!res.success) {
        setValue(prev);
        toastError("Couldn't update the status.");
      } else onChanged?.(next);
    });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className={cn(
            "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium",
            current ? current.className : "border border-dashed text-muted-foreground",
          )}
        >
          {current ? current.label : "Not in pipeline"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PEOPLE_STATUS_CODES.map((code) => (
          <DropdownMenuItem key={code} onClick={() => choose(code)}>
            {PEOPLE_STATUSES[code].label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => choose(null)}>Not in pipeline</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
