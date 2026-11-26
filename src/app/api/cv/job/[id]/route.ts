import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { cvPath } from "@/lib/cv/tracks";

// The tailored CV PDF for one of the user's jobs (?download=1 to save it).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ message: "Not Authenticated" }, { status: 401 });
  const { id } = await params;
  const job = await db.job.findFirst({ where: { id, userId }, select: { tailoredCv: true } });
  if (!job?.tailoredCv) return NextResponse.json({ message: "No tailored CV for this job" }, { status: 404 });
  const html = cvPath(job.tailoredCv);
  if (!html || !html.endsWith(".html")) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const pdf = html.replace(/\.html$/, ".pdf");
  try {
    const body = readFileSync(pdf);
    const name = path.basename(pdf);
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ message: "PDF not found" }, { status: 404 });
  }
}
