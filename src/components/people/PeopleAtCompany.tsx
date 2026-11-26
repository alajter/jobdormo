"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { getPeopleAtCompany, type PersonRow } from "@/actions/people.actions";
import { PEOPLE_STATUSES, isPeopleStatus } from "@/models/people.model";
import { MessageDialog } from "./PersonDialogs";

// "People you know here" on a job page: the warm way in before applying.
export function PeopleAtCompany({ companyId, companyLabel }: { companyId: string; companyLabel: string }) {
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [open, setOpen] = useState<PersonRow | null>(null);
  useEffect(() => {
    let alive = true;
    getPeopleAtCompany(companyId).then((p) => alive && setPeople(p));
    return () => {
      alive = false;
    };
  }, [companyId]);
  if (people.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <Users className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">You know {people.length === 1 ? "someone" : `${people.length} people`} at {companyLabel}:</span>
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setOpen(p)}
          className="rounded-full border bg-background px-2 py-0.5 text-xs hover:bg-muted"
          title={[p.title, p.relationship].filter(Boolean).join(" · ") || "Write to them"}
        >
          {p.name}
          {isPeopleStatus(p.outreachStatus) && <span className="text-muted-foreground"> · {PEOPLE_STATUSES[p.outreachStatus].label}</span>}
        </button>
      ))}
      <Link href="/dashboard/people" className="ml-auto text-xs text-muted-foreground hover:text-foreground">People</Link>
      {open && <MessageDialog person={open} onClose={() => setOpen(null)} onLogged={() => setOpen(null)} />}
    </div>
  );
}
