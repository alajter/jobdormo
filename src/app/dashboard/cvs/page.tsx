import { Metadata } from "next";
import { getCvLibrary } from "@/actions/cvLibrary.actions";
import { getLatestGapReport } from "@/actions/gapReport.actions";
import { getCvTracks } from "@/actions/cvTrack.actions";
import { CvLibraryPage } from "@/components/cvs/CvLibraryPage";
import { GapsSummary } from "@/components/myjobs/GapsSummary";
import { CvTracksProvider } from "@/components/myjobs/CvTracksContext";
import CandidateNotesSettings from "@/components/settings/CandidateNotesSettings";

export const metadata: Metadata = { title: "My CVs" };
export const dynamic = "force-dynamic";

export default async function MyCvs() {
  const [data, gapReport, tracks] = await Promise.all([getCvLibrary(), getLatestGapReport(), getCvTracks()]);
  return (
    <CvTracksProvider value={tracks}>
      <CvLibraryPage
        data={data}
        gaps={
          gapReport && gapReport.clusters.length ? (
            <div className="pt-2">
              <GapsSummary report={gapReport} />
            </div>
          ) : (
            <p className="py-3 text-sm text-muted-foreground">No gap report yet. It builds up as jobs get matched.</p>
          )
        }
        knowledge={
          <div className="pt-2">
            <CandidateNotesSettings />
          </div>
        }
      />
    </CvTracksProvider>
  );
}
