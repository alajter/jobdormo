// Server-side allowlist of remote-job boards. A saved automation stores only
// the token; the URL comes from here, so a config can never point the fetcher
// at an arbitrary host. Keep in sync with companies.json (the wizard's picker
// seed); a unit test checks they agree.
export type RemoteBoardKind = "remotive" | "himalayas" | "wwr";

export interface RemoteBoard {
  token: string;
  name: string;
  kind: RemoteBoardKind;
  feedUrl: string; // API endpoint or RSS feed
  pageUrl: string; // human-facing board page
}

const wwr = (token: string, name: string, slug: string): RemoteBoard => ({
  token,
  name: `We Work Remotely: ${name}`,
  kind: "wwr",
  feedUrl: `https://weworkremotely.com/categories/${slug}.rss`,
  pageUrl: `https://weworkremotely.com/categories/${slug}`,
});

export const REMOTE_BOARDS: Record<string, RemoteBoard> = {
  remotive: {
    token: "remotive",
    name: "Remotive (latest remote jobs)",
    kind: "remotive",
    feedUrl: "https://remotive.com/api/remote-jobs",
    pageUrl: "https://remotive.com/remote-jobs",
  },
  himalayas: {
    token: "himalayas",
    name: "Himalayas (remote jobs open to Israel)",
    kind: "himalayas",
    feedUrl: "https://himalayas.app/jobs/api/search",
    pageUrl: "https://himalayas.app/jobs",
  },
  "wwr-product": wwr("wwr-product", "Product", "remote-product-jobs"),
  "wwr-full-stack": wwr("wwr-full-stack", "Full-Stack Programming", "remote-full-stack-programming-jobs"),
  "wwr-back-end": wwr("wwr-back-end", "Back-End Programming", "remote-back-end-programming-jobs"),
  "wwr-front-end": wwr("wwr-front-end", "Front-End Programming", "remote-front-end-programming-jobs"),
  "wwr-devops": wwr("wwr-devops", "DevOps and Sysadmin", "remote-devops-sysadmin-jobs"),
  "wwr-design": wwr("wwr-design", "Design", "remote-design-jobs"),
  "wwr-sales-marketing": wwr("wwr-sales-marketing", "Sales and Marketing", "remote-sales-and-marketing-jobs"),
  "wwr-management-finance": wwr("wwr-management-finance", "Management and Finance", "remote-management-and-finance-jobs"),
  "wwr-customer-support": wwr("wwr-customer-support", "Customer Support", "remote-customer-support-jobs"),
  "wwr-other": wwr("wwr-other", "All Other", "all-other-remote-jobs"),
};

export const REMOTE_BOARD_TOKENS = Object.keys(REMOTE_BOARDS) as [string, ...string[]];

// Himalayas search is narrowed to roles whose location restrictions include
// this country (worldwide roles included).
export const HIMALAYAS_COUNTRY = "Israel";

// A remote role is kept only when its stated region is open to someone living
// in Israel with EU citizenship: worldwide, EMEA, Europe/EU, Israel or the
// Middle East. An empty or bare "Remote" region counts as unrestricted.
// US-, UK-, LATAM-, APAC- or single-other-country-only roles are dropped here,
// before ranking, and the location string keeps the region so the shared
// remote rule (ats/eligibility.ts) sees it too.
const OPEN_REGION =
  /\b(anywhere|worldwide|world|global(ly)?|international|emea|europe|european|eu|israel|middle east)\b/i;

export function isRegionOpenToUser(region: string): boolean {
  const r = region.trim();
  if (!r || /^remote$/i.test(r)) return true;
  return OPEN_REGION.test(r);
}
