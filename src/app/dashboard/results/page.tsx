import { Metadata } from "next";
import { getResults } from "@/actions/results.actions";
import { ResultsPage } from "@/components/results/ResultsPage";

export const metadata: Metadata = { title: "Results" };
export const dynamic = "force-dynamic";

export default async function Results() {
  const data = await getResults();
  if (!data) return <p className="col-span-3 text-sm text-muted-foreground">Couldn&apos;t load results. Reload the page.</p>;
  return <ResultsPage data={data} />;
}
