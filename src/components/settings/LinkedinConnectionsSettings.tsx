"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Loader2, Upload } from "lucide-react";
import { Button } from "../ui/button";
import { getConnectionsSummary, importLinkedinConnections } from "@/actions/people.actions";
import { toastError, toastSuccess } from "@/lib/toast";

// Settings → LinkedIn connections: import LinkedIn's Connections.csv. New
// people are added, people already in Jobdormo get their current company and
// title, and everyone is ranked by who to ask first.
function LinkedinConnectionsSettings() {
  const input = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<{ count: number; newest: Date | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ added: number; updated: number; file: string } | null>(null);

  useEffect(() => {
    getConnectionsSummary().then(setSummary);
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10_000_000) return toastError("That file is over 10 MB. Pick Connections.csv from the export.");
    setBusy(true);
    try {
      const res = await importLinkedinConnections(await file.text());
      if (!res.success) return toastError(res.message ?? "Couldn't read that file.");
      setLast({ added: res.added ?? 0, updated: res.updated ?? 0, file: file.name });
      toastSuccess(`Imported: ${res.added ?? 0} new, ${res.updated ?? 0} updated.`);
      setSummary(await getConnectionsSummary());
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="grid max-w-2xl gap-6">
      <div className="grid gap-1">
        <h4 className="text-lg font-semibold">LinkedIn connections</h4>
        <p className="text-sm text-muted-foreground">
          Jobdormo uses your connections to tell you who you know at each company you&apos;re looking at, on Today and on
          every job page, and to draft the message to them.
        </p>
      </div>

      <div className="grid gap-1 text-sm">
        <div>
          <span className="text-2xl font-semibold tabular-nums">{summary ? summary.count.toLocaleString() : "…"}</span>
          <span className="text-muted-foreground"> connections in Jobdormo</span>
        </div>
        {summary?.newest && (
          <div className="text-xs text-muted-foreground">Newest connection: {format(new Date(summary.newest), "d MMM yyyy")}</div>
        )}
      </div>

      <div className="grid gap-3">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
          aria-label="LinkedIn Connections.csv"
        />
        <div>
          <Button onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {busy ? "Importing…" : "Import Connections.csv"}
          </Button>
        </div>
        {last && (
          <p className="text-sm">
            {last.file}: {last.added} new, {last.updated} updated.{" "}
            <Link href="/dashboard/people" className="font-medium underline underline-offset-2">
              See people
            </Link>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Re-importing is safe: nobody is duplicated, and people who changed jobs get their new company. People you added by
          hand keep what you wrote.
        </p>
      </div>

      <div className="grid gap-1 text-sm">
        <div className="font-medium">Getting the file from LinkedIn</div>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>LinkedIn → Me → Settings &amp; Privacy → Data privacy → Get a copy of your data.</li>
          <li>Choose “Want something in particular?”, tick Connections, and request the archive.</li>
          <li>LinkedIn emails a link, usually within minutes. Unzip it and pick Connections.csv here.</li>
        </ol>
      </div>
    </div>
  );
}

export default LinkedinConnectionsSettings;
