"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Send } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { draftOutreach, logOutreachSent } from "@/actions/outreach.actions";
import { OUTREACH_KIND_LABELS, type OutreachKind } from "@/models/outreach.model";
import { toastError, toastSuccess } from "@/lib/toast";

// Draft a LinkedIn note, LinkedIn message or email about this job in the
// user's own voice; copy it, edit it, and log it on the job once sent.
export function OutreachDialog({
  jobId,
  jobLabel,
  onClose,
}: {
  jobId: string;
  jobLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<OutreachKind>("connection_note");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [relationship, setRelationship] = useState("");
  const [goal, setGoal] = useState("");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [drafting, startDraft] = useTransition();
  const [logging, startLog] = useTransition();

  const draft = () =>
    startDraft(async () => {
      const res = await draftOutreach({ jobId, kind, recipientName: name, recipientRole: role, relationship, goal });
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
      const res = await logOutreachSent({ jobId, kind, recipientName: name, recipientRole: role, text });
      if (!res.success) return toastError("Couldn't log it.");
      toastSuccess("Logged on the job's notes.");
      router.refresh();
      onClose();
    });

  const over = kind === "connection_note" && text.length > 300;

  return (
    <Dialog open onOpenChange={(o) => !o && !drafting && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" /> Draft outreach
          </DialogTitle>
          <DialogDescription>
            About {jobLabel}. Written in your voice from your CV and notes; it never invents how you
            know someone. Nothing is sent from here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <Select value={kind} onValueChange={(v) => setKind(v as OutreachKind)}>
            <SelectTrigger aria-label="Message type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(OUTREACH_KIND_LABELS) as OutreachKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {OUTREACH_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Their name (e.g. Lior)" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Their role (e.g. VP Product)" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <Input
            placeholder="How you're connected (e.g. 2nd degree, many mutuals / worked together at …)"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          />
          <Input
            placeholder="What you want (e.g. a referral / a short call / send my CV)"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <Button onClick={draft} disabled={drafting || !name.trim()}>
            {drafting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Writing…
              </>
            ) : text ? (
              "Rewrite"
            ) : (
              "Write it"
            )}
          </Button>

          {text && (
            <div className="grid gap-1">
              <Textarea rows={kind === "connection_note" ? 6 : 12} value={text} onChange={(e) => setText(e.target.value)} />
              <span className={`text-right text-xs ${over ? "text-destructive" : "text-muted-foreground"}`}>
                {text.length}
                {kind === "connection_note" ? " / 300" : ""} characters
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={drafting || logging}>
            Close
          </Button>
          {text && (
            <>
              <Button variant="outline" onClick={copy}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button onClick={markSent} disabled={logging}>
                {logging ? "Logging…" : "Mark as sent"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
