"use client";
import { useEffect, useRef, useState } from "react";
import { ALL_TRACKS, useActiveTrack } from "@/hooks/useActiveTrack";
import { useHydrated } from "@/hooks/useHydrated";
import { Card, CardContent, CardFooter } from "../ui/card";
import { Loader } from "lucide-react";
import {
  deleteJobById,
  getJobDetails,
  updateJobStatus,
} from "@/actions/job.actions";
import { toastError, toastSuccess } from "@/lib/toast";
import {
  Company,
  JOB_SORT_FIELDS,
  JobLocation,
  JobSource,
  JobStatus,
  JobTitle,
  Tag,
} from "@/models/job.model";
import { useSort } from "@/hooks/useSort";
import { APP_CONSTANTS } from "@/lib/constants";
import Loading from "../Loading";
import { useRouter } from "next/navigation";
import MyJobsTable from "./MyJobsTable";
import MyJobsGrid from "./MyJobsGrid";
import { NoteDialog } from "./NoteDialog";
import { useJobFilters } from "./jobs-container/useJobFilters";
import { useJobsList } from "./jobs-container/useJobsList";
import { downloadJobsList } from "./jobs-container/downloadJobsCsv";
import { JobsToolbar } from "./jobs-container/JobsToolbar";
import { EMPTY_JOB_FACETS, JOB_VIEWS, hasJobFacets, jobViewFor } from "@/lib/jobs/jobFacets";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

type MyJobsProps = {
  statuses: JobStatus[];
  companies: Company[];
  titles: JobTitle[];
  locations: JobLocation[];
  sources: JobSource[];
  tags: Tag[];
};

function JobsContainer({
  statuses,
  companies,
  titles,
  locations,
  sources,
  tags,
}: MyJobsProps) {
  const router = useRouter();
  const [editJob, setEditJob] = useState(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteJobId, setNoteJobId] = useState("");

  const {
    queryParams,
    companyFilter,
    titleFilter,
    locationFilter,
    sourceFilter,
    appliedFilter,
    companyLabel,
    titleLabel,
    locationLabel,
    sourceLabel,
    clearCompanyFilter,
    clearTitleFilter,
    clearLocationFilter,
    clearSourceFilter,
    facets,
    applyFacets,
  } = useJobFilters({ companies, titles, locations, sources });

  // Keep the header's "Viewing" track and the Track filter in step. A link
  // that already carries a track wins over the remembered one.
  const [activeTrack, setActiveTrack] = useActiveTrack();
  const hydrated = useHydrated();
  const lastActive = useRef<string | null>(null);
  const urlTracks = facets.tracks.join(",");
  useEffect(() => {
    if (!hydrated) return;
    const fromUrl = facets.tracks.length === 1 ? facets.tracks[0] : ALL_TRACKS;
    if (lastActive.current === null) {
      lastActive.current = activeTrack;
      if (facets.tracks.length === 0 && activeTrack !== ALL_TRACKS) {
        applyFacets({ ...facets, tracks: [activeTrack] });
      } else if (fromUrl !== activeTrack) {
        lastActive.current = fromUrl;
        setActiveTrack(fromUrl);
      }
      return;
    }
    if (activeTrack !== lastActive.current) {
      // The switcher changed: filter the list to it.
      lastActive.current = activeTrack;
      const want = activeTrack === ALL_TRACKS ? "" : activeTrack;
      if (urlTracks !== want) applyFacets({ ...facets, tracks: want ? [want] : [] });
      return;
    }
    if (fromUrl !== activeTrack) {
      // The Track filter changed (popover or chip): follow it.
      lastActive.current = fromUrl;
      setActiveTrack(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, activeTrack, urlTracks]);

  const { sort, toggleSort } = useSort(
    JOB_SORT_FIELDS,
    APP_CONSTANTS.JOBS_SORT_STORAGE_KEY,
  );

  const {
    jobs,
    viewMode,
    onChangeViewMode,
    totalJobs,
    searchTerm,
    setSearchTerm,
    initialLoading,
    listLoaded,
    loadingMore,
    loadJobs,
    reloadJobs,
    sentinelRef,
  } = useJobsList({
    companyFilter,
    appliedFilter,
    titleFilter,
    locationFilter,
    sourceFilter,
    facets,
    sort,
  });

  const onDeleteJob = async (jobId: string) => {
    const { res, success, message } = await deleteJobById(jobId);
    if (success) {
      toastSuccess(`Job has been deleted successfully`);
    } else {
      toastError(message);
    }
    reloadJobs();
  };

  const onEditJob = async (jobId: string) => {
    const { job, success, message } = await getJobDetails(jobId);
    if (!success) {
      toastError(message);
      return;
    }
    setEditJob(job);
  };

  const onChangeJobStatus = async (jobId: string, jobStatus: JobStatus) => {
    const { success, message } = await updateJobStatus(jobId, jobStatus);
    if (success) {
      router.refresh();
      toastSuccess(`Job has been updated successfully`);
    } else {
      toastError(message);
    }
    reloadJobs();
  };

  const resetEditJob = () => {
    setEditJob(null);
  };

  const onAddNote = (jobId: string) => {
    setNoteJobId(jobId);
    setNoteDialogOpen(true);
  };

  const view = jobViewFor(facets.statuses);
  const views = [...JOB_VIEWS.map((v) => ({ id: v.id as string, label: v.label as string, statuses: [...v.statuses] as string[] })), { id: "all", label: "All", statuses: [] as string[] }];

  return (
    <>
      <nav aria-label="Job views" className="mb-3 flex gap-1 overflow-x-auto border-b">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={view === v.id ? "page" : undefined}
            onClick={() => applyFacets({ ...facets, statuses: v.statuses })}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm",
              view === v.id
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <Card x-chunk="dashboard-06-chunk-0">
        <JobsToolbar
          jobsCount={jobs.length}
          totalJobs={totalJobs}
          initialLoading={initialLoading}
          viewMode={viewMode}
          onChangeViewMode={onChangeViewMode}
          companyLabel={companyLabel}
          onClearCompanyFilter={clearCompanyFilter}
          titleLabel={titleLabel}
          onClearTitleFilter={clearTitleFilter}
          locationLabel={locationLabel}
          onClearLocationFilter={clearLocationFilter}
          sourceLabel={sourceLabel}
          onClearSourceFilter={clearSourceFilter}
          onReload={() => loadJobs(1, searchTerm || undefined)}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          facets={facets}
          onApplyFacets={applyFacets}
          scope={{
            companyValue: companyFilter || undefined,
            appliedOnly: appliedFilter || undefined,
            titleValue: titleFilter || undefined,
            locationValue: locationFilter || undefined,
            sourceValue: sourceFilter || undefined,
          }}
          onDownload={downloadJobsList}
          statuses={statuses}
          companies={companies}
          titles={titles}
          locations={locations}
          sources={sources}
          tags={tags}
          editJob={editJob}
          resetEditJob={resetEditJob}
          addJobInitialOpen={queryParams.get("add-job") === "true"}
        />
        <CardContent>
          {initialLoading && <Loading />}
          {!initialLoading &&
            listLoaded &&
            jobs.length === 0 &&
            hasJobFacets(facets) && (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <p>No jobs match these filters.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => applyFacets(EMPTY_JOB_FACETS)}
              >
                Clear all
              </Button>
            </div>
          )}
          {jobs.length > 0 &&
            (viewMode === "cards" ? (
              <MyJobsGrid
                jobs={jobs}
                jobStatuses={statuses}
                deleteJob={onDeleteJob}
                editJob={onEditJob}
                onChangeJobStatus={onChangeJobStatus}
                onAddNote={onAddNote}
              />
            ) : (
              <MyJobsTable
                jobs={jobs}
                jobStatuses={statuses}
                deleteJob={onDeleteJob}
                editJob={onEditJob}
                onChangeJobStatus={onChangeJobStatus}
                onAddNote={onAddNote}
                sort={sort}
                onSort={toggleSort}
              />
            ))}
          {jobs.length < totalJobs && (
            <div ref={sentinelRef} className="flex justify-center p-4">
              {loadingMore && (
                <Loader className="h-5 w-5 animate-spin text-blue-500" />
              )}
            </div>
          )}
        </CardContent>
        <CardFooter></CardFooter>
      </Card>
      <NoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        jobId={noteJobId}
        onSaved={() => reloadJobs()}
      />
    </>
  );
}

export default JobsContainer;
