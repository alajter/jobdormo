// Full AI match (the same analysis the agent chat's match_job tool writes:
// summary, requirements met / partial / missing, skills, action item) for
// every open job that doesn't have one yet. Automations only run a short
// match on their top jobs, and web-agent or manual jobs get none.
//
//   npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/match-jobs.ts <userEmail>
//
// ALL=1 re-matches every open job.
import { generateText } from "ai";
import pLimit from "p-limit";
import prisma from "@/lib/db";
import { APP_CONSTANTS, TEMPERATURES } from "@/lib/constants";
import { getModel } from "@/lib/ai";
import { resumeDetailInclude } from "@/lib/jobs/resumeDetailInclude";
import { preprocessResume } from "@/lib/ai/tools/preprocessing";
import { preprocessJob } from "@/lib/ai/tools/preprocessing-job";
import { JOB_MATCH_SYSTEM_PROMPT, buildJobMatchPrompt } from "@/lib/ai/prompts/job-match";
import { parseJobMatch } from "@/lib/ai/jobMatch/parse";
import { getUserAiSettings } from "@/lib/scraper/runner";
import { getDefaultModelForProvider } from "@/lib/scraper/automation-run/aiSettings";
import type { JobMatchData } from "@/models/ai.schemas";
import { loadCvTracks, readTrackCvText, trackCvMtime } from "@/lib/cv/tracks";
import { guessTrack } from "@/models/cvTrack.model";

const OPEN = ["new", "draft", "applied", "interview"];
const SURFACE = "daily-full-match";

// A full match is one written by the chat or by this script, against the
// job's current track; prerank scores, short automation matches and matches
// against another CV don't count.
function hasFullMatch(matchData: string | null, track: string | null): boolean {
  if (!matchData) return false;
  try {
    const d = JSON.parse(matchData);
    const full = typeof d.body === "string" && d.body.length > 200 && (d.surface === SURFACE || d.surface === APP_CONSTANTS.AGENT_CHAT_MATCH_SURFACE);
    if (!full) return false;
    if (!track) return true;
    // Stale when matched against another track, or before its CV last changed.
    const matchedAt = Date.parse(d.matchedAt ?? "");
    return d.track === track && !(matchedAt < trackCvMtime(track));
  } catch {
    return false;
  }
}

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: match-jobs.ts <userEmail>");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  // The resume the automations match against.
  const automation = await prisma.automation.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const resume = await prisma.resume.findFirst({
    where: automation ? { id: automation.resumeId } : { profile: { userId: user.id } },
    include: resumeDetailInclude,
  });
  if (!resume) throw new Error("no resume");
  const resumePre = await preprocessResume(resume as any);
  if (!resumePre.success) throw new Error("resume unreadable");

  const ai = await getUserAiSettings(user.id);
  const modelName = ai.model || getDefaultModelForProvider(ai.provider);
  const model = await getModel(ai.provider, modelName, user.id);

  const jobs = await prisma.job.findMany({
    where: { userId: user.id, Status: { value: { in: OPEN } } },
    include: { JobTitle: true, Company: true, Location: true },
  });

  // Give every open job a CV track (from tracks.json) if it has none.
  const tracks = loadCvTracks();
  const trackIds = tracks.map((t) => t.id);
  for (const j of jobs) {
    if (j.track && trackIds.includes(j.track)) continue;
    const t = guessTrack(j.JobTitle.label, j.Company.areas ?? [], trackIds);
    if (t) {
      await prisma.job.update({ where: { id: j.id }, data: { track: t } });
      j.track = t;
      console.log(`TRACK | ${t} | ${j.Company.label} | ${j.JobTitle.label}`);
    }
  }
  // Each track's CV as text, read once.
  const cvText = new Map<string, string>();
  for (const t of tracks) {
    const text = readTrackCvText(t.id);
    if (text) cvText.set(t.id, text);
  }

  const todo = process.env.ALL ? jobs : jobs.filter((j) => !hasFullMatch(j.matchData, j.track));
  console.log(`Matching ${todo.length} of ${jobs.length} open jobs with ${ai.provider}/${modelName}`);

  const limit = pLimit(2);
  let done = 0;
  await Promise.all(
    todo.map((j) =>
      limit(async () => {
        const label = `${j.Company.label} | ${j.JobTitle.label}`;
        try {
          const jobPre = await preprocessJob(j as any);
          if (!jobPre.success) return console.log(`SKIP  | ${label} | description too short`);
          const { text } = await generateText({
            model,
            system: JOB_MATCH_SYSTEM_PROMPT,
            prompt: buildJobMatchPrompt(
              (j.track && cvText.get(j.track)) || resumePre.data.normalizedText,
              jobPre.data.normalizedText,
            ),
            temperature: TEMPERATURES.FEEDBACK,
            abortSignal: AbortSignal.timeout(APP_CONSTANTS.AI_JOB_MATCH_TIMEOUT_MS),
          });
          const { scores, body } = parseJobMatch(text);
          // Same rule as the chat: never overwrite with an unscored result.
          if (!scores) return console.log(`FAIL  | ${label} | no scores line`);
          const trackCv = j.track && cvText.has(j.track) ? tracks.find((t) => t.id === j.track) : undefined;
          const matchData: JobMatchData & { track?: string } = {
            ...scores,
            body,
            resumeId: resume.id,
            resumeTitle: trackCv ? `${trackCv.label} CV (${trackCv.file})` : resume.title,
            track: trackCv?.id,
            matchedAt: new Date().toISOString(),
            provider: ai.provider,
            model: modelName,
            surface: SURFACE,
          };
          await prisma.job.update({
            where: { id: j.id, userId: user.id },
            data: { matchScore: scores.matchScore, matchData: JSON.stringify(matchData) },
          });
          done++;
          console.log(`MATCH | ${String(scores.matchScore).padStart(3)} | ${label}`);
        } catch (e) {
          console.log(`FAIL  | ${label} | ${e instanceof Error ? e.message : e}`);
        }
      }),
    ),
  );
  console.log(`Done: ${done} matched.`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
