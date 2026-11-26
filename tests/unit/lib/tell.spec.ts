import { describe, expect, it } from "vitest";
import { parseTellPlan, tellPrompt, type TellJobRef, type TellPersonRef } from "@/lib/tell";

const jobs: TellJobRef[] = [
  { id: "job-acme", company: "Acme", title: "Senior PM", status: "applied" },
  { id: "job-globex", company: "Globex", title: "Head of Product", status: "applied" },
];
const people: TellPersonRef[] = [{ id: "p-dana", name: "Dana", company: "Initech" }];

describe("parseTellPlan", () => {
  it("maps short references back to the owner's own ids", () => {
    const plan = parseTellPlan(
      '{"summary":"Acme rejected you","changes":[{"kind":"job_status","job":"J1","status":"rejected"}],"question":null}',
      jobs,
      people,
    );
    expect(plan.changes).toEqual([
      { kind: "job_status", jobId: "job-acme", status: "rejected", label: "Acme · Senior PM → Rejected" },
    ]);
    expect(plan.question).toBeNull();
  });

  it("drops references that don't exist and values outside the allowed lists", () => {
    const plan = parseTellPlan(
      JSON.stringify({
        changes: [
          { kind: "job_status", job: "J9", status: "rejected" },
          { kind: "job_status", job: "J1", status: "hired" },
          { kind: "job_status", job: "job-globex", status: "interview" },
          { kind: "person_log", person: "P1", activity: "sent", text: "the blurb" },
          { kind: "person_follow_up", person: "P1", date: "next week" },
        ],
      }),
      jobs,
      people,
    );
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({ kind: "person_log", personId: "p-dana", activity: "sent" });
  });

  it("turns follow-up reminders off for a job", () => {
    const plan = parseTellPlan('{"changes":[{"kind":"job_no_follow_up","job":"J2"}]}', jobs, people);
    expect(plan.changes).toEqual([{ kind: "job_no_follow_up", jobId: "job-globex", label: "Globex · Head of Product: no more follow-up reminders" }]);
  });

  it("reads JSON wrapped in prose or code fences", () => {
    const plan = parseTellPlan('Sure:\n```json\n{"summary":"x","changes":[{"kind":"job_note","job":"J2","text":"Call Tue 10:00"}]}\n```', jobs, people);
    expect(plan.changes[0]).toMatchObject({ kind: "job_note", jobId: "job-globex", text: "Call Tue 10:00" });
  });

  it("accepts an added job only with company and title, and only http links", () => {
    const plan = parseTellPlan(
      '{"changes":[{"kind":"add_job","company":"Acme","title":"PM","url":"javascript:alert(1)"},{"kind":"add_job","company":"","title":"PM"}]}',
      jobs,
      people,
    );
    expect(plan.changes).toEqual([{ kind: "add_job", company: "Acme", title: "PM", label: "Add job: Acme · PM" }]);
  });

  it("asks again when the answer isn't JSON", () => {
    expect(parseTellPlan("no idea", jobs, people).question).toMatch(/another way/);
  });
});

describe("tellPrompt", () => {
  it("lists jobs and people by short reference", () => {
    const p = tellPrompt("Acme rejected me", jobs, people);
    expect(p).toContain("J1: Acme · Senior PM (applied)");
    expect(p).toContain("P1: Dana (Initech)");
    expect(p).not.toContain("job-acme");
  });
});
