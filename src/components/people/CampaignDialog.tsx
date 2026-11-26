"use client";
import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
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
import { getCampaignDefaults, saveCampaign, type Campaign } from "@/actions/campaign.actions";
import { toastError, toastSuccess } from "@/lib/toast";

// Set up or edit the LinkedIn campaign: what it's for, who it's for, the
// content themes, and the cadence. A new campaign starts from defaults
// built around the job search.
export function CampaignDialog({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: campaign?.name ?? "",
    goal: campaign?.goal ?? "",
    audience: campaign?.audience ?? "",
    pillars: campaign?.pillars ?? "",
    cadence: String(campaign?.cadence ?? 2),
    weeks: String(campaign?.weeks ?? 6),
    startDate: format(campaign ? new Date(campaign.startDate) : new Date(), "yyyy-MM-dd"),
    notes: campaign?.notes ?? "",
  });
  const [pending, start] = useTransition();

  useEffect(() => {
    if (campaign) return;
    let alive = true;
    getCampaignDefaults().then(
      (d) =>
        alive &&
        setF((x) => ({ ...x, name: d.name, goal: d.goal, audience: d.audience, pillars: d.pillars, cadence: String(d.cadence), weeks: String(d.weeks) })),
    );
    return () => {
      alive = false;
    };
  }, [campaign]);

  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = () =>
    start(async () => {
      const res = await saveCampaign({
        id: campaign?.id,
        ...f,
        cadence: Number(f.cadence),
        weeks: Number(f.weeks),
      });
      if (!res.success) return toastError(res.message);
      toastSuccess(campaign ? "Campaign saved." : "Campaign created. Now plan your posts.");
      onSaved();
      onClose();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit campaign" : "Set up your LinkedIn campaign"}</DialogTitle>
          <DialogDescription>
            What you want LinkedIn to do for you, and for whom. Every planned post and draft is written for this.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="grid gap-1">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" value={f.name} onChange={(e) => set("name")(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="c-goal">Goal: what should happen because of these posts?</Label>
            <Textarea id="c-goal" rows={3} value={f.goal} onChange={(e) => set("goal")(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="c-aud">Audience: who should notice you?</Label>
            <Textarea id="c-aud" rows={2} value={f.audience} onChange={(e) => set("audience")(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="c-pil">Themes (one per line): what you&apos;ll be known for</Label>
            <Textarea id="c-pil" rows={5} value={f.pillars} onChange={(e) => set("pillars")(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="c-cad">Posts per week</Label>
              <Input id="c-cad" type="number" min={1} max={5} value={f.cadence} onChange={(e) => set("cadence")(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="c-wk">Weeks</Label>
              <Input id="c-wk" type="number" min={1} max={12} value={f.weeks} onChange={(e) => set("weeks")(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="c-start">Start</Label>
              <Input id="c-start" type="date" value={f.startDate} onChange={(e) => set("startDate")(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="c-notes">Anything else (stories you want to tell, things to avoid, a launch date)</Label>
            <Textarea id="c-notes" rows={3} value={f.notes} onChange={(e) => set("notes")(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save campaign"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
