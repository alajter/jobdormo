"use client";
import {
  Company,
  JobLocation,
  JobResponse,
  JobSource,
  JobStatus,
  JobTitle,
  Tag,
} from "@/models/job.model";
import { TipTapContentViewer } from "../TipTapContentViewer";
import { Card } from "../ui/card";
import { Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAgentChat } from "@/components/agent/AgentChatProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { NotesSection } from "./NotesSection";
import { useEffect, useState, useMemo } from "react";
import { MatchDetails } from "../automations/MatchDetails";
import type { JobMatchData } from "@/models/ai.schemas";
import { DeleteAlertDialog } from "../DeleteAlertDialog";
import { AddJob } from "./AddJob";
import { deleteJobById, updateJobStatus } from "@/actions/job.actions";
import { toastError, toastSuccess } from "@/lib/toast";
import { JobDetailsHeader } from "./job-details/JobDetailsHeader";
import { getCompanyAreaLabel } from "@/models/companyArea.model";
import { JobSummaryCard } from "./job-details/JobSummaryCard";
import { OutreachDialog } from "./job-details/OutreachDialog";
import { TailorCvDialog } from "./job-details/TailorCvDialog";
import { JobCvPanel } from "./job-details/JobCvPanel";
import { FitSection, JobFitView } from "./job-details/JobFitView";
import { JobTabEmptyState } from "./job-details/JobTabEmptyState";
import { CoverLetterTab } from "./job-details/CoverLetterTab";
import { useAutoMatch } from "./job-details/useAutoMatch";
import { JobContactsTab } from "./job-details/JobContactsTab";
import { JobTimelineTab } from "./job-details/timeline/JobTimelineTab";
import { useJobStages } from "./job-details/timeline/useJobStages";
import { UpdateStatusMenu } from "./job-details/timeline/UpdateStatusMenu";
import { AddStageDialog } from "@/components/AddStageDialog";
import { LinkInterviewersDialog } from "./job-details/timeline/LinkInterviewersDialog";
import { AddPrepQuestionsDialog } from "./job-details/timeline/AddPrepQuestionsDialog";
import type { JobStage, JobStageTypeRef } from "@/models/jobStage.model";

// Old tab names (saved links, redirects) → the section they now live in.
const SECTION_FOR_TAB: Record<string, string> = {
  cv: "cv",
  letter: "cv",
  people: "people",
  contacts: "people",
  history: "history",
  notes: "history",
  timeline: "history",
  posting: "posting",
  description: "posting",
  match: "fit",
};

type JobDetailsProps = {
  job: JobResponse;
  jobStatuses: JobStatus[];
  companies: Company[];
  titles: JobTitle[];
  locations: JobLocation[];
  sources: JobSource[];
  tags: Tag[];
  stageTypes: JobStageTypeRef[];
};

function JobDetails({
  job,
  jobStatuses,
  companies,
  titles,
  locations,
  sources,
  tags,
  stageTypes,
}: JobDetailsProps) {
  const {
    open: openChat,
    clear: clearChat,
    sendMessage,
    approvalPending,
    busy: chatBusy,
  } = useAgentChat();
  const [showClearChatConfirm, setShowClearChatConfirm] = useState(false);
  const [pendingChatMessage, setPendingChatMessage] = useState("");
  const [editJobTarget, setEditJobTarget] = useState<JobResponse | null>(
    null,
  );
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false);
  const [noteOpenTrigger, setNoteOpenTrigger] = useState(0);
  const [notesCount, setNotesCount] = useState(0);
  const [contactLinks, setContactLinks] = useState(job.contactLinks ?? []);
  const {
    stages,
    currentStage,
    selectedStage,
    selectedStageId,
    selectStage,
    reload: reloadStages,
  } = useJobStages(job.id, job.stages ?? []);
  // Derived, never mirrored: the status is the current stage's parent status,
  // and six server-side write paths keep Job.statusId equal to it. State here
  // would go stale on every stage add, edit or delete that moves the status.
  // job.Status covers the stageless job, which keeps whatever status it had.
  const currentStatus = currentStage?.StageType.Status ?? job.Status;
  const [addStageTarget, setAddStageTarget] = useState<
    { mode: "create" } | { mode: "edit"; stage: JobStage } | null
  >(null);
  const [linkInterviewersOpen, setLinkInterviewersOpen] = useState(false);
  const [prepQuestionsOpen, setPrepQuestionsOpen] = useState(false);
  const router = useRouter();
  // Sections on the one page; old ?tab= links scroll to the matching one.
  const goTo = (section: string) =>
    document.getElementById(`job-${SECTION_FOR_TAB[section] ?? section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const tabParam = useSearchParams().get("tab");
  useEffect(() => {
    if (!tabParam || tabParam === "fit") return;
    const id = setTimeout(() => goTo(tabParam), 300);
    return () => clearTimeout(id);
  }, [tabParam]);
  const goBack = () => router.back();

  // Derived from the server prop, not local state: the chat saves the match
  // server-side and fires router.refresh(), so mirrored state would go stale.
  const parsedMatchData = useMemo(() => {
    if (!job.matchData) return null;
    try {
      return JSON.parse(job.matchData) as JobMatchData;
    } catch {
      return null;
    }
  }, [job.matchData]);

  const jobLabel = `${job.JobTitle?.label ?? "this job"}${
    job.Company?.label ? ` at ${job.Company.label}` : ""
  }`;

  // Panel first so a failed clear can never leave a button looking dead, and
  // the message is sent either way — a conversation that would not clear is no
  // reason to withhold it.
  const startChat = async (text: string) => {
    openChat();
    try {
      await clearChat();
    } catch {
      // Reported by the action itself; the message still goes out.
    }
    void sendMessage({ parts: [{ type: "text", text }] });
  };

  const requestChat = (text: string) => {
    if (approvalPending) {
      setPendingChatMessage(text);
      setShowClearChatConfirm(true);
      return;
    }
    void startChat(text);
  };

  const onMatch = () => requestChat(`Match my resume to ${jobLabel}`);
  const onCoverLetter = () =>
    requestChat(`Write a cover letter for ${jobLabel}`);

  useAutoMatch(onMatch);

  // Doubles as the busy gate: the header button, the empty state and
  // Regenerate all key on this one reason.
  const coverLetterBlockedReason =
    job.descriptionCompleteness === "title-only"
      ? "Add a job description first"
      : chatBusy
        ? "The assistant is busy"
        : undefined;

  const onEditJob = () => {
    setEditJobTarget({ ...job, Status: currentStatus });
  };

  const resetEditJob = () => setEditJobTarget(null);

  const [outreachOpen, setOutreachOpen] = useState(false);
  // ?tailor=1 (from the jobs table's ATS column) opens Tailor CV directly.
  const searchParams = useSearchParams();
  const [tailorOpen, setTailorOpen] = useState(() => searchParams.get("tailor") === "1");

  const onAddNote = () => {
    goTo("history");
    setNoteOpenTrigger((prev) => prev + 1);
  };

  const onChangeStatus = async (status: JobStatus) => {
    const { success, message } = await updateJobStatus(job.id, status);
    if (success) {
      // The status change appends a stage server-side, and the badge reads
      // that stage, so this is awaited rather than fired off.
      await reloadStages();
      // applied/appliedDate may have changed too, and they come from the prop.
      router.refresh();
      toastSuccess(`Job has been updated successfully`);
    } else {
      toastError(message);
    }
  };

  const onDeleteJob = async () => {
    const { success, message } = await deleteJobById(job.id);
    if (success) {
      toastSuccess(`Job has been deleted successfully`);
      router.push("/dashboard/myjobs");
    } else {
      toastError(message);
    }
  };

  return (
    <>
      <div className="py-6 space-y-6">
        <JobDetailsHeader
          job={job}
          coverLetterBlockedReason={coverLetterBlockedReason}
          chatBusy={chatBusy}
          onBack={goBack}
          onMatch={onMatch}
          onCoverLetter={onCoverLetter}
          onEdit={onEditJob}
          onDelete={() => setDeleteAlertOpen(true)}
          onAddNote={onAddNote}
          onOutreach={() => setOutreachOpen(true)}
          onTailorCv={() => setTailorOpen(true)}
          onMarkApplied={
            ["new", "draft"].includes(currentStatus.value)
              ? () => {
                  const applied = jobStatuses.find((s) => s.value === "applied");
                  if (applied) onChangeStatus(applied);
                }
              : undefined
          }
          updateStatusMenu={
            <UpdateStatusMenu
              targetStage={selectedStage ?? currentStage}
              jobStatuses={jobStatuses}
              currentStatusId={currentStatus.id}
              onChangeStatus={onChangeStatus}
              onAddStage={() => setAddStageTarget({ mode: "create" })}
              onLinkInterviewers={() => setLinkInterviewersOpen(true)}
              onAddPrepQuestions={() => setPrepQuestionsOpen(true)}
            />
          }
        />

        {tailorOpen && (
          <TailorCvDialog
            jobId={job.id}
            jobLabel={jobLabel}
            hasTailored={!!job.tailoredCv}
            onClose={() => setTailorOpen(false)}
          />
        )}

        {outreachOpen && (
          <OutreachDialog
            jobId={job.id}
            jobLabel={jobLabel}
            onClose={() => setOutreachOpen(false)}
          />
        )}

        {/* One page, no tabs: the decision and fit on the left, the CV,
            people, company and history on the right, the posting below. */}
        <JobFitView
          job={job}
          matchData={parsedMatchData}
          peopleCount={contactLinks.length}
          chatBusy={chatBusy}
          onMatch={onMatch}
          onTailor={() => setTailorOpen(true)}
          onTab={goTo}
          cv={<JobCvPanel key={String(tailorOpen)} jobId={job.id} onOpen={() => setTailorOpen(true)} />}
          main={
            <>
              {parsedMatchData && parsedMatchData.analyzed !== false && (
                <details className="rounded-md border px-4 py-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Full fit analysis</summary>
                  <div className="pt-4">
                    <MatchDetails matchData={parsedMatchData} />
                  </div>
                </details>
              )}
              <FitSection id="job-posting" title="The posting">
                <div className="text-sm">
                  <TipTapContentViewer content={job?.description} />
                </div>
              </FitSection>
            </>
          }
          side={
            <>
              <FitSection id="job-history" title="Notes">
                <NotesSection jobId={job.id} openTrigger={noteOpenTrigger} onCountChange={setNotesCount} />
              </FitSection>
              <details className="group" open={stages.length > 1}>
                <summary className="cursor-pointer border-b pb-1.5 text-sm font-semibold">
                  Timeline <span className="font-normal text-muted-foreground">({stages.length})</span>
                </summary>
                <div className="pt-3">
                  <JobTimelineTab
                    stages={stages}
                    stageTypes={stageTypes}
                    selectedStageId={selectedStageId}
                    currentStageId={currentStage?.id ?? null}
                    onSelect={selectStage}
                    onAddStage={() => setAddStageTarget({ mode: "create" })}
                    onEditStage={(stage) => setAddStageTarget({ mode: "edit", stage })}
                    onLinkInterviewers={() => setLinkInterviewersOpen(true)}
                    onAddPrepQuestions={() => setPrepQuestionsOpen(true)}
                    onChanged={reloadStages}
                  />
                </div>
              </details>
              <details>
                <summary className="cursor-pointer border-b pb-1.5 text-sm font-semibold">
                  Contacts linked to this job <span className="font-normal text-muted-foreground">({contactLinks.length})</span>
                </summary>
                <div className="pt-3">
                  <JobContactsTab
                    jobId={job.id}
                    links={contactLinks}
                    onLinksChange={setContactLinks}
                    companies={companies}
                    locations={locations}
                  />
                </div>
              </details>
              <details>
                <summary className="cursor-pointer border-b pb-1.5 text-sm font-semibold">
                  Cover letter <span className="font-normal text-muted-foreground">({job.CoverLetter ? "1" : "none"})</span>
                </summary>
                <div className="pt-3">
                  <CoverLetterTab letter={job.CoverLetter} blockedReason={coverLetterBlockedReason} onGenerate={onCoverLetter} />
                </div>
              </details>
            </>
          }
        />
      </div>
      <AddJob
        jobStatuses={jobStatuses}
        companies={companies}
        jobTitles={titles}
        locations={locations}
        jobSources={sources}
        tags={tags}
        editJob={editJobTarget}
        resetEditJob={resetEditJob}
        hideTrigger
        redirectPath={`/dashboard/myjobs/${job.id}`}
      />
      <AddStageDialog
        open={!!addStageTarget}
        jobId={job.id}
        jobLabel={`${job.JobTitle?.label ?? ""}${
          job.Company?.label ? ` · ${job.Company.label}` : ""
        }`}
        stage={addStageTarget?.mode === "edit" ? addStageTarget.stage : null}
        stageTypes={stageTypes}
        jobStatuses={jobStatuses}
        onOpenChange={(open) => !open && setAddStageTarget(null)}
        onSaved={() => {
          void reloadStages();
          router.refresh();
        }}
      />
      <LinkInterviewersDialog
        open={linkInterviewersOpen}
        stage={selectedStage ?? currentStage}
        onOpenChange={setLinkInterviewersOpen}
        onLinked={() => {
          void reloadStages();
          router.refresh();
        }}
      />
      <AddPrepQuestionsDialog
        open={prepQuestionsOpen}
        stage={selectedStage ?? currentStage}
        onOpenChange={setPrepQuestionsOpen}
        onAdded={() => void reloadStages()}
      />
      <DeleteAlertDialog
        pageTitle="job"
        open={deleteAlertOpen}
        onOpenChange={setDeleteAlertOpen}
        onDelete={onDeleteJob}
      />
      {/* CLEAR CHAT BEFORE AN AI ACTION CONFIRM */}
      <AlertDialog
        open={showClearChatConfirm}
        onOpenChange={setShowClearChatConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the assistant conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              A job is waiting for your approval in the assistant. Starting this
              clears the conversation, and that job will not be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void startChat(pendingChatMessage)}>
              Clear and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default JobDetails;
