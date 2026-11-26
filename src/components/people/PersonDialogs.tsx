"use client";
import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { Check, Copy, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  draftPersonMessage,
  getPersonActivities,
  importLinkedinConnections,
  logPersonActivity,
  savePerson,
  type PersonRow,
} from "@/actions/people.actions";
import {
  PEOPLE_ACTIVITY_KINDS,
  PEOPLE_CHANNELS,
  PEOPLE_STATUSES,
  PEOPLE_STATUS_CODES,
  type PeopleActivityKind,
} from "@/models/people.model";
import { toastError, toastSuccess } from "@/lib/toast";

const NONE = "__none";
const day = (d: Date | string | null | undefined) => (d ? format(new Date(d), "yyyy-MM-dd") : "");

/** Add or edit a person. */
export function PersonDialog({
  person,
  onClose,
  onSaved,
}: {
  person: PersonRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: person?.name ?? "",
    title: person?.title ?? "",
    company: person?.company ?? "",
    relationship: person?.relationship ?? "",
    linkedinUrl: person?.linkedinUrl ?? "",
    email: person?.email ?? "",
    channel: person?.channel ?? "linkedin",
    notes: person?.notes ?? "",
    outreachStatus: person?.outreachStatus ?? (person ? NONE : "to_contact"),
    nextFollowUpAt: day(person?.nextFollowUpAt),
  });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = () =>
    start(async () => {
      const res = await savePerson({
        id: person?.id,
        ...f,
        outreachStatus: f.outreachStatus === NONE ? null : f.outreachStatus,
        nextFollowUpAt: f.nextFollowUpAt || null,
      });
      if (!res.success) return toastError(res.message);
      toastSuccess(person ? "Saved." : "Added.");
      onSaved();
      onClose();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person ? "Edit person" : "Add a person"}</DialogTitle>
          <DialogDescription>Someone who can help: a founder, an investor, an ex-colleague.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <Input placeholder="Name" value={f.name} onChange={(e) => set("name")(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Role (e.g. General Partner)" value={f.title} onChange={(e) => set("title")(e.target.value)} />
            <Input placeholder="Company" value={f.company} onChange={(e) => set("company")(e.target.value)} />
          </div>
          <Textarea
            rows={2}
            placeholder="How you know them (only true facts, e.g. 'gave my first startup a term sheet')"
            value={f.relationship}
            onChange={(e) => set("relationship")(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="LinkedIn URL" value={f.linkedinUrl} onChange={(e) => set("linkedinUrl")(e.target.value)} />
            <Input placeholder="Email" value={f.email} onChange={(e) => set("email")(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Select value={f.channel} onValueChange={set("channel")}>
              <SelectTrigger aria-label="Channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PEOPLE_CHANNELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={f.outreachStatus} onValueChange={set("outreachStatus")}>
              <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PEOPLE_STATUS_CODES.map((s) => (
                  <SelectItem key={s} value={s}>{PEOPLE_STATUSES[s].label}</SelectItem>
                ))}
                <SelectItem value={NONE}>Not in pipeline</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="Follow up on"
              value={f.nextFollowUpAt}
              onChange={(e) => set("nextFollowUpAt")(e.target.value)}
            />
          </div>
          <Textarea rows={3} placeholder="Notes" value={f.notes} onChange={(e) => set("notes")(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={pending || !f.name.trim()}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const GOALS = {
  reconnect: "Reconnect: I'm looking, any leads?",
  intro: "Ask for an intro to someone",
  referral: "Ask for a referral at their company",
  followup: "Follow up on my last message",
  thanks: "Thank them",
};

/** Draft a message in the user's voice, copy it, and log it as sent. */
export function MessageDialog({
  person,
  onClose,
  onLogged,
}: {
  person: PersonRow;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [channel, setChannel] = useState(person.channel ?? "linkedin");
  const [goal, setGoal] = useState(person.outreachStatus === "sent" ? "followup" : "reconnect");
  const [extra, setExtra] = useState("");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [drafting, startDraft] = useTransition();
  const [logging, startLog] = useTransition();
  const draft = () =>
    startDraft(async () => {
      const res = await draftPersonMessage({ contactId: person.id, channel, goal, extra });
      if (!res.success || !res.text) return toastError(res.message);
      setText(res.text);
      setCopied(false);
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toastError("Couldn't copy; select the text and copy it by hand.");
    }
  };
  const markSent = () =>
    startLog(async () => {
      const res = await logPersonActivity({ contactId: person.id, kind: "sent", channel, text });
      if (!res.success) return toastError("Couldn't log it.");
      toastSuccess("Logged. Follow-up set for a week from today.");
      onLogged();
      onClose();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && !drafting && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Message {person.name}</DialogTitle>
          <DialogDescription>
            Written in your voice from your notes and CV, using only what you wrote about how you know them.
            Nothing is sent from here.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger aria-label="Channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["linkedin", "email", "whatsapp"] as const).map((k) => (
                  <SelectItem key={k} value={k}>{PEOPLE_CHANNELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={goal} onValueChange={setGoal}>
              <SelectTrigger aria-label="Goal"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(GOALS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!person.relationship && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Tip: add how you know {person.name.split(" ")[0]} (Edit) so the message can use it.
            </p>
          )}
          <Textarea
            rows={2}
            placeholder="Anything to include (e.g. who you want an intro to, a role, a link)"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
          <Button onClick={draft} disabled={drafting}>
            {drafting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Writing…</>
            ) : text ? "Rewrite" : "Write it"}
          </Button>
          {text && <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={drafting || logging}>Close</Button>
          {text && (
            <>
              <Button variant="outline" onClick={copy}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button onClick={markSent} disabled={logging}>{logging ? "Logging…" : "Mark as sent"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Activity = { id: string; kind: string; channel: string | null; text: string | null; at: Date };

/** Log what happened with a person (their reply, a call, an intro…) and see the history. */
export function LogDialog({
  person,
  onClose,
  onLogged,
}: {
  person: PersonRow;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [kind, setKind] = useState<PeopleActivityKind>("reply");
  const [at, setAt] = useState(day(new Date()));
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Activity[] | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let alive = true;
    getPersonActivities(person.id).then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, [person.id]);
  const save = () =>
    start(async () => {
      const res = await logPersonActivity({ contactId: person.id, kind, text, at, channel: person.channel ?? undefined });
      if (!res.success) return toastError("Couldn't log it.");
      toastSuccess("Logged.");
      onLogged();
      onClose();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person.name}: what happened?</DialogTitle>
          <DialogDescription>A reply, a call or an intro counts toward this week&apos;s conversations.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Select value={kind} onValueChange={(v) => setKind(v as PeopleActivityKind)}>
              <SelectTrigger aria-label="What happened"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PEOPLE_ACTIVITY_KINDS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" aria-label="When" value={at} onChange={(e) => setAt(e.target.value)} />
          </div>
          <Textarea
            rows={4}
            placeholder="What they said or what you sent (paste it here)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">History</Label>
            {history === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing logged yet.</p>
            ) : (
              <ul className="grid gap-2">
                {history.map((h) => (
                  <li key={h.id} className="rounded-md border p-2 text-xs">
                    <span className="font-medium">
                      {format(new Date(h.at), "d MMM")} · {PEOPLE_ACTIVITY_KINDS[h.kind as PeopleActivityKind] ?? h.kind}
                    </span>
                    {h.text && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{h.text}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Log it"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Import LinkedIn's Connections.csv. */
export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [pending, start] = useTransition();
  const onFile = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      const text = await file.text();
      const res = await importLinkedinConnections(text);
      if (!res.success) return toastError(res.message);
      toastSuccess(`Imported: ${res.added} new, ${res.updated} updated. Best people to contact are at the top of Suggested.`);
      onImported();
      onClose();
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import your LinkedIn connections</DialogTitle>
          <DialogDescription>
            LinkedIn → Settings → Data privacy → Get a copy of your data → Connections. Unzip the file LinkedIn
            emails you and pick <b>Connections.csv</b>. It stays on this machine.
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".csv,text/csv" disabled={pending} onChange={(e) => onFile(e.target.files?.[0])} />
        {pending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Importing and ranking…
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
