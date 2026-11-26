/**
 * Cover Letter User Prompts
 */

export function buildCoverLetterPrompt(
  resumeText: string,
  jobText: string,
  guidance: string | null,
  extras: { candidateNotes?: string; instructions?: string } = {},
): string {
  const notesBlock = extras.candidateNotes?.trim()
    ? `\n\n<candidate-notes>\n${extras.candidateNotes.trim()}\n</candidate-notes>`
    : "";
  const instructionsBlock = extras.instructions?.trim()
    ? `\n\nUSER INSTRUCTIONS FOR THIS LETTER:\n${extras.instructions.trim()}`
    : "";
  const guidanceBlock = guidance
    ? `\n\nPRIOR MATCH ANALYSIS (emphasise these keywords and act on these tips):\n${guidance}`
    : "";

  return `Write a cover letter for this candidate applying to this job.

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobText}${guidanceBlock}${notesBlock}${instructionsBlock}

Output only the letter, starting with the salutation.`;
}
