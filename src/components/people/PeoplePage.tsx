"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { format, isBefore, endOfDay } from "date-fns";
import { ExternalLink, Loader2, MessageSquarePlus, MoreHorizontal, NotebookPen, Plus, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deletePerson, getPeople, setPersonStatus, type PersonRow } from "@/actions/people.actions";
import { PEOPLE_ACTIVITY_KINDS, PEOPLE_STATUSES, PEOPLE_STATUS_CODES, type PeopleActivityKind } from "@/models/people.model";
import { toastError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PeopleStatusBadge } from "./PeopleStatusBadge";
import { ImportDialog, LogDialog, MessageDialog, PersonDialog } from "./PersonDialogs";

type View = "pipeline" | "suggested";
type Open =
  | { kind: "edit"; person: PersonRow | null }
  | { kind: "message"; person: PersonRow }
  | { kind: "log"; person: PersonRow }
  | { kind: "import" }
  | null;

export function PeoplePage() {
  const [view, setView] = useState<View>("pipeline");
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Open>(null);
  const [, start] = useTransition();

  const load = useCallback(
    () =>
      getPeople({ view, status: status || undefined, search }).then((res) => {
        setRows(res.data);
        setTotal(res.total);
        setCounts(res.counts);
      }),
    [view, status, search],
  );

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const inPipeline = Object.entries(counts).filter(([k]) => k !== "none").reduce((a, [, n]) => a + n, 0);
  const notContacted = counts.none ?? 0;

  const addToPipeline = (p: PersonRow) =>
    start(async () => {
      const res = await setPersonStatus(p.id, "to_contact");
      if (!res.success) return toastError("Couldn't add.");
      toastSuccess(`${p.name} added to your pipeline.`);
      load();
    });
  const remove = (p: PersonRow) =>
    start(async () => {
      const res = await deletePerson(p.id);
      if (!res.success) return toastError("Couldn't delete.");
      load();
    });

  return (
    <div className="col-span-3 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-2xl font-semibold leading-none tracking-tight">People</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The people who can get you to your next role. Reach out, log what happens, follow up.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen({ kind: "import" })}>
            <Upload className="mr-2 h-4 w-4" /> Import LinkedIn connections
          </Button>
          <Button size="sm" onClick={() => setOpen({ kind: "edit", person: null })}>
            <Plus className="mr-2 h-4 w-4" /> Add person
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-sm">
          {(
            [
              ["pipeline", `Pipeline (${inPipeline})`],
              ["suggested", `Suggested to contact (${notContacted})`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v);
                setStatus("");
              }}
              className={cn(
                "rounded px-3 py-1",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "pipeline" && (
          <div className="flex flex-wrap gap-1">
            {PEOPLE_STATUS_CODES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(status === s ? "" : s)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  status === s ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground",
                )}
              >
                {PEOPLE_STATUSES[s].label} {counts[s] ?? 0}
              </button>
            ))}
          </div>
        )}
        <Input
          className="ml-auto h-8 w-56"
          placeholder="Search name, role, company"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {rows === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {view === "pipeline"
            ? "No one in your pipeline yet. Add someone you know, or import your LinkedIn connections and pick from Suggested."
            : "No suggestions yet. Import your LinkedIn connections to see who to contact first."}
        </div>
      ) : (
        <Table className="[&_td]:px-3 [&_td]:py-2">
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              {view === "pipeline" ? (
                <>
                  <TableHead className="hidden lg:table-cell">How you know them</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Follow up</TableHead>
                  <TableHead className="hidden md:table-cell">Last</TableHead>
                </>
              ) : (
                <TableHead>Why contact them</TableHead>
              )}
              <TableHead className="w-[1%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const due = p.nextFollowUpAt && isBefore(new Date(p.nextFollowUpAt), endOfDay(new Date()));
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-medium">
                      {p.name}
                      {p.linkedinUrl && (
                        <a href={p.linkedinUrl} target="_blank" rel="noreferrer" aria-label="LinkedIn profile">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[p.title, p.company].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  {view === "pipeline" ? (
                    <>
                      <TableCell className="hidden max-w-[260px] truncate text-xs text-muted-foreground lg:table-cell" title={p.relationship ?? ""}>
                        {p.relationship || "-"}
                      </TableCell>
                      <TableCell>
                        <PeopleStatusBadge key={`${p.id}-${p.outreachStatus}`} id={p.id} status={p.outreachStatus} onChanged={() => load()} />
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap text-xs", due && "font-semibold text-red-600 dark:text-red-400")}>
                        {p.nextFollowUpAt ? format(new Date(p.nextFollowUpAt), "d MMM") : "-"}
                      </TableCell>
                      <TableCell className="hidden max-w-[220px] truncate text-xs text-muted-foreground md:table-cell" title={p.lastActivity?.text ?? ""}>
                        {p.lastActivity
                          ? `${format(new Date(p.lastActivity.at), "d MMM")} · ${PEOPLE_ACTIVITY_KINDS[p.lastActivity.kind as PeopleActivityKind] ?? p.lastActivity.kind}`
                          : "-"}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell className="text-xs">
                      <span className="mr-2 inline-block w-8 rounded bg-muted px-1 text-center font-semibold">{p.priority ?? 0}</span>
                      <span className="text-muted-foreground">{p.priorityReason || "-"}</span>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {view === "suggested" && (
                        <Button variant="outline" size="sm" className="h-7" onClick={() => addToPipeline(p)}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Pipeline
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen({ kind: "message", person: p })}>
                        <Send className="mr-1 h-3.5 w-3.5" /> Message
                      </Button>
                      {view === "pipeline" && (
                        <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen({ kind: "log", person: p })}>
                          <NotebookPen className="mr-1 h-3.5 w-3.5" /> Log
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="More">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setOpen({ kind: "edit", person: p })}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setOpen({ kind: "log", person: p })}>
                            <MessageSquarePlus className="mr-2 h-4 w-4" /> Log / history
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => remove(p)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {rows && total > rows.length && (
        <p className="text-xs text-muted-foreground">Showing {rows.length} of {total}. Search to narrow it down.</p>
      )}

      {open?.kind === "edit" && <PersonDialog person={open.person} onClose={() => setOpen(null)} onSaved={load} />}
      {open?.kind === "message" && <MessageDialog person={open.person} onClose={() => setOpen(null)} onLogged={load} />}
      {open?.kind === "log" && <LogDialog person={open.person} onClose={() => setOpen(null)} onLogged={load} />}
      {open?.kind === "import" && <ImportDialog onClose={() => setOpen(null)} onImported={load} />}
    </div>
  );
}
