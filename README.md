# Jobdormo

A personal job-search assistant. It works overnight and hands you a short morning list: which jobs are worth your time, which CV is ready to send, who to follow up with, and what to post. You tell it what happened in plain words ("Acme rejected me", "got an interview with Globex on Tuesday", "sent Dana the intro note") and it keeps the record.

Built for one person's search, self-hosted, and honest by design: every CV it tailors is checked against your own history before it goes out.

## What it does

- **Finds jobs every morning.** Company career boards (Comeet, Greenhouse, Lever, Workable, Teamtailor, Ashby), VC portfolio boards, remote boards and a web-search agent, deduplicated and scored against the CV for that kind of role.
- **Tells you where to focus.** Apply to these, tailor these, skip these, and why: match, CV readiness, who you know there, company stage and size, your own rules.
- **Tailors a CV per job, without inventing anything.** Uses the posting's ATS keywords wherever they're true for you, asks you about the ones it can't place, remembers your answers, and fact-checks every line against your CVs, notes and LinkedIn text. Ready to send at 75%+ keyword match and no serious issues.
- **Runs your network.** People, how you know them, what you sent, who replied, follow-ups due, and messages drafted in your own voice.
- **Runs your LinkedIn.** A campaign with goals and themes, a dated plan of posts, drafts in your voice, and results.
- **Keeps your story straight.** One place for your CVs, portfolio, notes, rules and confirmed facts, used by everything above.

## Running it

Next.js 16, Prisma and Postgres. Copy `.env.example` to `.env`, set `DATABASE_URL` and `CV_DIR` (your CV folder, with `generic/` and `jobs/` and a `tracks.json`), then:

```bash
npm install
npx prisma migrate deploy
npm run dev
```

The morning scan is `scripts/daily-job-hunt.sh`; turn it on and pick the time in Settings → Daily scan (macOS launchd).

## Credits

Jobdormo is built on [JobSync](https://github.com/Gsync/jobsync) by gsync, an open-source job-application tracker (MIT). The original README is kept in `design/JOBSYNC_README.md`.

## License

MIT. See [LICENSE](LICENSE).
