// WinPilot Autopilot — task runner
//
// The server decides WHAT to do and sends one AgentTask at a time over the
// WebSocket. This module is the executor: it drives the LinkedIn tab through
// the steps that task needs, asks the server for any judgement it cannot make
// locally (what to actually say), and posts the outcome back to
// /api/autopilot/task-result.
//
// It deliberately owns no decisions of its own beyond timing. Everything that
// needs the user's goal, persona, or history happens server-side.
//
// Engagement tasks arrive from one of two sources, set by the server on the
// payload, and the two take deliberately different shapes:
//
//   payload.source === "feed"  — feed mode. Open the home feed, read down it,
//                                and work every post it has not already been
//                                through: like it, comment on it, move to the
//                                next card. No post is picked over another and
//                                nothing is passed over for not being
//                                interesting enough — the point of feed mode
//                                is coverage. It never leaves the feed, so a
//                                post with no permalink still gets engaged.
//   otherwise                  — strategist mode. Search content by keyword,
//                                have the server pick the one post worth a
//                                response, open it, and comment there.

/**
 * Execute one task.
 *
 * @param {{taskId: string, kind: string, payload: object}} task
 * @param {object} ctx  Helpers borrowed from the service worker so timing,
 *                      session handling and logging behave identically to the
 *                      job-automation and lead-gen loops.
 * @returns {Promise<{ok: boolean, result?: object, error?: string, signal?: string}>}
 */
export async function runTask(task, ctx) {
  const { kind } = task;

  const tab = await ctx.ensureLinkedInTab();
  if (!tab?.id) {
    return { ok: false, error: "Could not open a LinkedIn tab" };
  }

  if (!(await ctx.ensureSessionHealthy(tab.id))) {
    return { ok: false, error: "session lost", signal: "session lost" };
  }

  const wantsFeed = task.payload?.source === "feed";

  switch (kind) {
    case "comment_on_feed":
      return wantsFeed
        ? sweepFeed(task, tab.id, ctx, { withComment: true })
        : engageSearchPost(task, tab.id, ctx, { withComment: true });
    case "like_post":
      return wantsFeed
        ? sweepFeed(task, tab.id, ctx, { withComment: false })
        : engageSearchPost(task, tab.id, ctx, { withComment: false });
    case "view_target_profile":
      return viewProfile(task, tab.id, ctx);
    default:
      return { ok: false, error: `No handler for task kind "${kind}"` };
  }
}

// ── Reading time ────────────────────────────────────────────────────────────

/**
 * How long to sit on a post before doing anything to it.
 *
 * Scaled to its actual length, because a fixed dwell on every post regardless
 * of size is one of the easier automation patterns to spot, and because the
 * comment is supposed to be a response to something that was actually read.
 */
function readingTimeMs(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  const estimate = 6000 + words * 220;
  return Math.max(8000, Math.min(42000, estimate));
}

// ── Feed mode: work down the feed, engaging every post on it ────────────────

/**
 * How long one pass may run before it reports what it has and stops.
 *
 * The server reclaims a dispatched task after 15 minutes. Stopping short of
 * that means a long sweep's work gets recorded instead of being requeued and
 * repeated — which on LinkedIn would mean commenting twice on the same posts.
 */
const SWEEP_TIME_BUDGET_MS = 11 * 60 * 1000;

/**
 * How many reloads in a row may come back with nothing new before the pass
 * gives up.
 *
 * One empty load does not mean the feed is exhausted — LinkedIn renders a
 * different slice on each load, so the next one usually has more. Only a run
 * of empty loads means there is genuinely nothing left to work right now.
 */
const EMPTY_ROUNDS_BEFORE_STOPPING = 3;

/**
 * One pass over the home feed.
 *
 * Reads the feed, drops what the server has already been through, then walks
 * the rest in feed order. Every remaining post gets liked and — on a comment
 * task — commented on. The only thing that stops the walk early is the
 * server's per-pass cap, which is set from the day's remaining budget, or
 * LinkedIn pushing back.
 *
 * All of it happens on the feed page. Opening each post's permalink was what
 * the old flow did, and it both doubled the page loads and made the whole
 * thing dependent on a permalink that LinkedIn's redesigned feed frequently
 * does not render.
 */
async function sweepFeed(task, tabId, ctx, { withComment }) {
  const { taskId, payload } = task;

  // 0 means no cap: keep going until the time budget or the user stops the
  // agent. Anything else is the slice of the day's budget this pass was given.
  const cap = payload.maxEngagements > 0 ? payload.maxEngagements : Infinity;

  const engagements = [];
  const startedAt = Date.now();
  let lastError = null;
  let emptyRounds = 0;

  for (let round = 0; engagements.length < cap; round++) {
    if (Date.now() - startedAt > SWEEP_TIME_BUDGET_MS) break;

    // Every round is a fresh load of the feed. Reloading is what gets new
    // posts once the ones on screen have all been worked — LinkedIn reorders
    // and refills the feed on each load, so this is the "start again from the
    // top" the pass needs in order to keep going indefinitely.
    await ctx.navigateAndWait(tabId, "https://www.linkedin.com/feed/");
    if (!(await ctx.ensureSessionHealthy(tabId))) {
      return finishSweep(engagements, { signal: "session lost" });
    }

    // Let the feed settle, and look at it the way a person opening LinkedIn does
    await ctx.randomDelay(4000, 9000);

    let scraped = [];
    try {
      const res = await ctx.sendToContentScript(tabId, {
        type: "EXECUTE_ACTION",
        command: "SCRAPE_FEED_POSTS",
        actionId: `autopilot-feed-${taskId}-${round}`,
        maxPosts: payload.postsPerSweep || 25,
      });
      scraped = res?.data?.posts || [];
    } catch (e) {
      lastError = `Could not read the feed: ${e.message}`;
      break;
    }

    ctx.emitLog("info", "autopilot", `Read ${scraped.length} posts off the feed`);

    // The server owns dedupe: it is the only side that knows what has already
    // been acted on, across every round, every pass and every session.
    let queue = [];
    if (scraped.length > 0) {
      try {
        const res = await ctx.apiCall("/api/autopilot/generate", {
          taskId,
          action: "unseen_posts",
          source: "feed",
          limit: cap === Infinity ? 0 : Math.max(1, cap - engagements.length),
          posts: scraped.slice(0, 40).map(summarise),
        });
        queue = res?.posts || [];
      } catch (e) {
        lastError = `Could not check which posts are new: ${e.message}`;
        break;
      }
    }

    if (queue.length === 0) {
      // Nothing new on this load. Give the feed a few more chances to turn
      // over before concluding it really has run dry — it usually has more
      // behind it, just not on this render.
      emptyRounds++;
      ctx.emitLog(
        "info",
        "autopilot",
        `Nothing new on the feed this time (${emptyRounds}/${EMPTY_ROUNDS_BEFORE_STOPPING})`
      );
      if (emptyRounds >= EMPTY_ROUNDS_BEFORE_STOPPING) break;
      await ctx.randomDelay(20000, 45000);
      continue;
    }

    emptyRounds = 0;
    ctx.emitLog(
      "info",
      "autopilot",
      `${queue.length} of them are new — working through all of them`
    );

    for (const [index, post] of queue.entries()) {
      if (engagements.length >= cap) break;

      // The server reclaims a task it has heard nothing about for 15 minutes,
      // so a long pass has to stop and report before that rather than have its
      // work thrown away and redone. Whatever is left is still on the feed for
      // the next pass.
      if (Date.now() - startedAt > SWEEP_TIME_BUDGET_MS) {
        ctx.emitLog(
          "info",
          "autopilot",
          `Out of time for this pass at ${index} of ${queue.length} — the rest will come round again`
        );
        break;
      }

      if (!(await ctx.ensureSessionHealthy(tabId))) {
        return finishSweep(engagements, { signal: "session lost" });
      }

      const readMs = readingTimeMs(post.postContent);
      ctx.emitLog(
        "info",
        "autopilot",
        `Post ${index + 1}/${queue.length} by ${post.authorName || "someone"} — reading (${Math.round(readMs / 1000)}s)`
      );
      await ctx.randomDelay(readMs * 0.9, readMs * 1.1);

      const outcome = await engageOnePost(post, task, tabId, ctx, { withComment });
      engagements.push(outcome);

      if (outcome.signal) return finishSweep(engagements, { signal: outcome.signal });
      if (outcome.error && !outcome.liked && !outcome.commented) lastError = outcome.error;

      // Space the posts out. Back to back engagement down a feed is the single
      // most obvious automation signature there is.
      if (index < queue.length - 1) {
        await ctx.randomDelay(12000, 40000);
      }
    }
  }

  return finishSweep(engagements, { error: lastError });
}

/** Roll a pass's per-post outcomes into one task result. */
function finishSweep(engagements, { signal, error } = {}) {
  const acted = engagements.filter((e) => e.liked || e.commented);

  if (acted.length === 0) {
    if (signal) return { ok: false, error: signal, signal };
    return {
      ok: true,
      result: {
        skipped: true,
        source: "feed",
        engagements,
        reason:
          error ||
          (engagements.length === 0
            ? "I have already been through everything the feed is showing me"
            : "Could not act on anything the feed showed me"),
      },
    };
  }

  // Anything that went wrong after at least one real engagement is reported in
  // the per-post detail rather than failing the task — the work that landed
  // has to be recorded, or the budget counters drift and it gets redone.
  return {
    ok: true,
    result: {
      source: "feed",
      engagements,
      engaged: acted.length,
      liked: acted.some((e) => e.liked),
      commented: acted.filter((e) => e.commented).length,
      ...(signal ? { partial: signal } : {}),
    },
  };
}

/** Like, and optionally comment on, one card of the feed. */
async function engageOnePost(post, task, tabId, ctx, { withComment }) {
  const { taskId, payload } = task;
  const base = {
    source: "feed",
    postUrl: post.postUrl,
    postKey: post.postKey,
    authorName: post.authorName,
    authorHeadline: post.authorHeadline,
  };

  let comment = "";
  let generated = null;

  if (withComment) {
    try {
      generated = await ctx.apiCall("/api/autopilot/generate", {
        taskId,
        action: "comment",
        source: "feed",
        // Feed mode is coverage, not curation: the server is told to write
        // something for every post rather than judge whether to bother.
        force: true,
        pitchOnJobPosts: payload.pitchOnJobPosts !== false,
        post: {
          postUrl: post.postUrl,
          postContent: (post.postContent || "").slice(0, 4000),
          authorName: post.authorName || "",
          authorHeadline: post.authorHeadline || "",
        },
      });
      comment = generated?.comment || "";
    } catch (e) {
      // A post we cannot write for still gets a like — dropping it entirely
      // would leave a visible gap in a pass whose whole point is coverage.
      ctx.emitLog("warn", "autopilot", `No comment written for this one: ${e.message}`);
    }
  }

  try {
    const res = await ctx.sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "ENGAGE_FEED_POST",
      actionId: `autopilot-engage-${taskId}-${post.postKey}`,
      postKey: post.postKey,
      comment,
      // A like-only pass always likes. A comment pass likes as well unless the
      // server turned that pairing off.
      alsoLike: !withComment || payload.alsoLike !== false,
    });
    const data = res?.data || {};

    return {
      ...base,
      liked: Boolean(data.liked || data.alreadyLiked),
      commented: Boolean(data.commented),
      comment: data.commented ? comment : undefined,
      postType: generated?.postType,
      angle: generated?.angle,
      isPitch: Boolean(generated?.isPitch),
      error: data.error || data.likeError,
    };
  } catch (e) {
    return { ...base, liked: false, commented: false, error: `Engagement failed: ${e.message}` };
  }
}

/** Trim a scraped post down to what the server needs to identify it. */
function summarise(p) {
  return {
    postKey: p.postKey || p.postUrl || "",
    postUrl: p.postUrl || "",
    postContent: (p.postContent || "").slice(0, 2000),
    authorName: p.authorName || "",
    authorHeadline: p.authorHeadline || "",
  };
}

// ── Strategist mode: search, pick one post, engage it on its permalink ──────

async function engageSearchPost(task, tabId, ctx, { withComment }) {
  const { taskId, payload } = task;

  const gathered = await gatherFromSearch(task, tabId, ctx);
  if (gathered.error) return gathered.error;
  const posts = gathered.posts;

  if (posts.length === 0) {
    return {
      ok: true,
      result: {
        skipped: true,
        source: "search",
        reason: `No posts found for "${payload.keyword || ""}"`,
      },
    };
  }

  ctx.emitLog("info", "autopilot", `Read ${posts.length} posts off the search results`);

  // Ask the server which one to act on (it also filters ones already used)
  let chosen = null;
  try {
    const pick = await ctx.apiCall("/api/autopilot/generate", {
      taskId,
      action: "pick_post",
      source: "search",
      posts: posts.slice(0, 30).map(summarise),
    });
    chosen = pick?.post || null;
    if (!chosen) {
      return {
        ok: true,
        result: {
          skipped: true,
          source: "search",
          reason: pick?.reason || "Nothing worth engaging with",
        },
      };
    }
  } catch (e) {
    return { ok: false, error: `Post selection failed: ${e.message}` };
  }

  // Open the post itself and spend real time on it
  await ctx.navigateAndWait(tabId, chosen.postUrl);
  if (!(await ctx.ensureSessionHealthy(tabId))) {
    return { ok: false, error: "session lost", signal: "session lost" };
  }

  const readMs = readingTimeMs(chosen.postContent);
  ctx.emitLog("info", "autopilot", `Reading the post (${Math.round(readMs / 1000)}s)`);
  await ctx.randomDelay(readMs * 0.9, readMs * 1.1);

  try {
    await ctx.sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "SIMULATE_BROWSING",
      actionId: `autopilot-browse-${taskId}`,
      duration: 3000 + Math.random() * 5000,
    });
  } catch {
    // Scroll simulation is cosmetic — never fail a task over it
  }

  const base = {
    source: "search",
    postUrl: chosen.postUrl,
    authorName: chosen.authorName,
    authorHeadline: chosen.authorHeadline,
    keyword: payload.keyword,
  };

  // Like only
  if (!withComment) {
    const like = await likeCurrentPost(taskId, tabId, ctx);
    if (like.error) return { ok: false, error: like.error };
    return {
      ok: true,
      result: {
        ...base,
        liked: like.liked,
        skipped: like.alreadyLiked,
        reason: like.alreadyLiked ? "Already liked" : undefined,
      },
    };
  }

  // Ask the server what to say. Strategist mode is allowed to come back with
  // "say nothing" — there, the comment is judged against a goal and a generic
  // one is worse than silence.
  let generated;
  try {
    generated = await ctx.apiCall("/api/autopilot/generate", {
      taskId,
      action: "comment",
      source: "search",
      post: {
        postUrl: chosen.postUrl,
        postContent: (chosen.postContent || "").slice(0, 4000),
        authorName: chosen.authorName || "",
        authorHeadline: chosen.authorHeadline || "",
      },
    });
  } catch (e) {
    // A 422 here means the model produced boilerplate. Skipping is the correct
    // outcome — posting "Great post!" is worse than posting nothing.
    return {
      ok: true,
      result: { ...base, skipped: true, reason: `No usable comment written: ${e.message}` },
    };
  }

  if (generated?.skip || !generated?.comment) {
    return {
      ok: true,
      result: {
        ...base,
        skipped: true,
        postType: generated?.postType,
        reason: generated?.reason || "Nothing worth adding here",
      },
    };
  }

  // Like before commenting, the way a person does when a post lands.
  let liked = false;
  if (payload.alsoLike !== false) {
    const like = await likeCurrentPost(taskId, tabId, ctx);
    liked = Boolean(like.liked || like.alreadyLiked);
    await ctx.randomDelay(1500, 4000);
  }

  try {
    const res = await ctx.sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "COMMENT_ON_POST",
      actionId: `autopilot-comment-${taskId}`,
      selector: null,
      comment: generated.comment,
    });
    const data = res?.data || {};
    if (!data.commented) {
      return { ok: false, error: data.error || "Could not post the comment" };
    }
  } catch (e) {
    return { ok: false, error: `Comment failed: ${e.message}` };
  }

  return {
    ok: true,
    result: {
      ...base,
      liked,
      comment: generated.comment,
      postType: generated.postType,
      angle: generated.angle,
      isPitch: Boolean(generated.isPitch),
    },
  };
}

/** Strategist mode: search recent content for the task's keyword. */
async function gatherFromSearch(task, tabId, ctx) {
  const { taskId, payload } = task;
  const keyword = payload.keyword || "";
  if (!keyword) return { error: { ok: false, error: "No keyword in payload" } };

  const searchUrl =
    `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}&sortBy=date_posted`;
  await ctx.navigateAndWait(tabId, searchUrl);

  if (!(await ctx.ensureSessionHealthy(tabId))) {
    return { error: { ok: false, error: "session lost", signal: "session lost" } };
  }

  // Read the results the way a person would before acting on anything
  await ctx.randomDelay(3000, 8000);

  try {
    const res = await ctx.sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "SCRAPE_KEYWORD_POSTS",
      actionId: `autopilot-scrape-${taskId}`,
      keyword,
    });
    return { posts: res?.data?.posts || [] };
  } catch (e) {
    return { error: { ok: false, error: `Could not scrape posts: ${e.message}` } };
  }
}

// ── Liking ──────────────────────────────────────────────────────────────────

/**
 * Like the post currently open in the tab.
 *
 * Returns rather than throws so a failed like never sinks a comment that was
 * otherwise ready to post.
 */
async function likeCurrentPost(taskId, tabId, ctx) {
  try {
    const res = await ctx.sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "LIKE_POST",
      actionId: `autopilot-like-${taskId}`,
    });
    const data = res?.data || {};
    if (!data.liked && !data.alreadyLiked) {
      return { liked: false, error: data.error || "Like button not found" };
    }
    return { liked: Boolean(data.liked), alreadyLiked: Boolean(data.alreadyLiked) };
  } catch (e) {
    return { liked: false, error: `Like failed: ${e.message}` };
  }
}

// ── Prospecting: view a target's profile ────────────────────────────────────

async function viewProfile(task, tabId, ctx) {
  const { taskId, payload } = task;
  if (!payload.profileUrl) return { ok: false, error: "No profileUrl in payload" };

  await ctx.navigateAndWait(tabId, payload.profileUrl);
  if (!(await ctx.ensureSessionHealthy(tabId))) {
    return { ok: false, error: "session lost", signal: "session lost" };
  }

  // The view only registers as real if it looks like a real read
  await ctx.randomDelay(5000, 15000);

  let profile = {};
  try {
    const res = await ctx.sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "SCRAPE_USER_PROFILE",
      actionId: `autopilot-profile-${taskId}`,
    });
    // SCRAPE_USER_PROFILE nests its payload one level down.
    profile = res?.data?.profileData || res?.data || {};
  } catch {
    // The view is the point; the scrape is a bonus
  }

  return {
    ok: true,
    result: {
      targetId: payload.targetId,
      profileUrl: payload.profileUrl,
      name: profile.name || payload.name || "",
      headline: profile.headline || "",
    },
  };
}
