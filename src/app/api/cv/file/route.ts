import "server-only";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { cvPath } from "@/lib/cv/tracks";

// A PDF from the CV folder (My CVs): ?path=generic/X.pdf, &download=1 to save.
// Only PDFs, only inside the folder, never the archive or dot-folders.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ message: "Not Authenticated" }, { status: 401 });
  const rel = req.nextUrl.searchParams.get("path") ?? "";
  const p = cvPath(rel);
  const parts = rel.split("/");
  if (!p || !rel.endsWith(".pdf") || parts.some((s) => s.startsWith(".") || s === "archive")) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  try {
    const body = readFileSync(p);
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${path.basename(p)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ message: "PDF not found" }, { status: 404 });
  }
}
