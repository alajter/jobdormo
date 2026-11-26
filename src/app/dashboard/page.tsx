import { Metadata } from "next";
import { getToday } from "@/actions/today.actions";
import { TodayPage } from "@/components/today/TodayPage";
import { getResults } from "@/actions/results.actions";
import { getSetupStatus } from "@/actions/setup.actions";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function Today() {
  const [res, results, setup] = await Promise.all([getToday(), getResults(), getSetupStatus()]);
  const setupLeft = setup.filter((s) => s.required && !s.done).length;
  if (!res.success) return <p className="col-span-3 text-sm text-muted-foreground">Couldn&apos;t load today. Reload the page.</p>;
  return <TodayPage data={res.data} findings={results?.findings ?? []} setupLeft={setupLeft} />;
}
