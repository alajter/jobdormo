"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { toastError, toastSuccess } from "@/lib/toast";
import { getUserSettings, updateCandidateNotes } from "@/actions/userSettings.actions";
import { CANDIDATE_FACTS_MAX_CHARS, CANDIDATE_NOTES_MAX_CHARS } from "@/models/userSettings.model";
import { getCareerKnowledge, updateCandidateFacts } from "@/actions/careerKnowledge.actions";

function CandidateNotesSettings() {
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [facts, setFacts] = useState("");
  const [sources, setSources] = useState<{ cvs: string[]; linkedin: string | null; tailored: string[] } | null>(null);
  const [savingFacts, setSavingFacts] = useState(false);

  useEffect(() => {
    getCareerKnowledge()
      .then((k) => {
        setFacts(k.facts);
        setSources(k.sources);
      })
      .catch(() => setSources({ cvs: [], linkedin: null, tailored: [] }));
  }, []);

  const saveFacts = async () => {
    setSavingFacts(true);
    try {
      const res = await updateCandidateFacts(facts);
      if (res.success) toastSuccess("Your facts were saved.", "Saved!");
      else toastError(res.message || "Failed to save your facts.");
    } finally {
      setSavingFacts(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const result = await getUserSettings();
        setNotes(result?.data?.settings?.candidate?.notes ?? "");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setIsSaving(true);
    try {
      const result = await updateCandidateNotes(notes);
      if (result?.success) toastSuccess("Your notes were saved.", "Saved!");
      else toastError(result?.message || "Failed to save your notes.");
    } catch {
      toastError("Failed to save your notes.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Career knowledge</h3>
        <p className="text-sm text-muted-foreground">
          Facts the AI should know about you, and rules it must follow when it
          reviews your CV and letters. For example: what&apos;s true about a
          past role, titles you don&apos;t want used, or things never to claim.
        </p>
      </div>
      <div>
        <Label className="my-2 block" htmlFor="candidate-notes">
          Your notes and rules
        </Label>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Textarea
              id="candidate-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={CANDIDATE_NOTES_MAX_CHARS}
              rows={14}
              placeholder={"- I didn't sell to customers at my two startups; never claim sales.\n- Don't use \"2x founder\" or \"CPO\"; use \"Co-Founder, Product\".\n- In cover letters, don't name companies; the CV carries them."}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {notes.length}/{CANDIDATE_NOTES_MAX_CHARS}
            </p>
          </>
        )}
      </div>
      <Button onClick={save} disabled={isLoading || isSaving}>
        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save
      </Button>

      <div className="border-t pt-4">
        <Label className="mb-1 block" htmlFor="candidate-facts">
          Facts from your answers
        </Label>
        <p className="mb-2 text-xs text-muted-foreground">
          What you told the AI in Improve my CV and Tailor CV (results, projects, keywords you have). Every CV, letter,
          match and message uses them. Fix or delete anything that&apos;s wrong.
        </p>
        <Textarea
          id="candidate-facts"
          value={facts}
          onChange={(e) => setFacts(e.target.value)}
          maxLength={CANDIDATE_FACTS_MAX_CHARS}
          rows={12}
          placeholder="Nothing yet. Answers you give while improving or tailoring your CV appear here."
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {facts.length}/{CANDIDATE_FACTS_MAX_CHARS}
        </p>
        <Button className="mt-2" onClick={saveFacts} disabled={sources === null || savingFacts}>
          {savingFacts && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save facts
        </Button>
      </div>

      <div className="border-t pt-4 text-sm">
        <div className="mb-1 font-medium">Also read as facts about you</div>
        <p className="mb-2 text-xs text-muted-foreground">
          Files in your CV folder and your LinkedIn text. Edit them there; the AI reads them each time.
        </p>
        {sources === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {sources.cvs.map((c) => (
              <li key={c}>CV: {c}</li>
            ))}
            {sources.linkedin && <li>LinkedIn profile: {sources.linkedin}</li>}
            {sources.cvs.length === 0 && !sources.linkedin && <li>No CV folder found (set CV_DIR).</li>}
          </ul>
        )}
        {sources && sources.tailored.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Not used as a source: the {sources.tailored.length} AI-tailored job CVs, so their wording never carries from one job to the next.
          </p>
        )}
      </div>
    </div>
  );
}

export default CandidateNotesSettings;
