"use client";
import { FileUser } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ALL_TRACKS, useActiveTrack } from "@/hooks/useActiveTrack";
import type { CvTrack } from "@/models/cvTrack.model";

// "Viewing as" a CV track: filters the jobs list and the gaps panel to that
// track. Collection (automations, daily hunt) is never affected.
export function TrackSwitcher({ tracks }: { tracks: CvTrack[] }) {
  const [active, setActive] = useActiveTrack();
  if (tracks.length === 0) return null;
  const value = tracks.some((t) => t.id === active) ? active : ALL_TRACKS;

  return (
    <Select value={value} onValueChange={setActive}>
      <SelectTrigger
        className="h-9 w-auto gap-2"
        aria-label="CV track you're viewing"
        title="Filter jobs and gaps by CV track"
      >
        <FileUser className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="hidden text-muted-foreground md:inline">Viewing:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL_TRACKS}>All tracks</SelectItem>
        {tracks.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
