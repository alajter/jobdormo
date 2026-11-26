import { cn } from "@/lib/utils";

const tone = (n: number) =>
  n >= 70 ? "text-green-700 dark:text-green-400" : n >= 50 ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-400";

// ATS keyword match: the generic CV's score, and "→ tailored" when the job
// has a tailored CV.
export function AtsScore({ base, tailored }: { base?: number | null; tailored?: number | null }) {
  if (base == null && tailored == null) return <span className="text-muted-foreground">–</span>;
  const title = `ATS keyword match: generic CV ${base ?? "?"}%${tailored != null ? `, tailored CV ${tailored}%` : ""}`;
  return (
    <span className="whitespace-nowrap text-xs tabular-nums" title={title}>
      {tailored != null ? (
        <>
          <span className="text-muted-foreground">{base ?? "?"}</span>
          <span className="text-muted-foreground"> → </span>
          <span className={cn("font-semibold", tone(tailored))}>{tailored}</span>
        </>
      ) : (
        // Only the generic CV so far: a low score here means "tailor it",
        // not "something is wrong", so it stays quiet.
        <span className="text-muted-foreground">
          {base}
          <span className="block text-[10px] leading-none">generic</span>
        </span>
      )}
    </span>
  );
}
