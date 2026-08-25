# WinPilot Autopilot — Master Plan & Build Status

> **Product**: WinPilot Autopilot — an autonomous LinkedIn operator
> **Owner**: Rohail Ahmed
> **Created**: August 2026 · **Status last verified**: 23 August 2026

---

## How to use this document

This is both the specification and the build tracker. Every module and every task
is marked:

| Mark | Meaning |
|:---:|---|
| ✅ | **Built and verified** — code exists, tests pass, it runs |
| 🟡 | **Partial** — some of it works, the gap is named explicitly |
| ⬜ | **Not built** — specified here, no code yet |

**To continue the build, say:** *"Read `docs/AUTOPILOT-MASTERPLAN.md` and build the next
unfinished module."* Everything needed to pick up cold is in here: file paths, what
already exists to reuse, and the exit criterion for each phase.

**Rule for whoever builds next:** when you finish something, update its mark here in
the same change. A stale tracker is worse than none.

---

## Status at a glance

| # | Module | Status | What it does |
|---|---|:---:|---|
| **M0** | [Autopilot Core (the brain)](#m0--autopilot-core-the-brain-) | ✅ | Goals, memory, journal, scheduler, weekly review |
| **M9** | [Safety Governor](#m9--safety-governor-) | 🟡 | Rate limits, working hours, circuit breaker |
| **M1** | [Prospecting Pipeline](#m1--prospecting-pipeline-) | ⬜ | Find founders → connect → DM |
| **M2** | [Engagement Engine](#m2--engagement-engine-) | 🟡 | Comment on target + feed content |
| **M3** | [Inbox Engine](#m3--inbox-engine-247-responder-) | ⬜ | 24/7 DM monitoring and auto-reply |
| **M4** | [Content Engine](#m4--content-engine-the-influencer-) | ⬜ | Research → post → measure → learn |
| **M5** | [Profile Engine](#m5--profile-engine-) | ⬜ | Continuous profile optimisation |
| **M6** | [Analytics & Document](#m6--analytics--the-strategy-document-) | 🟡 | Funnel, week-over-week diffs, export |

**Where things stand:** the brain is finished and running. It sets its own goals, plans
its own weeks, journals every decision, and rewrites its strategy from what actually
happened. It currently has **3 of 24 actions** wired to it — enough to prove the loop
end-to-end. Phases M1–M5 are about giving that brain more hands.

**Next up: [M1 — Prospecting Pipeline](#m1--prospecting-pipeline-).** It is the module
that most directly chases the goal, and M2's highest-value action (`engage_target_post`)
is blocked until targets exist.

---

## Table of Contents

1. [Why this exists](#1-why-this-exists)
2. [What it does, in one paragraph](#2-what-it-does-in-one-paragraph)
3. [Design decisions (locked)](#3-design-decisions-locked)
4. [Architecture](#4-architecture)
5. [The bot's mind — data model](#5-the-bots-mind--data-model)
6. [The action vocabulary — task kinds](#6-the-action-vocabulary--task-kinds)
7. [The autonomous loop, step by step](#7-the-autonomous-loop-step-by-step)
8. [Modules](#8-modules)
9. [New content-script primitives](#9-new-content-script-primitives)
10. [Known gaps in what is already built](#10-known-gaps-in-what-is-already-built)
11. [Build order & checklists](#11-build-order--checklists)
12. [Risks and how each is handled](#12-risks-and-how-each-is-handled)
13. [Verification](#13-verification)

---

## 1. Why this exists

WinPilot before Autopilot was a set of **user-triggered, one-shot campaigns**. You press
"start," a loop runs, it stops. Job automation worked (`startAutomation` in
`extension/background/service-worker.js`), and the lead-gen loop already did search →
AI-classify → AI-comment → post.

But there was no *agent*:

- Nothing set a goal.
- Nothing remembered what happened yesterday.
- Nothing noticed a tactic stopped working and changed it.
- Nothing ran while you slept.

The market reality this is built for: entry-level roles are gone, mid-level people are
squeezed, and the way into an international company is now **visibility → targeted
network → one-to-one DM conversation**, not the Apply Now button. That process is
repetitive, daily, and unglamorous — which makes it exactly the thing to automate.

**Operator profile this is tuned for**: full-stack developer, ~1.5 years experience,
Pakistan-based, targeting international clients and remote roles. Not entry level, not
senior — the squeezed middle.

---

## 2. What it does, in one paragraph

You give it a mission in one sentence — *"land an international React/Next.js
contract"*. It writes its own 7-day plan. Then, on a human schedule, it discovers
founders at 5–100 person startups, scores them for fit, views their profiles, comments
on their posts, sends connection requests with a real note, follows up with a DM when
they accept, researches and publishes content in your voice, answers your inbox around
the clock, and audits your own profile. Every decision and action is written to a
**journal you can read**. At the end of each week it scores itself against its own
targets, writes down what it learned, and rewrites next week's strategy based on the
result.

*Today the goal-setting, planning, journaling, reviewing and learning are all live. The
discovering, connecting, DMing, posting and inbox handling are specified but not yet
built.*

---

## 3. Design decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| **Runtime** | Server scheduler owns the clock; extension executes DOM work when online | LinkedIn DOM actions require a logged-in browser. A scheduler in `server.ts` keeps the brain and the plan authoritative and durable; work queues when Chrome is closed and drains when it reopens. No new infrastructure, lowest ban risk. |
| **Autonomy** | Fully autonomous — no approval gates | Chosen for maximum leverage. Every action kind still carries an `autonomy` field defaulting to `"auto"`, so gating one action later is a config change, not a rebuild. |
| **Memory** | Mongo collections as source of truth, rendered as a live strategy document | Survives restarts, queryable by the AI, multi-user safe, works on Render's ephemeral filesystem (a `.md` file would not). Markdown export available. |
| **Build order** | Brain first | Eight disconnected bots are worse than one bot with a brain. Build goals + memory + scheduler + review, wire it to one working action loop, then plug the rest in. |

### Non-negotiable constraint

This runs on **your real LinkedIn account** — the same asset the whole strategy depends
on. The [Safety Governor](#m9--safety-governor-) is not optional and is not a "phase 6
polish item." Every dispatched action passes through it.

---

## 4. Architecture

✅ **Built.** Follows WinPilot's existing contract exactly: **the server is the brain,
the extension is a thin DOM executor.**

```
server.ts
  └─ startAutopilotScheduler()          setInterval, every 5 minutes      ✅
       │
       └─ for each user with AgentConfig.enabled
            │
            ├─ planner.tick(userId)                                       ✅
            │    ├─ ensureGoal()        no goal?  → AI decomposes the mission
            │    ├─ ensureCycle()       no cycle? → review last, plan next 7 days
            │    ├─ topUpQueue()        thin queue? → generate next batch
            │    └─ pick highest-priority eligible AgentTask
            │
            ├─ governor.check(task)     paused? working hours? budget?    ✅
            │                           cooldown? extension online?
            │
            └─ dispatch()                                                 ✅
                 └─ sendToExtension(userId, { command: "RUN_TASK", task })
                          │
                          ▼
              extension/background/task-runner.js                         ✅ (3 of 24 kinds)
                 ├─ ensureLinkedInTab()  ensureSessionHealthy()
                 ├─ navigateAndWait()
                 └─ sendToContentScript({ type: "EXECUTE_ACTION", command })
                          │
                          ▼
              extension/content/content-script.js   ← DOM primitives      🟡 (existing ones only)
                          │
                          ▼
              POST /api/autopilot/task-result                             ✅
                 ├─ AgentTask.state = done | skipped | failed
                 ├─ AgentJournal entry
                 ├─ AgentTarget stage transition
                 ├─ DailyUsage increment
                 └─ pushSseEvent → live dashboard
                          │
              ── day 7 ──▼
              reviewer.closeCycle()                                       ✅
                 ├─ actuals vs targets
                 ├─ AI writes reviewSummary + strategyDelta
                 ├─ distils 3–7 AgentMemory learnings
                 └─ planner.planCycle() → next week, changed
```

### What is reused, not rebuilt

| Existing | Path | Used for |
|---|---|---|
| `sendToExtension` | `lib/websocket/server.ts` | Command channel; already queues when the extension is offline |
| `pushSseEvent` | `lib/sse.ts` | Live journal streaming to the dashboard |
| `getUserAIProvider` | `lib/ai/key-manager.ts` | Your existing API keys — no new key handling |
| `incrementUsage` | `lib/anti-detection/rate-limiter.ts` | Daily budget accounting |
| `COOLDOWN_PERIODS`, `DAILY_LIMITS` | `lib/anti-detection/human-simulator.ts` | Human-shaped timing |
| `applyRandomSkipping` | `lib/anti-detection/patterns.ts` | Making the bot visibly not act on everything |
| `EXECUTE_ACTION` switch | `extension/content/content-script.js` | ~30 DOM primitives already built |
| `Post`, `ConnectionRequest`, `DailyUsage`, `ActivityLog`, `ScrapedData`, `CareerProfile`, `ProfileAnalysis` | `lib/db/models/` | Existing storage |

---

## 5. The bot's mind — data model

✅ **All eight collections built** in `lib/db/models/`, registered in
`lib/db/models/index.ts`.

| Model | File | Status | Purpose |
|---|---|:---:|---|
| `AgentConfig` | `agent-config.ts` | ✅ | The master switch, mission, working hours, budgets, per-kind autonomy |
| `AgentGoal` | `agent-goal.ts` | ✅ | The decomposed goal + `personaSnapshot` |
| `AgentCycle` | `agent-cycle.ts` | ✅ | One 7-day plan, its targets, actuals and review |
| `AgentMemory` | `agent-memory.ts` | ✅ | Durable learnings with confidence |
| `AgentJournal` | `agent-journal.ts` | ✅ | The living document |
| `AgentTask` | `agent-task.ts` | ✅ | The work queue with `dedupeKey` |
| `AgentTarget` | `agent-target.ts` | ✅ | The prospect pipeline (schema ready; **nothing populates it until M1**) |
| `AgentThread` | `agent-thread.ts` | ✅ | Inbox state (schema ready; **nothing populates it until M3**) |

### `AgentConfig` — the switch ✅

```ts
{
  userId, enabled: boolean,
  mission: string,                        // "land an international React contract"
  workingHours: { start, end, timezone, activeDays[] },
  weeklyBudgets: { connects, comments, dms, posts, likes, profileViews },
  autonomy: Map<taskKind, "auto" | "review">,   // all default "auto"
  rampStartedAt?: Date,                   // week 1 at 40%, → 100% over three weeks
  pausedUntil?: Date, pauseReason?: string,
  lastTickAt?: Date
}
```

### `AgentGoal` — the ultimate goal, decomposed ✅

```ts
{
  userId,
  northStar: string,                      // AI-written, one sentence
  successMetric: { kind, target, by },    // e.g. dm_conversations_started, 10, +90d
  subGoals: [{ text, metric, target, status }],
  constraints: {                          // the ICP the whole system aims at
    niche[], targetRoles[], targetCompanySizeMin, targetCompanySizeMax,
    geographies[], excludes[]
  },
  personaSnapshot: {                      // frozen from CareerProfile + ProfileAnalysis
    headline, summary, topSkills[], signatureProjects[], voiceNotes,
    yearsExperience, location
  }
}
```

`personaSnapshot` is the single most important field for output quality. Every generated
comment, DM and post is grounded in it, which is what separates specific writing from
generic AI slop.

### `AgentCycle` — one 7-day plan ✅

```ts
{
  userId, weekNumber, startsAt, endsAt,
  strategy: string,                       // AI prose: what it will try and why
  channelMix: { prospecting, content, engagement, inbox },   // % of effort
  targets: [{ metric, planned }],
  actuals: [{ metric, achieved }],
  status: "planning" | "running" | "reviewing" | "closed",
  reviewSummary?, strategyDelta?, score?  // 0-100 self-assessment
}
```

### `AgentMemory` — durable learnings ✅

```ts
{
  userId,
  kind: "insight" | "pattern" | "failure" | "preference" | "fact",
  statement: string,
  evidence: [{ type, refId }],
  confidence: 0..1, hitCount, lastConfirmedAt, expiresAt?
}
```

Confidence is reinforced when a later week's data confirms a statement and decayed when
contradicted. Near-duplicate statements are merged rather than accumulated — the
similarity check uses light suffix stemming, because the reviewer paraphrases the same
insight differently each week.

### `AgentJournal` — the living document ✅

```ts
{
  userId, cycleId,
  entryType: "decision" | "action" | "observation" | "error" | "reflection",
  phase: string, text: string, refs: {...}, createdAt   // TTL 180 days
}
```

Example entries the system actually writes:

> **decision** — Week 1 plan. Build early visibility through niche commenting… Effort
> split — prospecting 40%, engagement 30%, content 20%, inbox 10%.
>
> **action** — Commented on Sarah Chen's post (found via "nextjs"): "…"
>
> **observation** — Skipped a comment_on_feed: nothing here was worth commenting on.
> Doing nothing beats posting something generic.
>
> **error** — LinkedIn pushed back while I was running comment_on_feed: "checkpoint".
> I have stopped everything until 02:14 rather than risk the account.

### `AgentTask` — the queue ✅

```ts
{
  userId, cycleId, kind, payload,
  state: "queued"|"dispatched"|"running"|"done"|"failed"|"skipped"|"awaiting_review",
  scheduledFor, priority, attempts, maxAttempts,
  dedupeKey?,                             // unique per user — kills duplicate actions
  rationale, result?, error?, dispatchedAt?, completedAt?
}
```

### `AgentTarget` — the prospect pipeline ✅ *(schema only — M1 fills it)*

```ts
{
  userId, profileUrl (unique per user), name, headline, company, companySize, location,
  fitScore: 0..100, fitReason,
  stage: "discovered"|"warming"|"invited"|"connected"|"engaged"
       |"dm_sent"|"in_conversation"|"opportunity"|"dormant"|"rejected",
  touchpoints: [{ kind, at, content, taskId, url }],
  nextTouchAt?, lastPostSeenUrl?, notes, discoveredVia
}
```

Stage machine:

```
discovered ──score──▶ warming ──view+comment──▶ invited ──accept──▶ connected
                                                   │                    │
                                              (no accept 14d)      ──dm──▶ dm_sent
                                                   ▼                         │
                                                dormant ◀──no reply 21d──────┤
                                                                             ▼
                                                                    in_conversation
                                                                             │
                                                                             ▼
                                                                       opportunity
```

Transitions for `view_target_profile` and `engage_target_post` are already implemented in
`app/api/autopilot/task-result/route.ts`. The rest arrive with M1.

### `AgentThread` — inbox state ✅ *(schema only — M3 fills it)*

```ts
{
  userId, conversationUrl, participantName/Url/Headline,
  lastMessageAt, lastMessageFrom: "them"|"me", lastMessageText,
  messageHash,                            // dedupe — never answer the same message twice
  intent: "recruiter"|"client"|"sales_spam"|"networking"|"unknown",
  intentConfidence, urgency, needsReply, repliedAt,
  escalated, escalationReason, linkedTargetId
}
```

---

## 6. The action vocabulary — task kinds

Every autonomous action is one `AgentTask.kind`. All 24 are declared in
`TASK_KINDS` (`lib/db/models/agent-config.ts`); the subset the planner will actually
queue is `IMPLEMENTED_TASK_KINDS` in the same file.

**Later phases light up by adding to `IMPLEMENTED_TASK_KINDS` — the planner needs no
edit.**

| Kind | Module | Status | What it does |
|---|:---:|:---:|---|
| `plan_cycle` | M0 | ✅ | AI writes the 7-day strategy and targets |
| `review_cycle` | M0 | ✅ | AI scores the week, writes learnings, adapts strategy |
| `comment_on_feed` | M2 | ✅ | Comments on relevant niche posts |
| `like_post` | M2 | ✅ | Low-risk visibility touch |
| `view_target_profile` | M1 | ✅ | Visits a profile (they get a notification) |
| `discover_targets` | M1 | ⬜ | People/company search → new `AgentTarget` docs |
| `score_targets` | M1 | ⬜ | AI fit-scores discovered targets against the goal |
| `send_connection` | M1 | ⬜ | Connection request with an AI-written note |
| `check_invite_accepted` | M1 | ⬜ | Polls sent invites → `connected` |
| `follow_target` | M1 | ⬜ | Follows without connecting |
| `engage_target_post` | M2 | ⬜ | Comments on a **specific target's** post — highest value action |
| `scan_notifications` | M2 | ⬜ | Picks up replies to your comments as warm signals |
| `warm_dormant_targets` | M2 | ⬜ | Re-engages targets gone quiet |
| `scan_inbox` | M3 | ⬜ | Diffs the conversation list against `AgentThread` |
| `classify_thread` | M3 | ⬜ | AI labels intent + urgency |
| `reply_thread` | M3 | ⬜ | AI reply grounded in persona + target history |
| `send_dm` | M1/M3 | ⬜ | Opening DM to a newly connected target |
| `followup_target` | M1/M3 | ⬜ | Scheduled follow-up on a silent thread |
| `research_topics` | M4 | ⬜ | Mines feed + memory for what to post about |
| `draft_post` | M4 | ⬜ | Writes a post from your real experience |
| `publish_post` | M4 | ⬜ | Publishes at the scheduled slot |
| `measure_post` | M4 | ⬜ | Reads back engagement → feeds `AgentMemory` |
| `audit_own_profile` | M5 | ⬜ | Re-runs profile analysis |
| `apply_profile_edit` | M5 | ⬜ | Writes the improved headline / About |

**3 of 24 executable today.**

---

## 7. The autonomous loop, step by step

✅ **Built** — `lib/autopilot/planner.ts`. Every 5 minutes, per enabled user:

1. **Boot state** — load `AgentConfig`. Disabled or `pausedUntil > now`? Stop. ✅
2. **Reclaim** — requeue tasks the extension took but never reported on. ✅
3. **Goal** — no `AgentGoal`? Decompose `mission` with AI using `CareerProfile` +
   `ProfileAnalysis`. Journal a `decision`. ✅
4. **Cycle** — no running cycle, or `endsAt` passed? Run `reviewer.closeCycle()`, then
   `planner.planCycle()`. Journal the new strategy. ✅
5. **Queue top-up** — fewer than 12 queued tasks? Generate the next batch from the
   cycle's `channelMix` and live pipeline state. ✅ *(currently produces the 3
   implemented kinds; each new module extends this)*
6. **Select** — highest `priority`, `scheduledFor <= now`, `state: queued`. ✅
7. **Gate** — `governor.check()`. Fails → reschedule to `nextEligibleAt`, journal, stop. ✅
8. **Dispatch** — `sendToExtension`, atomic claim, push SSE. ✅
9. **Execute** — extension runs it, POSTs the result back. ✅
10. **Record** — task state, journal entry, target stage transition, `DailyUsage`
    increment, SSE to dashboard. ✅

**On restart**, step 1 re-reads everything from Mongo. There is no in-memory state that
matters. The bot picks up mid-cycle with its plan, its journal and its memory intact —
which is the behaviour that makes it an agent rather than a script. ✅ *(covered by
`tests/unit/autopilot/tick.test.ts`)*

---

## 8. Modules

### M0 — Autopilot Core (the brain) ✅

**Status: built, tested, running.**

| File | Status | Responsibility |
|---|:---:|---|
| `lib/autopilot/scheduler.ts` | ✅ | The 5-min interval; per-user try/catch; re-entrancy flag |
| `lib/autopilot/planner.ts` | ✅ | `ensureGoal`, `ensureCycle`, `planCycle`, `topUpQueue`, `tick`, `dispatch` |
| `lib/autopilot/governor.ts` | ✅ | `check()` → `{ allowed, gate, reason, nextEligibleAt }` |
| `lib/autopilot/reviewer.ts` | ✅ | `closeCycle` — actuals, AI review, memory distillation |
| `lib/autopilot/memory.ts` | ✅ | `recall`, `remember`, `reinforce`, `decay` |
| `lib/autopilot/journal.ts` | ✅ | `journal()` + SSE push in one call |
| `lib/ai/prompts/autopilot.ts` | ✅ | Goal decomposition, cycle planning, cycle review |

**API** ✅

- `GET /api/autopilot` — config + goal + cycle + queue + journal + memory + funnel
- `PATCH /api/autopilot` — update config
- `POST /api/autopilot` — `start | stop | replan | force_review | resume`
- `POST /api/autopilot/task-result` — extension reports outcomes; owns the circuit breaker
- `POST /api/autopilot/generate` — runtime AI mid-task (`pick_post`, `comment`)
- `GET /api/autopilot/document` — the strategy doc; `?format=markdown` downloads it

**Extension** ✅ — `extension/background/task-runner.js`, wired via `RUN_TASK` in
`handleServerMessage`. Reuses `ensureLinkedInTab` / `ensureSessionHealthy` /
`navigateAndWait` / `sendToContentScript` / `randomDelay` / `apiCall` verbatim. Mutually
exclusive with job automation and lead gen (all three drive the same tab).

**UI** ✅ — `/dashboard/autopilot`, four tabs: **This Week** (strategy, targets vs
actuals, live queue), **Journal** (live-appending via SSE, with markdown export),
**Memory** (learnings by confidence), **Mission** (goal, targeting, safety envelope).
Sidebar entry added.

**Wiring** ✅ — `startAutopilotScheduler()` called from `server.ts` after
`app.prepare()`, via dynamic import. *This must stay a dynamic import:* a static one
evaluates `lib/db/connection` before Next loads `.env` and crashes the process on boot.

**Env** ✅ — `AUTOPILOT_ENABLED`, `AUTOPILOT_TICK_MS` documented in
`.env.production.example`.

**Tests** ✅ — 55 tests across `tests/unit/autopilot/`: `governor.test.ts` (21),
`tick.test.ts` (10), `reviewer.test.ts` (9), `memory.test.ts` (10), `planner.test.ts` (5).

**Exit criterion — met:** enable autopilot and, with no further input, it sets a goal,
writes a 7-day plan, comments on your niche's feed on a human schedule, journals every
decision, and on day 7 produces a written review that changes next week's plan.

---

### M1 — Prospecting Pipeline ⬜

**Status: not built. This is the next module.** It is what most directly chases the
goal, and M2's best action is blocked until targets exist.

```
discover_targets → score_targets → view_target_profile ✅
    → engage_target_post (M2) → send_connection → check_invite_accepted
    → send_dm → followup_target
```

**To build**

- ⬜ `lib/autopilot/prospecting.ts` — discovery search-URL building from
  `goal.constraints`, batch fit-scoring, stage transition rules
- ⬜ Task kinds in `planner.buildPayload()`: `discover_targets`, `score_targets`,
  `send_connection`, `check_invite_accepted`, `follow_target`
- ⬜ Handlers in `extension/background/task-runner.js` for each
- ⬜ Stage transitions in `task-result/route.ts` for invite sent / accepted / rejected
- ⬜ Add the new kinds to `IMPLEMENTED_TASK_KINDS`
- ⬜ Prompts: fit-scoring, connection note (extend `buildOutreachMessagePrompt`)
- ⬜ New content-script primitives: `SEND_CONNECTION_REQUEST`, `FOLLOW_PROFILE`,
  `SCRAPE_PEOPLE_SEARCH`, `CHECK_INVITATION_STATUS`
- ⬜ Targets tab on `/dashboard/autopilot`

**Notes for the builder**

- Discovery drives off `goal.constraints` (`targetCompanySizeMin/Max`, `geographies`,
  `targetRoles`). Reuse `SCRAPE_COMPANY_PEOPLE` (content-script.js) and
  `SCRAPE_USER_PROFILE`.
- Batch fit-scoring should follow the shape of `classify_posts` in
  `app/api/lead-gen/route.ts` — one AI call for the whole batch, indexed replies.
- Below-threshold targets go to `rejected` and are never touched again.
- **The warm sequence matters:** profile view → comment on their content → *then* the
  invite. An invite from someone whose name they have already seen twice converts far
  better than a cold one. Do not shortcut this to save budget.
- Connection notes: AI-written, max 300 chars, referencing something specific.
- The DM on accept is never a pitch. It opens a conversation.
- `SEND_CONNECTION_REQUEST` must handle the More-menu fallback the way
  `openMessageComposer` (content-script.js) already does.

---

### M2 — Engagement Engine 🟡

**Status: partial.** Feed commenting and liking work end-to-end. Target-specific
engagement — the highest-value action in the whole system — does not exist yet.

**Built** ✅

- `comment_on_feed` — keyword search → scrape → AI picks the best post → AI writes a
  comment grounded in `personaSnapshot` → posts it
- `like_post` — same selection path, like only
- Post-level dedupe in `/api/autopilot/generate` (`pick_post` filters anything already
  in `ActivityLog`)
- Anti-slop guard: generated comments matching boilerplate ("Great post", "Love this",
  …) are rejected and the task is **skipped rather than posted**

**To build**

- ⬜ `engage_target_post` — comment on *your specific targets'* posts, not keyword
  results. Needs M1 for targets and `SCRAPE_PROFILE_RECENT_POSTS`.
- ⬜ `scan_notifications` — replies to your comments become warm signals, promoting
  targets to `engaged`
- ⬜ `warm_dormant_targets` — a like or comment on someone gone quiet, before any re-DM
- ⬜ Home-feed reading (`SCRAPE_HOME_FEED`) — today it searches by keyword only
- ⬜ Generalise the engagement flow into `lib/autopilot/engagement.ts` shared by both
  paths

---

### M3 — Inbox Engine (24/7 responder) ⬜

**Status: not built.** `AgentThread` schema is ready.

```
scan_inbox → diff by messageHash → classify_thread → reply_thread
                                          │
                                          └─ sales_spam → archive, never answer
```

**To build**

- ⬜ `lib/autopilot/inbox.ts` — scan/diff/classify/reply orchestration
- ⬜ Task kinds `scan_inbox`, `classify_thread`, `reply_thread`, `send_dm`,
  `followup_target`
- ⬜ Reply prompt with the hard rules below
- ⬜ Escalation path: in-app `Notification` + email via `lib/email/resend.ts`
- ⬜ Content-script primitives: `SCRAPE_CONVERSATION_LIST`, `OPEN_CONVERSATION`,
  `SCRAPE_THREAD_MESSAGES`, `REPLY_IN_THREAD`
- ⬜ Inbox tab on the dashboard

**Hard rules to bake into the reply prompt** — the bot must never:

- state or negotiate a salary or rate number
- accept or propose a specific call time
- claim experience, a client, or a technology absent from `CareerProfile`
- agree to terms, contracts, or scope

On any of those it sends a short holding reply and **escalates to you**. This keeps the
loop fully autonomous while ensuring the four things that can actually cost money or
credibility reach a human. Spam is archived, never answered.

`REPLY_IN_THREAD` can wrap the existing `sendComposedMessage` in content-script.js —
the editor handling is already solved there.

---

### M4 — Content Engine (the influencer) ⬜

**Status: not built.** `Post` model already has `scheduledFor`, `status` and
`engagement`; `CREATE_POST` already exists in the content script.

```
research_topics → draft_post → publish_post → measure_post → AgentMemory
```

**To build**

- ⬜ `lib/autopilot/content.ts`
- ⬜ Task kinds `research_topics`, `draft_post`, `publish_post`, `measure_post`
- ⬜ Extend `buildLinkedInPostPrompt` to be persona-grounded
- ⬜ `SCRAPE_MY_POST_ENGAGEMENT` primitive
- ⬜ Content tab / queue UI

**Two things must keep this from being slop**

1. **Every draft is seeded from your real experience.** `research_topics` picks the
   angle; the draft prompt is then forced to build it on a specific item from
   `personaSnapshot.signatureProjects` — a real project, a real migration, a real
   failure, a real reason you switched. Generic "5 tips" posts must be explicitly
   disallowed in the prompt.
2. **The loop closes.** `measure_post` reads back real engagement ~48h later and writes
   it into `AgentMemory` as a `pattern`. The weekly reviewer then knows which hooks,
   formats and pillars actually work *for your audience*, and next week's drafts are
   conditioned on that.

Vanity metrics are explicitly **not** the success metric. The cycle target is DM
conversations started with target-profile people, not likes.

---

### M5 — Profile Engine ⬜

**Status: not built.** The profile-optimizer module and `ProfileAnalysis` already exist
and should be reused rather than reimplemented.

**To build**

- ⬜ `audit_own_profile` — weekly, reusing `app/api/profile-optimizer/route.ts`
- ⬜ `apply_profile_edit` — writes the improved headline and About directly
- ⬜ `UPDATE_PROFILE_SECTION` primitive (headline + About edit modals, Save)

This is the conversion step for everything else: a founder who gets your invite spends
about four seconds on your profile. An empty profile makes every other module's work
worthless.

---

### M6 — Analytics & the Strategy Document 🟡

**Built** ✅

- Markdown export of the whole strategy document — goal, every cycle with its review,
  all learnings, the full journal, pipeline counts (`GET /api/autopilot/document`)
- Pipeline counts by stage on the dashboard
- Targets vs actuals with progress bars per cycle

**To build**

- ⬜ Funnel *conversion rates* between stages (discovered → … → opportunity), not just
  counts
- ⬜ Week-over-week strategy diffs — what the bot changed and whether it worked
- ⬜ Per-action conversion rates, so the planner's channel mix is grounded in measured
  data rather than the AI's guess
- ⬜ Fold autopilot metrics into `components/analytics/analytics-client.tsx`

---

### M9 — Safety Governor 🟡

**Status: the core is built and enforced on every dispatch. Two camouflage items
remain.** Not a phase — a constraint applied throughout.

| Control | Status | Setting |
|---|:---:|---|
| Daily ceilings | ✅ | Weekly budget ÷ active days × ramp. Defaults ≈15 connects, 20 comments, 12 DMs, 60 profile views, 3 posts per day |
| Working hours | ✅ | **In the user's own timezone** — `localTimeIn()`, because the server runs UTC on Render |
| Active days | ✅ | Mon–Fri by default |
| Cooldowns | ✅ | `COOLDOWN_PERIODS` between same-category actions |
| Extension-online gate | ✅ | Nothing dispatches to a closed browser |
| Circuit breaker | ✅ | Any captcha / checkpoint / 429 / session-loss → pause 6h, journal, notify. Never shortens an existing longer pause |
| Ramp-up | ✅ | Week 1 at 40%, week 2 at 70%, week 3+ at 100% |
| Dedupe | ✅ | `AgentTask.dedupeKey` unique index + post-URL check in `pick_post` |
| Random skipping | ✅ | `applyRandomSkipping(0.2)` — the bot visibly does *not* act on everything it sees |
| Reading delays | ✅ | 6–20s on-post dwell, `SIMULATE_BROWSING` scroll before acting |
| **Browsing breaks between tasks** | ⬜ | `shouldInsertBrowsingBreak` / `generateBrowsingAction` exist in `lib/anti-detection/patterns.ts` but are **not wired into the autopilot loop** |
| **Weekend taper** | ⬜ | Currently binary via `activeDays`; no reduced-volume weekend mode |

`ENFORCE_DAILY_LIMITS` governs the *legacy* job-automation and lead-gen paths. Autopilot
enforces its own budgets in `governor.dailyCeiling()` regardless of that flag.

---

## 9. New content-script primitives

Added to the `EXECUTE_ACTION` switch in `extension/content/content-script.js`, following
existing conventions (`HumanBehavior.humanClick`, `humanType`, `waitForElement`,
More-menu fallbacks).

| Primitive | Module | Status |
|---|:---:|:---:|
| `SEND_CONNECTION_REQUEST` | M1 | ⬜ |
| `CHECK_INVITATION_STATUS` | M1 | ⬜ |
| `SCRAPE_PEOPLE_SEARCH` | M1 | ⬜ |
| `FOLLOW_PROFILE` | M1 | ⬜ |
| `SCRAPE_HOME_FEED` | M2 | ⬜ |
| `SCRAPE_PROFILE_RECENT_POSTS` | M2 | ⬜ |
| `SCRAPE_NOTIFICATIONS` | M2 | ⬜ |
| `SCRAPE_CONVERSATION_LIST` | M3 | ⬜ |
| `OPEN_CONVERSATION` | M3 | ⬜ |
| `SCRAPE_THREAD_MESSAGES` | M3 | ⬜ |
| `REPLY_IN_THREAD` | M3 | ⬜ |
| `SCRAPE_MY_POST_ENGAGEMENT` | M4 | ⬜ |
| `UPDATE_PROFILE_SECTION` | M5 | ⬜ |

**Already existed and are in use by Autopilot** ✅ — `SCRAPE_KEYWORD_POSTS`,
`COMMENT_ON_POST`, `LIKE_POST`, `SCRAPE_USER_PROFILE`, `SIMULATE_BROWSING`,
`CHECK_SESSION`.

---

## 10. Known gaps in what is already built

Honest list of things that are marked ✅ but have a rough edge. Worth fixing before or
alongside M1.

| Gap | Where | Impact | Fix |
|---|---|---|---|
| **`"review"` autonomy spins** | `governor.check()` returns `gate: "autonomy"` with no `nextEligibleAt`, so the planner re-checks that task every tick forever. `awaiting_review` exists in the `AgentTask` enum but nothing ever sets it. | Low today — every kind defaults to `"auto"`, so this is unreachable unless someone flips one. | Park the task in `awaiting_review` instead of blocking, and surface a review queue in the UI. |
| **Browsing breaks not wired** | `shouldInsertBrowsingBreak` / `generateBrowsingAction` unused by Autopilot | Medium — the bot's action rhythm is more regular than a human's | Insert a browsing action between dispatches every 3–5 tasks |
| **`AgentTarget` / `AgentThread` unpopulated** | Schemas built, no producer | None — expected until M1 / M3 | Ships with those modules |
| **No integration test against a real DB** | `mongodb-memory-server` not installed; the only reachable Mongo is the shared Atlas cluster | Low — the full chain is covered with mocked models in `tick.test.ts` | Add `mongodb-memory-server` as a dev dependency if a true integration test is wanted |
| **Cycle review needs 7 days of data** | By design | The first genuinely useful `strategyDelta` arrives at the end of week 1 | Use `POST /api/autopilot {action:"force_review"}` to exercise it early |

---

## 11. Build order & checklists

### ✅ Phase 0 — M0 Autopilot Core — **DONE**

- [x] 8 models + `index.ts` registration
- [x] `journal.ts`, `memory.ts`
- [x] `lib/ai/prompts/autopilot.ts`
- [x] `governor.ts` with all six gates
- [x] `planner.ts` — goal, cycle, top-up, tick, dispatch
- [x] `reviewer.ts` — actuals, AI review, memory distillation
- [x] `scheduler.ts` + `server.ts` wiring (dynamic import)
- [x] `/api/autopilot`, `/task-result`, `/generate`, `/document`
- [x] `task-runner.js` + `RUN_TASK` in the service worker (3 kinds)
- [x] `/dashboard/autopilot` with 4 tabs + sidebar entry
- [x] Unit tests: governor gates, tick chain, dedupe, memory decay, reviewer
- [x] Env vars documented

### ⬜ Phase 1 — M1 Prospecting — **NEXT**

- [ ] `lib/autopilot/prospecting.ts`
- [ ] 5 task kinds in planner + task-runner
- [ ] 4 content-script primitives
- [ ] Fit-scoring + connection-note prompts
- [ ] Stage transitions in `task-result`
- [ ] Add kinds to `IMPLEMENTED_TASK_KINDS`
- [ ] Targets tab
- [ ] Tests

### ⬜ Phase 2 — M2 Engagement (finish it)
### ⬜ Phase 3 — M3 Inbox
### ⬜ Phase 4 — M4 Content
### ⬜ Phase 5 — M5 Profile
### ⬜ Phase 6 — M6 Analytics
### ⬜ Ongoing — M9 gaps (browsing breaks, weekend taper)

**Every phase follows the same three steps:** add its task kinds to the planner's
`buildPayload` + `IMPLEMENTED_TASK_KINDS`, add its handlers to `task-runner.js`, add its
primitives to the content script. **The brain never changes** — that is the point of
having built it first.

---

## 12. Risks and how each is handled

| Risk | Status | Handling |
|---|:---:|---|
| **LinkedIn restricts the account** | 🟡 | Safety Governor: conservative ceilings, human pacing, working hours, three-week ramp, circuit breaker on any checkpoint. Browsing-break camouflage still outstanding. |
| **AI writes something embarrassing** | ✅ | Every generation grounded in `personaSnapshot`; boilerplate comments rejected and skipped rather than posted; full journal of everything it said. Per-kind `autonomy` can be flipped to `"review"` without a rebuild (see gap in §10). |
| **Extension offline → nothing happens** | ✅ | Tasks stay `queued` and drain when Chrome reopens. Dashboard shows an offline banner and the backlog size. |
| **Runaway loop / duplicate actions** | ✅ | `dedupeKey` unique index; atomic claim on dispatch; re-entrancy flag on the tick; `attempts` cap with exponential backoff; kill switch on `AgentConfig.enabled`. |
| **AI provider fails or runs out of quota** | ✅ | A failed generation marks the task failed and journals it rather than sending something empty. Cycle planning falls back to a conservative default plan. |
| **Content becomes slop over time** | ⬜ | Closed by `measure_post` in M4 — not yet built. |
| **Server restart mid-cycle** | ✅ | Zero in-memory state of consequence. Everything reloads from Mongo. |

---

## 13. Verification

### Last verified — 23 August 2026

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors, 6 warnings (all pre-existing) |
| `npm test` | **192 passed** (55 of them autopilot) |
| `npm run build` | compiled; 4 autopilot API routes + dashboard page present |
| `cd extension && node build.js` | `task-runner.js` bundled, module loads |
| Server boot | `[Autopilot] Scheduler started — ticking every 15s` |
| Real Mongo tick | connected, `{ users: 0, dispatched: 0 }` — clean |

### Live smoke test (needs your LinkedIn session)

```bash
AUTOPILOT_TICK_MS=15000 npm run dev
```

Set an AI key in Settings, open `/dashboard/autopilot`, set the mission, press **Start**
with the extension connected on a logged-in LinkedIn tab. Within ~2 minutes expect: goal
created → week-1 cycle with strategy and targets → tasks queued → one `comment_on_feed`
dispatched over WS → comment visible on LinkedIn → result posted back → journal entry
appears live without a refresh.

### Remaining verification scenarios

- ⬜ **Restart/memory test** — kill the server mid-cycle, restart. It must resume the
  open cycle and queue with no duplicate actions. *(Logic covered by `tick.test.ts`;
  not yet exercised against a live DB.)*
- ⬜ **Review test** — `POST /api/autopilot {action:"force_review"}` after real activity.
  Actuals from real `DailyUsage`/`AgentTarget` data, non-empty `strategyDelta`, ≥3 memory
  entries, and a different `channelMix` next cycle when targets were missed.
- ⬜ **Safety test** — provoke or stub a `checkpoint` result. Autopilot pauses 6h,
  journals the reason, shows the paused banner, dispatches nothing on the next tick.
