// Keeps the next LinkedIn post drafted for its slot (Tue/Thu 08:30, at
// least 3 days after the last one). Runs in the daily scan; safe to run any
// time: does nothing when a post is already waiting.
//   npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/next-post.ts <email>
import prisma from "@/lib/db";
import { ensureNextPost } from "@/lib/posts/autoPost";

async function main() {
  const email = process.argv[2] || process.env.JOBSYNC_USER_EMAIL;
  if (!email) throw new Error("usage: next-post.ts <email>");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const r = await ensureNextPost(user.id);
  const when = r.scheduledFor ? r.scheduledFor.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
  console.log(r.created ? `Drafted the next post for ${when}.` : `Next post already waiting (${when}).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
