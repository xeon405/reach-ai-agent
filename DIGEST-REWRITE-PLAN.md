# Daily Digest — current vs proposed (per /c/Dev/reach-ai-agent/supabase/functions/daily-digest/index.ts)

## 1) THE CURRENT DIGEST — verbatim from code (lines 76-103)

Subject:  "  Your agent's last 24h: {N} sent . {N} replies . {N} hot "

Body:     "Morning report from your agent:

  - Emails sent: {N}
  - Failed/dead queue jobs: {N}
  - Bounces: {N}
  - Opens: {N}
  - Replies: {N}
  -  Interested: {N}
  -  Booking-intent conversations: {N}
  -  Meetings booked: {N}
  -  Unsubscribes: {N}
  -  AI replies sent: {N}
  -  Human takeovers: {N}

  Campaign performance (last 24h):
     - abc12345: 5 sent . 1 replies

  You have HOT leads waiting - check Gmail now!
  (or, when zero hot and zero bookings: "Keep the pipeline full - import fresh leads today.")

  -- OutShipAi Agent"

Honest read: a wall of 11 counts. The closer is binary (fire OR nudge). The subject line
is itself a stats dump. It does not say WHO replied, WHAT the reply expressed, or whether
any single item actually needs the owner. There is no "nothing needed you" state; every
count is shown even when it is 0.

## 2) PROPOSED REWRITE - same data, same 04:00 send, new voice

Subject:  "Good morning - 1 reply needs your eyes today"
   or, when nothing needs you: "Good morning - quiet night, nothing needs you"

Opening:  "Good morning! Quick brief before your day starts."

Section 1 - WHAT NEEDS YOU (leads with this; if empty, say so plainly):
    * 1 reply came back "NOT_INTERESTED" (campaign abc12345) but it reads like a
      soft-no ("timing is wrong this quarter") - I left it open for your look.
    OR the honest-empty:  "Nothing needs you this morning. All quiet."

Section 2 - WHAT THE AGENT HANDLED (things it did, not just counts):
    * 5 emails went out overnight (3 opened, 1 replied).
    * No bounces, nothing failed, no meetings booked.
    * Your quietest campaign is abc12345 - 1 reply from 3 sends.

Section 3 - THE CLOSER (one sentence, either state):
    if action needed: "That is the whole of it - just the 1 reply above needs your eyes."
    if nothing:       "That is everything. Nothing else needs you."

Closing:  "-- your OutShipAi agent"

Example with realistic fake numbers (NOT real data):
    Subject:  "Good morning - 1 reply needs your eyes today"

    Good morning! Quick brief before your day starts.

    ONE reply needs your eyes:
    * On your "Spring workshops" campaign (abc12345): a lead replied and the
      sentiment classified NOT_INTERESTED, but the wording reads like a soft
      no ("timing is wrong this quarter"). I have not marked it dead - it may
      just be a circle-back-next-quarter. Your call.

    Everything else this morning is quiet:
    * 5 emails went out overnight, 3 opened, 1 replied.
    * 0 bounces, 0 failures, 0 meetings booked.
    * Quietest campaign: abc12345 (1 reply from 3 sends).

    That is the whole of it - just the 1 reply above needs your eyes.

    -- your OutShipAi agent

## 3) HONESTY NOTES (what the digest can and cannot say today)

CAN say (all provable from the query it already runs):
    - reply_sentiment has exactly three values: INTERESTED / MAYBE / NOT_INTERESTED
    - reply counts, opens, bounces, failures, meetings, bookings, per-campaign numbers

CANNOT say today (would need new data access -> flagging, NOT silently faking):
    - the literal reply text (emails_sent has no reply_body column; the digest never
      fetched one). So any "quote" of the reply in my example is ILLUSTRATIVE ONLY -
      the real template will say "reads like a soft-no" using reply_sentiment +
      "timing is wrong this quarter" is NOT quotable today.
    - "sounds like a complaint" - reply_sentiment has no COMPLAINT bucket.

Both of those land in a later capabilities pass per your "no new infra now" boundary.
If you want the digest to QUOTE actual reply text, that needs: (1) a reply_body column
on emails_sent, (2) inbox-agent writing it, (3) digest fetching it. Flagged, not built.
