"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { getSearchRules, saveSearchRules } from "@/actions/searchRules.actions";
import { DEFAULT_SEARCH_RULES, type SearchRules } from "@/models/searchRules.model";
import { toastError, toastSuccess } from "@/lib/toast";

type Form = Record<keyof SearchRules, string>;

const toForm = (r: SearchRules): Form => ({
  homeCity: r.homeCity,
  nearbyCities: r.nearbyCities.join(", "),
  maxCompanySize: r.maxCompanySize ? String(r.maxCompanySize) : "",
  seniorOnlyRoles: r.seniorOnlyRoles.join(", "),
  seniorTitles: r.seniorTitles.join(", "),
  atsTarget: String(r.atsTarget),
  minMatch: String(r.minMatch),
  staleDays: String(r.staleDays),
});

function Field({ id, label, hint, children }: { id: string; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// Settings → Search rules: the user's own rules behind Today's focus list,
// the job page's "why not" and the fit check for pasted postings.
function SearchRulesSettings() {
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSearchRules().then((r) => setForm(toForm(r)));
  }, []);

  if (!form) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    const res = await saveSearchRules({
      ...form,
      maxCompanySize: form.maxCompanySize.trim() ? Number(form.maxCompanySize) : 0,
      atsTarget: Number(form.atsTarget),
      minMatch: Number(form.minMatch),
      staleDays: Number(form.staleDays),
    });
    setSaving(false);
    if (!res.success || !res.rules) return toastError(res.message);
    setForm(toForm(res.rules));
    toastSuccess("Search rules saved. Today and the fit check use them from now on.");
  };

  return (
    <div className="grid max-w-2xl gap-8">
      <div className="grid gap-1">
        <h4 className="text-lg font-semibold">Search rules</h4>
        <p className="text-sm text-muted-foreground">
          Your own rules for which jobs are worth your time. Jobdormo uses them on Today (apply, tailor or skip), on every job page
          (why not) and when you paste a job to check the fit. Leave a field empty for no rule.
        </p>
      </div>

      <section className="grid gap-4">
        <h5 className="border-b pb-1.5 text-sm font-semibold">Where you work</h5>
        <Field id="homeCity" label="Home city" hint="Offices outside it count against a job. Remote roles are never flagged.">
          <Input id="homeCity" value={form.homeCity} onChange={set("homeCity")} placeholder="e.g. Tel Aviv, Berlin, Austin" />
        </Field>
        <Field id="nearbyCities" label="Cities close enough to commute to" hint="Comma-separated. These read as 'check the commute', not as a reason to skip.">
          <Input id="nearbyCities" value={form.nearbyCities} onChange={set("nearbyCities")} placeholder="e.g. Ramat Gan, Herzliya" />
        </Field>
      </section>

      <section className="grid gap-4">
        <h5 className="border-b pb-1.5 text-sm font-semibold">Companies and roles</h5>
        <Field id="maxCompanySize" label="Largest company you'd join (employees)" hint="Bigger companies are suggested as skips. Empty: no limit.">
          <Input id="maxCompanySize" inputMode="numeric" value={form.maxCompanySize} onChange={set("maxCompanySize")} placeholder="e.g. 1000" />
        </Field>
        <Field
          id="seniorOnlyRoles"
          label="Roles you only take at a senior level"
          hint="Comma-separated words in a job title. A title with one of these and no senior word below is suggested as a skip."
        >
          <Input id="seniorOnlyRoles" value={form.seniorOnlyRoles} onChange={set("seniorOnlyRoles")} placeholder="e.g. customer success, support" />
        </Field>
        <Field id="seniorTitles" label="What counts as senior" hint="Comma-separated title words.">
          <Input id="seniorTitles" value={form.seniorTitles} onChange={set("seniorTitles")} placeholder={DEFAULT_SEARCH_RULES.seniorTitles.join(", ")} />
        </Field>
      </section>

      <section className="grid gap-4">
        <h5 className="border-b pb-1.5 text-sm font-semibold">Thresholds</h5>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="atsTarget" label="CV ready at (ATS %)" hint="A tailored CV at or above this is ready to send.">
            <Input id="atsTarget" inputMode="numeric" value={form.atsTarget} onChange={set("atsTarget")} />
          </Field>
          <Field id="minMatch" label="Good fit from (match)" hint="Ten points below is a weak fit.">
            <Input id="minMatch" inputMode="numeric" value={form.minMatch} onChange={set("minMatch")} />
          </Field>
          <Field id="staleDays" label="Posting too old after (days)" hint="Older postings are probably filled.">
            <Input id="staleDays" inputMode="numeric" value={form.staleDays} onChange={set("staleDays")} />
          </Field>
        </div>
      </section>

      <div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save search rules
        </Button>
      </div>
    </div>
  );
}

export default SearchRulesSettings;
