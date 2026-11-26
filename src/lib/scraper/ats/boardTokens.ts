import { ATS_TOKEN_REGEX } from "../utils";
import { COMEET_TOKEN_REGEX } from "../comeet/token";

// Pure token extraction for the Comeet / Teamtailor / Workable resolvers in
// atsCompany.actions.ts. No network here; the actions validate the result.

export function extractComeetToken(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(
    /comeet\.(?:com|co)\/jobs\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/([0-9A-Za-z]{2}\.[0-9A-Za-z]{3})/i,
  );
  const token = urlMatch ? `${urlMatch[1]}/${urlMatch[2].toUpperCase()}` : trimmed;
  return COMEET_TOKEN_REGEX.test(token) ? token : null;
}

export function extractTeamtailorToken(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  let token: string | undefined;
  const hostMatch = trimmed.match(/^(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})(?:[/:?#]|$)/);
  if (hostMatch) {
    const labels = hostMatch[1].split(".");
    const tt = labels.indexOf("teamtailor");
    if (tt > 0) token = labels[tt - 1];
    else if (labels.length >= 2) token = labels[labels.length - 2];
  } else {
    token = trimmed;
  }
  return token && ATS_TOKEN_REGEX.test(token) ? token : null;
}

export function extractWorkableToken(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const apply = trimmed.match(/apply\.workable\.com\/(?:api\/[^/]+\/(?:widget\/)?accounts\/)?([a-z0-9_-]+)/);
  const sub = trimmed.match(/^(?:https?:\/\/)?([a-z0-9_-]+)\.workable\.com/);
  const token = apply?.[1] ?? (sub && sub[1] !== "apply" && sub[1] !== "www" ? sub[1] : undefined) ??
    (!trimmed.includes("/") && !trimmed.includes(".") ? trimmed : undefined);
  return token && token !== "j" && ATS_TOKEN_REGEX.test(token) ? token : null;
}
