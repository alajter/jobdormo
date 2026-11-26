# Jobdormo: product design

The product design for Jobdormo: the core idea, the information architecture, the screens and the design system. Decisions that stay open are listed in section 5.

## 1. Core

**Core idea.** Jobdormo works while you sleep and hands you the morning. You act; whenever something happens, you tell it in one line.

**Who and when.** One person, one search. Mornings on a desktop (triage, tailoring, messages, applications), and on the phone in between: see what's new, log what happened, check a CV's ATS match.

**The questions, in the order the mind asks them.**
- Morning: *What needs me today? Which jobs are worth my time, and which do I skip? Is anything waiting on my answer? Am I on track this week?*
- One job: *Does it fit? Is my CV ready to send? Who do I know there? What's the next step?*
- Something happened: *Log it, and tell me what I owe and when.*

**Product attributes** (each is a test a screen must pass):
1. **One next step.** Every row ends in the action it needs (apply, tailor, answer, follow up), not in more data.
2. **Honest numbers.** Every score says what it is (AI match is a judgment; ATS is a strict keyword count) and nothing is shown as more certain than it is.
3. **Talk, don't file.** Anything that happened can be told in plain words; forms are the fallback.
4. **Calm and dense.** A morning's list fits on one screen at desktop and two thumbs of scroll on a phone.

**Emotional goal.** Day 1: "it already did the boring part." Day 300: "I trust it; I only look where it points."

**What it deliberately won't do.** Apply or post on its own; invent experience; show charts for their own sake; send notifications for things that can wait until the morning.

**Differentiation.** Teal, Huntr, Simplify and MyJobAide track applications or rewrite CVs. Jobdormo decides where to focus, keeps every claim true to your history, and works your network first.

## 2. Information architecture

Five places, plus two utilities. One home per fact.

| Place | Its one job | Replaces |
|---|---|---|
| **Today** (`/dashboard`) | What needs me now, and a box to tell Jobdormo what happened | Dashboard, Job search, Tasks |
| **Jobs** (`/dashboard/myjobs`) | Every job, in three views: Review, Pursuing, Closed | Jobs, Interviews |
| **People** (`/dashboard/people`) | Who can help, what was said, what's due | People, job Contacts tab |
| **LinkedIn** (`/dashboard/posts`) | The campaign, the plan and the posts | Posts |
| **My CVs** (`/dashboard/cvs`) | CVs, portfolio, what Jobdormo knows about you | Profile, gaps panel, Settings → Career knowledge |
| Settings | Daily scan, AI, sources (automations), library, data | Automations, Library, AI usage in the nav |
| Ask (chat) | Free-form help on the page you're on | unchanged |

Hidden from the navigation, still reachable by URL: Activities, Questions, Tasks, Interviews, Automations, Library, AI usage, Developer.

**Where each fact lives.** Job status and reach-out: the job. Message history: the person (the job shows the people at its company). CV text: the files in My CVs. Scores: the job (shown everywhere, decided in one place: `src/lib/cv/ats.ts`, `src/lib/cv/review.ts`, the match scripts). Focus rules: `src/lib/focus.ts`.

**Flows.**
1. Morning: Today → *Apply* row → job page with the CV ready → copy CV and portfolio, apply → *Mark applied*.
2. Tailor: Today *Tailor* row or a low ATS score in Jobs → job page, CV tab → answer questions, apply fixes → ready badge.
3. Something happened: Today box ("Acme rejected me") → Jobdormo shows what it will change (status, note, follow-up) → *Apply*.
4. A pasted role (from a job board or a private list): Today box → it adds the job, scores it, and offers to tailor.
5. Network: People → *Message* → copy → *Mark as sent* (follow-up set).

## 3. Screen concepts

### Today: "the morning list"
Concept: a single column of short sections in the order of the questions, each row one action. The tell box sits on top because it's the most frequent action.

```
Desktop (one column, 760px measure)              Phone
┌──────────────────────────────────────────┐     ┌────────────────────┐
│ Tell Jobdormo what happened…        [Go] │     │ Tell Jobdormo… [Go]│
├──────────────────────────────────────────┤     ├────────────────────┤
│ FOCUS TODAY                              │     │ Focus today        │
│ Apply   Daisy · Sr PM Agentic   86% CV › │     │ Apply  Daisy  86% ›│
│ Apply   Noma · PM               80% CV › │     │ Tailor OX     52% ›│
│ Tailor  OX · AppSec PM  match 74  52%  › │     │ Skip   Canonical  ›│
│ Skip    Canonical · big company        › │     ├────────────────────┤
├──────────────────────────────────────────┤     │ Waiting on you  3  │
│ WAITING ON YOU  (CV questions, fixes)    │     │ Follow up  2       │
│ FOLLOW UP  (people and applications due) │     │ This week 4/5      │
├──────────────────────────────────────────┤     └────────────────────┘
│ This week 4/5 conversations · next post  │
└──────────────────────────────────────────┘
```

### Jobs: "three trays"
Concept: Review (new, worth a look), Pursuing (applied, interviewing), Closed. A dense table on desktop, a list of two-line rows on the phone. Columns: job and company (stage · size under it) · match · CV (ATS, ready mark) · people you know · status · posted. Location, area and source move into the row's second line.

### Job page: "one job, one next step"
Header: title, company, status, and three actions: **Tailor CV**, **Message someone**, **Mark applied**. Tabs: **Fit** (match, gaps, company), **CV** (ATS, questions, fact-check, PDF, letter), **People** (who you know there, reach-out), **History** (notes and timeline together), **Posting**.

### My CVs: "your material"
Sections: CVs by type of role (open PDF, improve), CVs per job (ATS and fact-check state), portfolio, and what Jobdormo knows about you (notes, rules, confirmed facts, sources).

## 4. Design system

**Principles.** (1) Ink and paper, one signal. (2) Type is the hierarchy; boxes are rare. (3) A number always says what it measures. (4) Every row is a door.

**Tokens** (in `src/app/globals.css`, light and dark):
- Neutrals: warm paper background, ink text, two muted text roles, hairline borders. No blue-grey slate.
- Primary (buttons, links, focus): ink. Actions don't need colour to be found; they need a verb.
- **Signal** (the one accent): a deep green that means *ready / now*: ready CVs, the morning's "apply" verbs, the week goal when met.
- Status marks, never fills: amber = needs you, red = must fix, muted = closed.
- Type: Inter, 14px base on desktop, 15px on the phone, two weights (400, 600), tabular numbers for scores and dates.
- Spacing on a 4px grid; radius 6px; hairlines instead of shadows; shadows only on popovers and dialogs.
- Motion: colour and opacity only, 120–180ms; no loops.

**Primitives.** Section (label + rows), Row (verb, subject, meta, door), Score (number + what it measures), Mark (status dot + word), Tell box, Tabs, Dialog, Empty state with the one action that fills it.

**States.** Empty Today: "Nothing needs you. The next scan runs at 05:30." Loading: skeleton rows, never spinners on the whole page. Stale scan (no scan today): a quiet line with *Run now*. Errors say what to do next.

**Voice.** Plain, short, sentence case. Verbs on buttons (Apply, Tailor, Follow up). No exclamation marks, no greetings, no emoji in chrome. Numbers with their unit ("86% ATS", "match 74").

**Accessibility.** AA contrast in both themes, visible focus, 44px touch targets on the phone, reduced motion respected.

## 5. Open decisions

1. **Accent colour.** Deep green for "ready/now" (recommended), or keep the current blue.
2. **Tell box scope.** It proposes changes and waits for *Apply* (recommended), or applies simple updates (status, notes) directly.
3. **Focus rules.** Which skip rules ship on by default (company size, location, role level), now configurable in Settings → Search rules.
4. **Merge.** The revamp lives on the `jobdormo` branch, previewed on port 3738. Merge when you've tried it.

## 6. What was built (26 Nov 2026, branch `jobdormo`)

- **Today** (`/dashboard`): Tell box, Focus (rules in `src/lib/focus.ts`, tested), Follow up (people due plus applications quiet for 10+ days), This week. The old dashboard is at `/dashboard/stats`; `/dashboard/search` redirects here.
- **Tell Jobdormo** (`src/lib/tell.ts`, `src/actions/tell.actions.ts`): the model sees jobs and people only as J1/P1 references, every change is checked against the user's own data, and nothing is saved until Apply. It handles status changes, reach-out status, job notes, logging a message or reply with a person, follow-up dates, and adding a pasted job.
- **Navigation**: Today, Jobs, People, LinkedIn, My CVs, with a bottom bar on phones. Interviews, Job sources (automations), Tasks, Activities, Questions, built-in resumes, Library and Stats sit under the account menu → More.
- **Jobs**: Review / Pursuing / Closed / All views; one Job column with the company line; CV (ATS) column visible on phones; Edit and Delete in the row menu.
- **Job page**: Tailor CV, Message someone, Mark applied in the header; tabs Fit, CV, People, History, Posting.
- **My CVs** (`/dashboard/cvs`): CVs by kind of role, CVs made for each job, other PDFs, gaps, career knowledge.
- **Tokens**: paper, ink and one green signal (`--signal`) in `globals.css`, light and dark.
- **Agent chat**: the Claude Code tool protocol now says "actions", which fixes tool calls on Claude Code 2.1.x.

Not done yet: the full unslop pass over the older screens (People, LinkedIn, Settings, dialogs), which needs a decision on direction and copy; a compact job summary card on phones; the People page layout on phones.
