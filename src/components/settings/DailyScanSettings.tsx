"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Play } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { getDailyScan, runScanNow, setDailyScan } from "@/actions/dailyScan.actions";
import type { DailyScanStatus } from "@/lib/schedule/dailyScan";
import { toastError, toastSuccess } from "@/lib/toast";

const TIMES = Array.from({ length: 24 * 2 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  return { value: `${hour}:${minute}`, label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
});

function DailyScanSettings() {
  const [status, setStatus] = useState<DailyScanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(
    () =>
      getDailyScan().then((s) => {
        setStatus(s);
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    refresh();
    // Keep "running" and "last run" fresh while the page is open.
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const apply = (on: boolean, hour: number, minute: number) =>
    startTransition(async () => {
      const res = await setDailyScan(on, hour, minute);
      if (!res.success) return toastError(res.message);
      toastSuccess(res.message);
      if (res.status) setStatus(res.status);
    });

  const runNow = () =>
    startTransition(async () => {
      const res = await runScanNow();
      if (res.success) toastSuccess(res.message);
      else toastError(res.message);
      refresh();
    });

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking the schedule…
      </p>
    );
  }

  const time = `${status?.hour ?? 8}:${status?.minute ?? 0}`;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Daily scan</h3>
        <p className="text-sm text-muted-foreground">
          Every morning: runs your automations, searches the web for roles that fit your brief,
          adds company profiles and AI-matches the new jobs. Runs on this Mac; if it&apos;s asleep at
          that time, the scan runs when it wakes.
        </p>
      </div>

      {!status?.supported ? (
        <p className="text-sm text-muted-foreground">The daily scan is only available on macOS.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 rounded-md border p-4">
            <div className="space-y-1">
              <Label htmlFor="daily-scan">Run the scan every day</Label>
              <p className="text-xs text-muted-foreground">
                {status.enabled ? "On." : "Off: no scheduled scans."}
              </p>
            </div>
            <Switch
              id="daily-scan"
              checked={status.enabled}
              disabled={pending}
              onCheckedChange={(on) => apply(on, status.hour, status.minute)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-sm">Time</Label>
            <Select
              value={time}
              disabled={pending || !status.enabled}
              onValueChange={(v) => {
                const [h, m] = v.split(":").map(Number);
                apply(true, h, m);
              }}
            >
              <SelectTrigger className="h-8 w-28" aria-label="Scan time">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={runNow} disabled={pending || status.running}>
              {status.running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {status.running ? "Scanning…" : "Run now"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {status.lastRun
                ? `Last scan ${formatDistanceToNow(new Date(status.lastRun), { addSuffix: true })}`
                : "No scan has run yet."}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default DailyScanSettings;
