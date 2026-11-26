import Link from "next/link";
import type { Finding, GroupStat, ResultsSummary } from "@/lib/results";
import { MIN_GROUP } from "@/lib/results";
import { cn } from "@/lib/utils";

const TONE: Record<Finding["tone"], { title: string; dot: string }> = {
  good: { title: "Working", dot: "bg-signal" },
  bad: { title: "Not working", dot: "bg-red-600 dark:bg-red-400" },
  early: { title: "Too early to tell", dot: "bg-muted-foreground" },
};

export function FindingsList({ findings, limit }: { findings: Finding[]; limit?: number }) {
  const order: Finding["tone"][] = ["bad", "good", "early"];
  const sorted = [...findings].sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone)).slice(0, limit);
  return (
    <ul className="grid gap-2.5">
      {sorted.map((f, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-snug">
          <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE[f.tone].dot)} />
          <span>
            <span className="sr-only">{TONE[f.tone].title}: </span>
            {f.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2">
      <div className="flex items-baseline justify-between gap-2 border-b pb-1.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function GroupTable({ groups }: { groups: GroupStat[] }) {
  return (
    <table className="w-full table-fixed text-sm tabular-nums">
      <colgroup>
        <col />
        <col className="w-12" />
        <col className="w-[4.5rem]" />
        <col className="w-[4.5rem]" />
        <col className="w-16" />
      </colgroup>
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-1.5 font-normal" />
          <th className="py-1.5 text-right font-normal">Sent</th>
          <th className="py-1.5 text-right font-normal">Interview</th>
          <th className="py-1.5 text-right font-normal">Rejected</th>
          <th className="py-1.5 text-right font-normal">Waiting</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.key} className="border-t border-border/60">
            <td className="truncate py-2 pr-2" title={g.key}>{g.key}</td>
            <td className="py-2 text-right">{g.n - g.withdrawn}</td>
            <td className={cn("py-2 text-right", g.interviews ? "font-semibold text-signal" : "text-muted-foreground")}>{g.interviews}</td>
            <td className={cn("py-2 text-right", g.rejected ? "" : "text-muted-foreground")}>{g.rejected}</td>
            <td className="py-2 text-right text-muted-foreground">{g.waiting}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ResultsPage({ data }: { data: ResultsSummary }) {
  const sent = data.total - data.withdrawn;
  const groups = (tone: Finding["tone"]) => data.findings.filter((f) => f.tone === tone);
  return (
    <div className="col-span-3 mx-auto grid w-full max-w-[2400px] grid-cols-[minmax(0,1fr)] gap-8 pb-6 pt-1">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Results</h1>
        <p className="text-sm text-muted-foreground">
          What your applications, messages and posts are producing. Every line has its count; a difference only counts as a
          pattern with {MIN_GROUP}+ answers on each side.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 tabular-nums sm:grid-cols-5 @3xl/main:grid-cols-5">
        {[
          ["Applications", sent, ""],
          ["Interviews", data.interviews, data.interviews ? "text-signal" : ""],
          ["Rejections", data.rejected, ""],
          ["Waiting", data.waiting, ""],
          ["Median days waiting", data.medianWaitDays != null ? data.medianWaitDays : "–", ""],
        ].map(([label, value, cls]) => (
          <div key={label as string}>
            <div className={cn("text-2xl font-semibold", cls as string)}>{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-8 @3xl/main:grid-cols-3">
        {(["bad", "good", "early"] as const).map((tone) => (
          <Section key={tone} title={TONE[tone].title}>
            {groups(tone).length ? (
              <FindingsList findings={groups(tone)} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            )}
          </Section>
        ))}
      </div>

      <div className="grid gap-8 @3xl/main:grid-cols-2 @7xl/main:grid-cols-3">
        <Section title="By route" meta="how the application went in">
          <GroupTable groups={data.byRoute} />
        </Section>
        <Section title="By CV" meta="the CV that went out">
          <GroupTable groups={data.byCv} />
        </Section>
        <Section title="By source" meta="where the job was found">
          <GroupTable groups={data.bySource} />
        </Section>
      </div>

      <div className="grid gap-8 @3xl/main:grid-cols-2">
        <Section title="Rejections" meta={`${data.rejections.length}`}>
          {data.rejections.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul>
              {data.rejections.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
                  <Link href={`/dashboard/myjobs/${r.id}?tab=history`} className="truncate font-medium hover:underline">
                    {r.company}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.cv}
                    {r.ats != null ? ` ${r.ats}%` : ""} · {r.route} · {r.days != null ? `${r.days} day${r.days === 1 ? "" : "s"} after applying` : "date unknown"}
                    {r.afterInterview ? " · after an interview" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="People and posts">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm tabular-nums">
            <div>
              <dt className="text-xs text-muted-foreground">Messages sent</dt>
              <dd className="text-lg font-semibold">{data.network.sent}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Replies</dt>
              <dd className="text-lg font-semibold">
                {data.network.replies}
                {data.network.sent ? (
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    ({Math.round((data.network.replies / data.network.sent) * 100)}%)
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Intros and referrals</dt>
              <dd className="text-lg font-semibold">{data.network.intros}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">LinkedIn posts</dt>
              <dd className="text-lg font-semibold">
                {data.posts.published}
                {data.posts.published ? (
                  <span className="text-sm font-normal text-muted-foreground"> · {data.posts.impressions} views</span>
                ) : null}
              </dd>
            </div>
          </dl>
        </Section>
      </div>
    </div>
  );
}
