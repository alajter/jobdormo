"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import { CalendarDays, Check, Copy, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deletePost, draftPost, getPosts, savePost, type PostRow } from "@/actions/posts.actions";
import { generatePlan, getCampaign, savePostMetrics, type Campaign } from "@/actions/campaign.actions";
import { POST_STATUSES, POST_STATUS_CODES, isPostStatus } from "@/models/people.model";
import { toastError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CampaignDialog } from "./CampaignDialog";

type Draft = {
  id?: string;
  topic: string;
  body: string;
  status: string;
  url: string;
  pillar: string | null;
  angle: string | null;
  scheduledFor: Date | null;
  impressions: string;
  reactions: string;
  comments: string;
};
const EMPTY: Draft = { topic: "", body: "", status: "idea", url: "", pillar: null, angle: null, scheduledFor: null, impressions: "", reactions: "", comments: "" };
const num = (v: number | null) => (v == null ? "" : String(v));
const toDraft = (p: PostRow): Draft => ({
  id: p.id,
  topic: p.topic ?? "",
  body: p.body,
  status: p.status,
  url: p.url ?? "",
  pillar: p.pillar,
  angle: p.angle,
  scheduledFor: p.scheduledFor,
  impressions: num(p.impressions),
  reactions: num(p.reactions),
  comments: num(p.comments),
});

// LinkedIn campaign manager: the campaign (goal, audience, themes, cadence),
// its plan of dated post ideas, and an editor that writes each post in the
// user's voice. Posting is by hand; results are logged back here.
export function PostsPage() {
  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [notes, setNotes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [copied, setCopied] = useState(false);
  const [editCampaign, setEditCampaign] = useState(false);
  const [drafting, startDraft] = useTransition();
  const [saving, startSave] = useTransition();
  const [planning, startPlan] = useTransition();

  const load = useCallback(() => getPosts().then(setPosts), []);
  useEffect(() => {
    getCampaign().then(setCampaign);
    // Open the next post due (or the newest) on first load.
    getPosts().then((list) => {
      setPosts(list);
      const today = startOfDay(new Date());
      const next =
        list.find((p) => p.status !== "posted" && p.scheduledFor && !isBefore(new Date(p.scheduledFor), today)) ?? list[0];
      if (next) setD(toDraft(next));
    });
  }, []);

  const pick = (p: PostRow) => {
    setD(toDraft(p));
    setNotes("");
    setInstructions("");
    setCopied(false);
  };

  const plan = () =>
    startPlan(async () => {
      if (!campaign) return;
      const res = await generatePlan(campaign.id);
      if (!res.success) return toastError(res.message);
      toastSuccess(`Planned ${res.count} posts.`);
      const list = await getPosts();
      setPosts(list);
      const first = list.find((p) => p.status === "idea");
      if (first) setD(toDraft(first));
    });

  const write = () =>
    startDraft(async () => {
      const res = await draftPost({
        postId: d.id,
        topic: d.topic,
        notes,
        current: d.body.trim() ? d.body : undefined,
        instructions: d.body.trim() ? instructions : undefined,
      });
      if (!res.success || !res.text) return toastError(res.message);
      setD((x) => ({ ...x, body: res.text!, status: x.status === "idea" ? "draft" : x.status }));
      setCopied(false);
    });

  const save = (status?: string) =>
    startSave(async () => {
      const next = status ?? d.status;
      const res = await savePost({ id: d.id, topic: d.topic, body: d.body, status: next, url: d.url });
      if (!res.success) return toastError(res.message);
      if (res.id && next === "posted" && (d.impressions || d.reactions || d.comments)) {
        await savePostMetrics(res.id, {
          impressions: d.impressions ? Number(d.impressions) : null,
          reactions: d.reactions ? Number(d.reactions) : null,
          comments: d.comments ? Number(d.comments) : null,
        });
      }
      setD((x) => ({ ...x, id: res.id, status: next }));
      toastSuccess(next === "posted" ? "Marked as posted. Add its results in a day or two." : "Saved.");
      load();
    });

  const remove = () =>
    startSave(async () => {
      if (!d.id) return setD(EMPTY);
      await deletePost(d.id);
      setD(EMPTY);
      load();
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(d.body);
      setCopied(true);
    } catch {
      toastError("Couldn't copy; select the text and copy it by hand.");
    }
  };

  const today = startOfDay(new Date());
  const planned = (posts ?? []).filter((p) => p.scheduledFor);
  const posted = (posts ?? []).filter((p) => p.status === "posted");
  const dueNow = planned.filter((p) => p.status !== "posted" && isBefore(new Date(p.scheduledFor!), new Date(today.getTime() + 86400000)));
  const totals = posted.reduce(
    (a, p) => ({ i: a.i + (p.impressions ?? 0), r: a.r + (p.reactions ?? 0), c: a.c + (p.comments ?? 0) }),
    { i: 0, r: 0, c: 0 },
  );

  return (
    <div className="col-span-3 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-2xl font-semibold leading-none tracking-tight">LinkedIn campaign</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan, write in your voice, copy into LinkedIn, mark as posted, log results. Nothing is posted from here.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => pick({ ...EMPTY, id: "", campaignId: null, scheduledFor: null, pillar: null, angle: null, impressions: null, reactions: null, comments: null, topic: "", body: "", status: "idea", url: null, postedAt: null, updatedAt: new Date() } as unknown as PostRow)}>
          <Plus className="mr-2 h-4 w-4" /> Extra post
        </Button>
      </div>

      {/* Campaign */}
      <section className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
        {campaign === undefined ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : campaign === null ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground">
              No campaign yet. Set your goal, audience and themes, and the AI plans your posts for the next weeks.
            </p>
            <Button size="sm" onClick={() => setEditCampaign(true)}>Set up the campaign</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{campaign.name}</div>
                <p className="text-muted-foreground">{campaign.goal}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditCampaign(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" onClick={plan} disabled={planning}>
                  {planning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}
                  {planned.length ? "Re-plan ideas" : "Plan my posts"}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>{campaign.cadence} posts a week · {campaign.weeks} weeks from {format(new Date(campaign.startDate), "d MMM")}</span>
              <span>{posted.length} posted · {planned.filter((p) => p.status !== "posted").length} to go</span>
              {posted.length > 0 && (
                <span>{totals.i} impressions · {totals.r} reactions · {totals.c} comments</span>
              )}
              {dueNow.length > 0 && <span className="font-medium text-amber-700 dark:text-amber-300">{dueNow.length} due now</span>}
            </div>
            {planning && (
              <p className="text-xs text-muted-foreground">Planning around your goal, themes and past results… about a minute. Drafts and posted posts are kept.</p>
            )}
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Plan / list */}
        <div className="flex flex-col gap-2">
          {posts === null ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet.</p>
          ) : (
            posts.map((p) => {
              const due = p.status !== "posted" && p.scheduledFor && isBefore(new Date(p.scheduledFor), new Date(today.getTime() + 86400000));
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className={cn("rounded-md border p-3 text-left text-sm hover:bg-muted/50", d.id === p.id && "border-primary")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{p.topic || p.body.slice(0, 50) || "Untitled"}</span>
                    <span className={cn("shrink-0 rounded-full px-2 text-xs", isPostStatus(p.status) ? POST_STATUSES[p.status].className : "")}>
                      {isPostStatus(p.status) ? POST_STATUSES[p.status].label : p.status}
                    </span>
                  </div>
                  <div className={cn("mt-1 truncate text-xs text-muted-foreground", due && "font-medium text-amber-700 dark:text-amber-300")}>
                    {p.status === "posted" && p.postedAt
                      ? `Posted ${format(new Date(p.postedAt), "EEE d MMM")}${p.impressions != null ? ` · ${p.impressions} impressions` : ""}`
                      : p.scheduledFor
                        ? `${format(new Date(p.scheduledFor), "EEE d MMM")}${p.pillar ? ` · ${p.pillar}` : ""}`
                        : `Edited ${format(new Date(p.updatedAt), "d MMM")}`}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Editor */}
        <div className="flex flex-col gap-3 rounded-md border p-4">
          {(d.scheduledFor || d.pillar) && (
            <div className="text-xs text-muted-foreground">
              {d.scheduledFor && <>Planned for {format(new Date(d.scheduledFor), "EEEE d MMM")}</>}
              {d.pillar && <> · {d.pillar}</>}
            </div>
          )}
          <Input placeholder="What's it about? (e.g. a lesson from your last project)" value={d.topic} onChange={(e) => setD({ ...d, topic: e.target.value })} />
          {d.angle && (
            <div className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{d.angle}</div>
          )}
          {!d.body.trim() ? (
            <Textarea
              rows={3}
              placeholder="Facts and points to include, in your words (the AI uses only true facts: yours, your CVs and notes)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          ) : (
            <Input
              placeholder="How to change it (e.g. shorter, more personal, sound more like me)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          )}
          <div>
            <Button variant="outline" size="sm" onClick={write} disabled={drafting || (!d.topic.trim() && !d.body.trim())}>
              {drafting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {d.body.trim() ? "Rewrite with AI" : "Write with AI"}
            </Button>
          </div>
          <Textarea rows={14} placeholder="The post" value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{d.body.length} characters</span>
            <span>Tip: put links in the first comment, add an image, answer every comment in the first hour.</span>
          </div>
          {d.status === "posted" && (
            <div className="grid gap-2 rounded-md border p-3">
              <div className="text-xs font-medium">Results (from LinkedIn, after a day or two)</div>
              <Input placeholder="Link to the post on LinkedIn" value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                {(["impressions", "reactions", "comments"] as const).map((k) => (
                  <Input
                    key={k}
                    type="number"
                    min={0}
                    placeholder={k[0].toUpperCase() + k.slice(1)}
                    value={d[k]}
                    onChange={(e) => setD({ ...d, [k]: e.target.value })}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Status"
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={d.status}
              onChange={(e) => setD({ ...d, status: e.target.value })}
            >
              {POST_STATUS_CODES.map((s) => (
                <option key={s} value={s}>{POST_STATUSES[s].label}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => save()} disabled={saving || (!d.body.trim() && !d.topic.trim())}>Save</Button>
            <Button size="sm" variant="outline" onClick={copy} disabled={!d.body.trim()}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            {d.status !== "posted" && (
              <Button size="sm" variant="outline" onClick={() => save("posted")} disabled={saving || !d.body.trim()}>
                Mark as posted
              </Button>
            )}
            {(d.id || d.body) && (
              <Button size="sm" variant="ghost" className="ml-auto text-red-600" onClick={remove} disabled={saving}>
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {editCampaign && (
        <CampaignDialog
          campaign={campaign ?? null}
          onClose={() => setEditCampaign(false)}
          onSaved={() => getCampaign().then(setCampaign)}
        />
      )}
    </div>
  );
}
