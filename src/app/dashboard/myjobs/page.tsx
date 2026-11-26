import { Metadata } from "next";

import { getJobSourceList, getStatusList } from "@/actions/job.actions";
import JobsContainer from "@/components/myjobs/JobsContainer";
import { getAllCompanies } from "@/actions/company.actions";
import { getAllJobTitles } from "@/actions/jobtitle.actions";
import { getAllJobLocations } from "@/actions/jobLocation.actions";
import { getAllTags } from "@/actions/tag.actions";
import { getCvTracks } from "@/actions/cvTrack.actions";
import { CvTracksProvider } from "@/components/myjobs/CvTracksContext";

export const metadata: Metadata = {
  title: "Jobs",
};

async function MyJobs() {
  const [statuses, companies, titles, locations, sources, tags, tracks] =
    await Promise.all([
      getStatusList(),
      getAllCompanies(),
      getAllJobTitles(),
      getAllJobLocations(),
      getJobSourceList(),
      getAllTags(),
      getCvTracks(),
    ]);
  return (
    <div className="col-span-3">
      <CvTracksProvider value={tracks}>
      <JobsContainer
        companies={companies}
        titles={titles}
        locations={locations}
        sources={sources}
        statuses={statuses}
        tags={tags ?? []}
      />
      </CvTracksProvider>
    </div>
  );
}

export default MyJobs;
