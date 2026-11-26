// Server-side allowlist of VC / venture job boards. A saved automation stores
// only the token; the URL comes from here, so a config can never point the
// fetcher at an arbitrary host. Keep in sync with companies.json (the wizard's
// picker seed); a unit test checks they agree.
export type VcBoardKind = "team8" | "getro";

export interface VcBoard {
  token: string;
  name: string;
  kind: VcBoardKind;
  baseUrl: string;
}

export const VC_BOARDS: Record<string, VcBoard> = {
  team8: { token: "team8", name: "Team8 (stealth & portfolio)", kind: "team8", baseUrl: "https://team8.vc" },
  "tlv-partners": { token: "tlv-partners", name: "TLV Partners portfolio", kind: "getro", baseUrl: "https://jobs.tlv.partners" },
  grove: { token: "grove", name: "Grove Ventures portfolio", kind: "getro", baseUrl: "https://careers.grovevc.com" },
  hetz: { token: "hetz", name: "Hetz Ventures portfolio", kind: "getro", baseUrl: "https://careers.hetz.vc" },
  "vertex-israel": { token: "vertex-israel", name: "Vertex Israel portfolio", kind: "getro", baseUrl: "https://jobs.vertexventures.co.il" },
  "israel-vc-forum": { token: "israel-vc-forum", name: "Israel VC Forum (800+ Israeli VC-backed companies)", kind: "getro", baseUrl: "https://israelvcforum.getro.com" },
  "ten-eleven": { token: "ten-eleven", name: "Ten Eleven Ventures portfolio (cyber)", kind: "getro", baseUrl: "https://jobs.1011vc.com" },
  ballistic: { token: "ballistic", name: "Ballistic Ventures portfolio (cyber)", kind: "getro", baseUrl: "https://careers.ballisticventures.com" },
  greenfield: { token: "greenfield", name: "Greenfield Partners portfolio", kind: "getro", baseUrl: "https://careers.greenfield-growth.com" },
  blumberg: { token: "blumberg", name: "Blumberg Capital portfolio", kind: "getro", baseUrl: "https://careers.blumbergcapital.com" },
  insight: { token: "insight", name: "Insight Partners portfolio", kind: "getro", baseUrl: "https://jobs.insightpartners.com" },
  sapphire: { token: "sapphire", name: "Sapphire Ventures portfolio", kind: "getro", baseUrl: "https://jobs.sapphireventures.com" },
  "square-peg": { token: "square-peg", name: "Square Peg portfolio", kind: "getro", baseUrl: "https://squarepeg.getro.com" },
  essence: { token: "essence", name: "Essence VC portfolio", kind: "getro", baseUrl: "https://careers.essencevc.fund" },
};

// Getro boards are searched with this location filter (Getro's own
// "searchable_locations"), so Israeli roles aren't crowded out of the first
// page by global ones. Remote roles open to Israel carry the Israel location.
export const GETRO_LOCATION_FILTER = ["Israel"];

export const VC_BOARD_TOKENS = Object.keys(VC_BOARDS) as [string, ...string[]];

// Big, late-stage companies the user doesn't want, matched on the company
// name's start (case-insensitive). Overridable per automation via
// sourceConfig.vcboards.excludeCompanies.
export const DEFAULT_EXCLUDED_COMPANIES = [
  "Wiz",
  "Cato Networks",
  "Axonius",
  "Orca Security",
  "Island",
  "Torq",
  "Transmit Security",
  "Snyk",
  "Check Point",
  "CyberArk",
  "SentinelOne",
  "Armis",
  "Claroty",
  "Cyera",
  "Fiverr",
  "Wix",
  "monday",
  "Payoneer",
  "Checkmarx",
  "Cognyte",
  "Global-e",
  "Kaltura",
  "Nayax",
  "Plus500",
  "Rapyd",
  "VAST Data",
  "Nuvei",
  "NICE",
  "Amdocs",
  "Taboola",
  "Outbrain",
  "JFrog",
  "Varonis",
  "Imperva",
  "Cellebrite",
  "eToro",
  "Lemonade",
  "Riskified",
  "Similarweb",
  "Playtika",
  "Gong",
  "AppsFlyer",
  "Tipalti",
  "Papaya Global",
  "Melio",
  "Elementor",
  "HiBob",
  "Pagaya",
  "Forter",
  "Fireblocks",
  "Mobileye",
  "Microsoft",
  "Google",
  "Meta",
  "Amazon",
  "Apple",
  "Nvidia",
  "Intel",
  "Palo Alto Networks",
  "Zscaler",
  "CrowdStrike",
  "Akamai",
  "Salesforce",
  "Oracle",
  "IBM",
  "Cisco",
  "SAP",
  "Dell",
  "HP",
  "AT&T",
];
