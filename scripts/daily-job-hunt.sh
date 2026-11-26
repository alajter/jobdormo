#!/bin/zsh
# Daily job hunt: runs the board's automations, then (optionally) a Claude
# Code agent searches the web with your search brief, adds new finds to the
# board (duplicates skipped), and scores, tailors and plans the next post.
# The web search step needs the `claude` CLI and a brief at SEARCH_BRIEF_FILE
# (default personal/job-search-brief.md); without them it's skipped.
# Run by launchd every morning; safe to run by hand: scripts/daily-job-hunt.sh
set -u
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

DAY=$(date +%F)
OUT=personal/web-finds
mkdir -p "$OUT"
# The board owner, from .env (JOBSYNC_USER_EMAIL=you@example.com).
USER_EMAIL="${JOBSYNC_USER_EMAIL:-$(grep '^JOBSYNC_USER_EMAIL=' .env | cut -d= -f2- | tr -d '"')}"
if [ -z "$USER_EMAIL" ]; then echo "Set JOBSYNC_USER_EMAIL in .env" >&2; exit 1; fi
DB_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"')
# Optional long-lived Claude token (from `claude setup-token`) for runs where
# the keychain login isn't reachable.
TOKEN=$(grep '^CLAUDE_CODE_OAUTH_TOKEN=' .env | cut -d= -f2- | tr -d '"')
[ -n "$TOKEN" ] && export CLAUDE_CODE_OAUTH_TOKEN="$TOKEN"

# 1. Run the board's automations (VC boards, ATS watchlists).
echo "[$(date)] automations" >> "$OUT/$DAY.log"
npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/run-automations.ts >> "$OUT/$DAY.log" 2>&1

# 2. Web search agent. What's already on the board, so the agent doesn't spend effort on it.
psql "$DB_URL" -At -F ' | ' -c "select c.label, t.label from \"Job\" j join \"Company\" c on c.id=j.\"companyId\" join \"JobTitle\" t on t.id=j.\"jobTitleId\" order by 1" > "$OUT/known.txt" 2>>"$OUT/$DAY.log"

# Gaps marked "Not for me" in the app: the agent skips jobs that need them.
DEALBREAKERS=$(psql "$DB_URL" -At -c "select coalesce((s.settings::json->'jobSearch'->'dealbreakers')::text, '[]') from \"UserSettings\" s join \"User\" u on u.id=s.\"userId\" where u.email='$USER_EMAIL'" 2>>"$OUT/$DAY.log")

BRIEF="${SEARCH_BRIEF_FILE:-$(grep '^SEARCH_BRIEF_FILE=' .env | cut -d= -f2- | tr -d '"')}"
BRIEF="${BRIEF:-personal/job-search-brief.md}"
if command -v claude >/dev/null 2>&1 && [ -f "$BRIEF" ]; then
echo "[$(date)] web search start" >> "$OUT/$DAY.log"
claude -p "$(cat "$BRIEF")

Today is $DAY. The already-known list is in personal/web-finds/known.txt (read it first).
Deal-breakers (skip any role that requires these): ${DEALBREAKERS:-[]}" \
  --allowedTools "WebSearch,WebFetch,Read,mcp__claude_ai_Parallel_Search__web_search,mcp__claude_ai_Parallel_Search__web_fetch" \
  --output-format text > "$OUT/$DAY.json" 2>>"$OUT/$DAY.log"

echo "[$(date)] ingest" >> "$OUT/$DAY.log"
npx tsx --env-file=.env scripts/ingest-web-finds.ts "$OUT/$DAY.json" "$USER_EMAIL" >> "$OUT/$DAY.log" 2>&1
else
echo "[$(date)] web search skipped (no claude CLI or no brief at $BRIEF)" >> "$OUT/$DAY.log"
fi

# 3. Company profiles (description, areas, stage, size) for new companies.
echo "[$(date)] enrich companies" >> "$OUT/$DAY.log"
npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/enrich-companies.ts "$USER_EMAIL" >> "$OUT/$DAY.log" 2>&1

# 4. AI-match every open job that has no AI match yet (web finds, and
#    automation jobs beyond each run's top-K).
echo "[$(date)] match" >> "$OUT/$DAY.log"
npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/match-jobs.ts "$USER_EMAIL" >> "$OUT/$DAY.log" 2>&1

# 4b. ATS keyword scores for new open jobs (generic CV; tailored CV when there is one).
echo "[$(date)] ats" >> "$OUT/$DAY.log"
npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/ats-jobs.ts "$USER_EMAIL" >> "$OUT/$DAY.log" 2>&1

# 4c. Morning tailoring: a CV per new job (match 60+), best first, up to 8.
#     Below the ATS target, the missing keywords wait as questions in the app.
echo "[$(date)] tailor" >> "$OUT/$DAY.log"
npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/tailor-jobs.ts "$USER_EMAIL" >> "$OUT/$DAY.log" 2>&1

# 5. Group the gaps across all matches ("What you're missing" on My Jobs).
echo "[$(date)] summarize gaps" >> "$OUT/$DAY.log"
npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/summarize-gaps.ts "$USER_EMAIL" >> "$OUT/$DAY.log" 2>&1
# 6. Keep the next LinkedIn post drafted for its slot (Tue/Thu 08:30).
echo "[$(date)] next post" >> "$OUT/$DAY.log"
npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/next-post.ts "$USER_EMAIL" >> "$OUT/$DAY.log" 2>&1
echo "[$(date)] done" >> "$OUT/$DAY.log"
