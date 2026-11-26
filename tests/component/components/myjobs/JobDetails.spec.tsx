import React from "react";
import JobDetails from "@/components/myjobs/JobDetails";
import { JobResponse, Tag } from "@/models/job.model";
import { render, screen, act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The active tab lives in the URL, so a click only calls router.replace —
// what the user sees next comes from the re-render with the new params.
const router = {
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};
let searchParams = new URLSearchParams();
const onTab = (tab: string) => {
  searchParams = new URLSearchParams(`tab=${tab}`);
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
  usePathname: () => "/dashboard/myjobs/job-1",
}));

const chat = {
  open: vi.fn(),
  clear: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn(),
  approvalPending: false,
};

vi.mock("@/components/agent/AgentChatProvider", () => ({
  useAgentChat: () => chat,
}));

vi.mock("@/components/myjobs/NotesSection", () => ({
  NotesSection: () => <div data-testid="notes-section" />,
}));

vi.mock("@/components/TipTapContentViewer", () => ({
  TipTapContentViewer: () => null,
}));

vi.mock("@/components/automations/MatchDetails", () => ({
  MatchDetails: () => <div data-testid="match-details" />,
}));

vi.mock("@/components/profile/DownloadFileButton", () => ({
  DownloadFileButton: () => null,
}));

vi.mock("@/actions/contact.actions", () => ({
  getAllContacts: vi.fn().mockResolvedValue([]),
  getJobContacts: vi.fn().mockResolvedValue([]),
  addJobContact: vi.fn(),
  removeJobContact: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
}));

vi.mock("@/actions/contactRole.actions", () => ({
  getAllContactRoles: vi.fn().mockResolvedValue([]),
  createContactRole: vi.fn(),
}));

vi.mock("@/components/CircularScore", () => ({
  CircularScore: ({ score }: { score: number }) => (
    <div data-testid="circular-score">{score}%</div>
  ),
}));

vi.mock("@/actions/jobStage.actions", () => ({
  getJobStages: vi.fn().mockResolvedValue([]),
  setPrepQuestionAsked: vi.fn(),
  removeStagePrepQuestion: vi.fn(),
  unlinkStageInterviewer: vi.fn(),
  setStageNotes: vi.fn(),
  addJobStage: vi.fn(),
  updateJobStage: vi.fn(),
}));

const makeStage = (id: string, label: string, over: any = {}) => ({
  id,
  jobId: "job-1",
  stageTypeId: `t-${id}`,
  occurredAt: new Date(2026, 8, 3),
  isCurrent: false,
  outcome: null,
  notes: null,
  durationMins: null,
  format: null,
  location: null,
  createdAt: new Date(2026, 8, 1),
  updatedAt: new Date(2026, 8, 1),
  StageType: {
    id: `t-${id}`,
    label,
    value: label.toLowerCase(),
    statusId: "s1",
    sortOrder: 0,
    Status: { id: "s1", label, value: "applied" },
  },
  interviewers: [],
  prepQuestions: [],
  ...over,
});

const stageA = makeStage("stage-a", "Applied", {
  occurredAt: new Date(2026, 8, 1),
});
const stageB = makeStage("stage-b", "Interview", { isCurrent: true });

const baseProps = {
  jobStatuses: [],
  companies: [],
  titles: [],
  locations: [],
  sources: [],
  tags: [],
  stageTypes: [],
};

const makeJob = (overrides: Partial<JobResponse> = {}): JobResponse => ({
  id: "job-1",
  userId: "user-1",
  JobTitle: {
    id: "t1",
    label: "Frontend Developer",
    value: "frontend developer",
    createdBy: "user-1",
  },
  Company: {
    id: "c1",
    label: "Acme Corp",
    value: "acme corp",
    createdBy: "user-1",
  },
  Status: { id: "s1", label: "Applied", value: "applied" },
  Location: { id: "l1", label: "Remote", value: "remote", createdBy: "user-1" },
  JobSource: {
    id: "src1",
    label: "LinkedIn",
    value: "linkedin",
    createdBy: "user-1",
  },
  jobType: "FT",
  createdAt: new Date("2025-01-01"),
  appliedDate: new Date("2025-01-15"),
  dueDate: new Date("2099-12-31"), // far future — not expired
  salaryRange: "100,000 - 110,000",
  description: "<p>Job description</p>",
  jobUrl: "",
  applied: true,
  tags: [],
  ...overrides,
});

describe("JobDetails – skill badges", () => {
  it("renders skill badges for all tags on the job", () => {
    const tags: Tag[] = [
      { id: "tag-1", label: "React", value: "react", createdBy: "user-1" },
      {
        id: "tag-2",
        label: "TypeScript",
        value: "typescript",
        createdBy: "user-1",
      },
      { id: "tag-3", label: "Node.js", value: "node.js", createdBy: "user-1" },
    ];
    render(<JobDetails {...baseProps} job={makeJob({ tags })} />);

    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();
  });

  it("renders no tag badges when the job has no tags", () => {
    render(<JobDetails {...baseProps} job={makeJob({ tags: [] })} />);

    // Verify tag area is simply absent; badges for these labels shouldn't exist
    expect(screen.queryByText("React")).not.toBeInTheDocument();
    expect(screen.queryByText("TypeScript")).not.toBeInTheDocument();
  });

  it("renders no tag badges when tags property is undefined", () => {
    const job = makeJob();
    delete job.tags;
    render(<JobDetails {...baseProps} job={job} />);

    // Should render without crashing and show no skill badges
    expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
  });

  it("renders a single skill badge correctly", () => {
    const tags: Tag[] = [
      { id: "tag-1", label: "GraphQL", value: "graphql", createdBy: "user-1" },
    ];
    render(<JobDetails {...baseProps} job={makeJob({ tags })} />);

    expect(screen.getByText("GraphQL")).toBeInTheDocument();
  });

  it("renders each tag label exactly once", () => {
    const tags: Tag[] = [
      { id: "tag-1", label: "React", value: "react", createdBy: "user-1" },
      { id: "tag-2", label: "Vue", value: "vue", createdBy: "user-1" },
    ];
    render(<JobDetails {...baseProps} job={makeJob({ tags })} />);

    // getAllByText returns an array; each label should appear exactly once in the badge area
    expect(screen.getAllByText("React")).toHaveLength(1);
    expect(screen.getAllByText("Vue")).toHaveLength(1);
  });
});

describe("JobDetails – salary range", () => {
  it("renders the salary range in the summary card", () => {
    render(<JobDetails {...baseProps} job={makeJob()} />);

    expect(screen.getByText(/100,000 - 110,000/)).toBeInTheDocument();
  });

  it("renders a free-text salary verbatim", () => {
    render(
      <JobDetails {...baseProps} job={makeJob({ salaryRange: "$190k – $220k" })} />
    );

    expect(screen.getByText(/\$190k – \$220k/)).toBeInTheDocument();
  });

  it("renders no salary segment when the job has none", () => {
    const { container } = render(
      <JobDetails {...baseProps} job={makeJob({ salaryRange: null })} />
    );

    expect(container.textContent).not.toContain("100,000 - 110,000");
    expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
  });
});

describe("JobDetails – linked resume", () => {
  it("links to a built resume that has no uploaded file", () => {
    render(
      <JobDetails
        {...baseProps}
        job={makeJob({
          resumeId: "resume-1",
          Resume: { id: "resume-1", title: "Senior Engineer Resume" },
        })}
      />
    );

    expect(
      screen.getByRole("link", { name: /Senior Engineer Resume/ })
    ).toHaveAttribute("href", "/dashboard/profile/resume/resume-1");
  });
});

describe("JobDetails – fit and match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chat.clear.mockResolvedValue(undefined);
    searchParams = new URLSearchParams();
  });

  // The page opens on the decision: the verdict, the match and the full
  // analysis one click away.
  it("shows the match score and keeps the full analysis on the page", () => {
    const matchData = JSON.stringify({ matchScore: 85, recommendation: "good match", body: "## Summary\nGood match" });
    render(<JobDetails {...baseProps} job={makeJob({ matchScore: 85, matchData })} />);

    expect(screen.getByText("Match").parentElement).toHaveTextContent("Match 85");
    expect(screen.getByText("Full fit analysis")).toBeInTheDocument();
    expect(screen.getByTestId("match-details")).toBeInTheDocument();
  });

  it("offers to analyse the fit when the job has no analysis", () => {
    render(<JobDetails {...baseProps} job={makeJob()} />);

    expect(screen.getByRole("button", { name: /analyse the fit/i })).toBeInTheDocument();
    expect(screen.queryByTestId("match-details")).not.toBeInTheDocument();
  });

  // Automation saves outside the LLM top-K hold only a keyword pre-rank.
  it("treats an un-analyzed automation job as not analysed", () => {
    render(
      <JobDetails
        {...baseProps}
        job={makeJob({ matchScore: 28, matchData: JSON.stringify({ prerankScore: 0.29, analyzed: false }) })}
      />,
    );

    expect(screen.getByRole("button", { name: /analyse the fit/i })).toBeInTheDocument();
    expect(screen.queryByTestId("match-details")).not.toBeInTheDocument();
  });
});

describe("JobDetails – status from the current stage", () => {
  const statusBadge = () =>
    within(screen.getByText("Status").parentElement!).getAllByText(
      /Applied|Interview/,
    )[0];

  it("shows the current stage's status, not the one on the job prop", () => {
    render(
      <JobDetails
        {...baseProps}
        job={makeJob({ stages: [stageA, stageB] })}
      />,
    );

    expect(statusBadge()).toHaveTextContent("Interview");
  });

  it("keeps the job's own status when the job has no stages", () => {
    render(<JobDetails {...baseProps} job={makeJob({ stages: [] })} />);

    expect(statusBadge()).toHaveTextContent("Applied");
  });
});

describe("JobDetails – one page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chat.approvalPending = false;
    searchParams = new URLSearchParams();
  });

  // No tabs: the decision and fit, the CV, people, notes and the posting all
  // sit on one page.
  it("shows every section on the page, without tabs", () => {
    render(<JobDetails {...baseProps} job={makeJob()} />);

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("Why apply")).toBeInTheDocument();
    expect(screen.getByText("Why not")).toBeInTheDocument();
    expect(screen.getByText("Your CV for this job")).toBeInTheDocument();
    expect(screen.getByText("The posting")).toBeInTheDocument();
    expect(screen.getByTestId("notes-section")).toBeInTheDocument();
  });

  it("shows the timeline with its stage count", () => {
    render(<JobDetails {...baseProps} job={makeJob({ stages: [stageA, stageB] })} />);

    expect(screen.getByText("Timeline").parentElement).toHaveTextContent("Timeline (2)");
  });

  it("shows an empty timeline for a job with no stages, keeping its status visible", () => {
    render(<JobDetails {...baseProps} job={makeJob({ stages: [] })} />);

    expect(screen.getByText(/No stages recorded/i)).toBeInTheDocument();
    expect(screen.getByTestId("timeline-add-stage-btn")).toBeInTheDocument();
  });

  // Escape first: an open Radix menu is modal, so the second trigger would
  // sit under a pointer-events:none layer.
  it("keeps only one status control, in the Update Status menu", async () => {
    render(<JobDetails {...baseProps} job={makeJob()} />);

    await userEvent.click(screen.getByTestId("job-details-actions-menu-btn"));
    expect(screen.queryByRole("menuitem", { name: /Change status/ })).toBeNull();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByTestId("update-status-menu-btn"));
    expect(screen.getByRole("menuitem", { name: /Change status/ })).toBeInTheDocument();
  });

  it("shows the cover letter empty state when the job has no letter", () => {
    render(<JobDetails {...baseProps} job={makeJob()} />);

    expect(screen.getByText(/no cover letter yet/i)).toBeInTheDocument();
  });

  it("renders the linked letter in the cover letter section", () => {
    render(
      <JobDetails
        {...baseProps}
        job={makeJob({
          coverLetterId: "cl-1",
          CoverLetter: { id: "cl-1", title: "Frontend Developer – Acme Corp", content: "<p>Dear Hiring Team,</p>" },
        })}
      />,
    );

    expect(screen.getByText("Frontend Developer – Acme Corp", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/no cover letter yet/i)).not.toBeInTheDocument();
  });
});

describe("JobDetails – AI Match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chat.clear.mockResolvedValue(undefined);
    searchParams = new URLSearchParams();
  });

  it("opens the chat and asks for a match when Analyse the fit is clicked", async () => {
    chat.approvalPending = false;
    render(<JobDetails job={makeJob()} {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /analyse the fit/i }));
    await act(async () => {});
    expect(chat.open).toHaveBeenCalled();
    expect(chat.clear).toHaveBeenCalled();
    const sent = chat.sendMessage.mock.calls[0][0];
    expect(sent.parts[0].text).toMatch(/match/i);
  });

  // The panel opens first so a failed clear cannot leave the button dead, and
  // the match still goes out.
  it("still asks for the match when clearing the conversation fails", async () => {
    chat.approvalPending = false;
    chat.clear.mockRejectedValueOnce(new Error("offline"));
    render(<JobDetails job={makeJob()} {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /analyse the fit/i }));
    await act(async () => {});
    expect(chat.open).toHaveBeenCalled();
    expect(chat.sendMessage).toHaveBeenCalled();
  });

  it("asks before clearing a conversation with a pending approval", async () => {
    chat.approvalPending = true;
    render(<JobDetails job={makeJob()} {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /analyse the fit/i }));
    expect(
      screen.getByText(/clear the assistant conversation/i),
    ).toBeInTheDocument();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });
});

// The cover letter lives in the header's ⋮ menu.
const openMenu = () => userEvent.click(screen.getByTestId("job-details-actions-menu-btn"));

describe("JobDetails cover letter action", () => {
  beforeEach(() => {
    chat.approvalPending = false;
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  it("stays enabled when no resume is linked", async () => {
    render(<JobDetails {...baseProps} job={makeJob({ resumeId: undefined })} />);
    await openMenu();
    expect(screen.getByTestId("generate-cover-letter-btn")).not.toHaveAttribute("aria-disabled");
  });

  it("disables the action for a title-only description", async () => {
    render(
      <JobDetails
        {...baseProps}
        job={makeJob({
          resumeId: "resume-1",
          descriptionCompleteness: "title-only",
        })}
      />,
    );
    await openMenu();
    expect(screen.getByTestId("generate-cover-letter-btn")).toHaveAttribute("aria-disabled", "true");
  });

  it("enables the action for a real description", async () => {
    render(
      <JobDetails {...baseProps} job={makeJob({ resumeId: "resume-1" })} />,
    );
    await openMenu();
    expect(screen.getByTestId("generate-cover-letter-btn")).not.toHaveAttribute("aria-disabled");
  });

  it("opens the chat and asks for a letter naming the job", async () => {
    render(
      <JobDetails {...baseProps} job={makeJob({ resumeId: "resume-1" })} />,
    );
    await openMenu();
    await userEvent.click(screen.getByTestId("generate-cover-letter-btn"));
    expect(chat.open).toHaveBeenCalled();
    await waitFor(() => expect(chat.sendMessage).toHaveBeenCalled());
    const sent = chat.sendMessage.mock.calls[0][0];
    expect(sent.parts[0].text).toMatch(/cover letter/i);
    expect(sent.parts[0].text).toContain("Frontend Developer");
    expect(sent.parts[0].text).toContain("Acme Corp");
  });

  it("asks before clearing a conversation with a pending approval", async () => {
    chat.approvalPending = true;
    render(
      <JobDetails {...baseProps} job={makeJob({ resumeId: "resume-1" })} />,
    );
    await openMenu();
    await userEvent.click(screen.getByTestId("generate-cover-letter-btn"));
    expect(
      screen.getByText(/clear the assistant conversation/i),
    ).toBeInTheDocument();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  // Derived from the server prop, not local state: the chat saves the letter
  // server-side and fires router.refresh().
  it("labels the action Regenerate when a letter is already linked", async () => {
    render(
      <JobDetails
        {...baseProps}
        job={makeJob({ resumeId: "resume-1", coverLetterId: "cl-1" })}
      />,
    );
    await openMenu();
    expect(screen.getByTestId("generate-cover-letter-btn")).toHaveTextContent(
      /regenerate/i,
    );
  });
});

describe("JobDetails – auto-match from the jobs list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chat.approvalPending = false;
    chat.clear.mockResolvedValue(undefined);
    searchParams = new URLSearchParams();
  });

  it("runs the match and drops the flag when arriving with ?match=1", async () => {
    searchParams = new URLSearchParams("tab=match&match=1");
    render(<JobDetails {...baseProps} job={makeJob()} />);
    await act(async () => {});

    expect(chat.open).toHaveBeenCalled();
    const sent = chat.sendMessage.mock.calls[0][0];
    expect(sent.parts[0].text).toMatch(/match/i);
    expect(router.replace).toHaveBeenCalledWith("?tab=match", { scroll: false });
  });

  it("runs no match when the flag is absent", async () => {
    searchParams = new URLSearchParams("tab=match");
    render(<JobDetails {...baseProps} job={makeJob()} />);
    await act(async () => {});

    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  // The chat refreshes the route once the match is saved; a second run would
  // burn another LLM call and overwrite the result.
  it("runs the match only once across re-renders", async () => {
    searchParams = new URLSearchParams("tab=match&match=1");
    const { rerender } = render(<JobDetails {...baseProps} job={makeJob()} />);
    await act(async () => {});
    rerender(<JobDetails {...baseProps} job={makeJob({ matchScore: 80 })} />);
    await act(async () => {});

    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("asks before clearing a conversation with a pending approval", async () => {
    chat.approvalPending = true;
    searchParams = new URLSearchParams("tab=match&match=1");
    render(<JobDetails {...baseProps} job={makeJob()} />);
    await act(async () => {});

    expect(
      screen.getByText(/clear the assistant conversation/i),
    ).toBeInTheDocument();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });
});

describe("JobDetails – company link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chat.approvalPending = false;
    searchParams = new URLSearchParams();
  });

  it("links the company in the header to its details page", () => {
    render(<JobDetails {...baseProps} job={makeJob()} />);

    expect(screen.getByRole("link", { name: "Acme Corp" })).toHaveAttribute(
      "href",
      "/dashboard/admin/companies/c1",
    );
  });

  it("leads the header with the company, then the title, then where and how", () => {
    render(<JobDetails {...baseProps} job={makeJob()} />);

    const heading = screen.getByRole("link", { name: "Acme Corp" }).closest("h1")!;
    expect(heading).toHaveTextContent("Acme Corp · Frontend Developer");
    expect(heading.nextElementSibling).toHaveTextContent("Remote · Full-time");
  });
});
