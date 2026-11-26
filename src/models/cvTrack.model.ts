// A job-search track with its own CV (see src/lib/cv/tracks.ts).
export type CvTrack = { id: string; label: string; file: string };

export const TRACK_ID_REGEX = /^[a-z0-9-]{1,40}$/;

/**
 * Picks a track for a job from its title and company areas. Order matters:
 * customer success first, then founding/head-of-product roles, then AI, then
 * security; anything else falls back to the first track.
 */
export function guessTrack(
  title: string,
  areas: string[],
  trackIds: string[],
): string | null {
  const t = title.toLowerCase();
  const has = (id: string) => trackIds.includes(id);
  if (has("cs-leader") && /customer success|customer experience|chief customer|post-sales|\bcco\b/.test(t)) return "cs-leader";
  if (has("founding") && /founding|head of product|vp product|vp,? product|chief product|director of product|product group lead/.test(t)) return "founding";
  if (has("ai-pm") && /\bai\b|\bllm|agent|genai|machine learning|\bml\b/.test(t)) return "ai-pm";
  if (has("security-pm") && (/secur|cyber|threat|soc\b/.test(t) || areas.includes("security"))) return "security-pm";
  if (has("ai-pm") && areas.includes("ai")) return "ai-pm";
  return trackIds[0] ?? null;
}
