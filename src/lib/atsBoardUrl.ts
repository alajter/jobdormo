import { APP_CONSTANTS } from "@/lib/constants";
import type { JobBoard, LeverHost } from "@/models/automation.model";
import { VC_BOARDS } from "@/lib/scraper/vcboards/boards";
import { REMOTE_BOARDS } from "@/lib/scraper/remoteboards/boards";

// Public job-board URL for a company. Lever's public posting host
// (jobs.lever.co / jobs.eu.lever.co) is region-specific and differs from its
// API host, so it's resolved from the company's persisted `host`.
export function companyBoardUrl(
  jobBoard: JobBoard,
  company: { token: string; host?: LeverHost },
): string {
  if (jobBoard === "lever") {
    const base =
      company.host === "eu"
        ? APP_CONSTANTS.LEVER_EU_JOB_URL
        : APP_CONSTANTS.LEVER_JOB_URL;
    return `${base}/${company.token}`;
  }
  if (jobBoard === "vcboards") {
    const board = VC_BOARDS[company.token];
    if (!board) return "";
    return board.kind === "team8" ? `${board.baseUrl}/career/` : `${board.baseUrl}/jobs`;
  }
  if (jobBoard === "remoteboards") {
    return REMOTE_BOARDS[company.token]?.pageUrl ?? "";
  }
  if (jobBoard === "comeet") {
    const [slug, uid] = company.token.split("/");
    return slug && uid
      ? `${APP_CONSTANTS.COMEET_JOB_URL}/${encodeURIComponent(slug)}/${encodeURIComponent(uid)}`
      : "";
  }
  if (jobBoard === "teamtailor") {
    return `https://${company.token}.${APP_CONSTANTS.TEAMTAILOR_HOST_SUFFIX}/jobs`;
  }
  if (jobBoard === "workable") {
    return `${APP_CONSTANTS.WORKABLE_JOB_URL}/${company.token}`;
  }
  if (jobBoard === "ashby") {
    return `${APP_CONSTANTS.ASHBY_JOB_URL}/${company.token}`;
  }
  return `${APP_CONSTANTS.GREENHOUSE_BOARD_URL}/${company.token}`;
}
