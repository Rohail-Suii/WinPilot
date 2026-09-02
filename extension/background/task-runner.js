// WinPilot Autopilot — task runner
//
// The server decides WHAT to do and sends one AgentTask at a time over the
// WebSocket. This module is the executor: it drives the LinkedIn tab through
// the steps that task needs, asks the server for any judgement it cannot make
// locally (which post is worth engaging with, what to actually say), and posts
// the outcome back to /api/autopilot/task-result.
//
// It deliberately owns no decisions of its own beyond timing. Everything that
// needs the user's goal, persona, or history happens server-side.
//
// Engagement tasks arrive from one of two sources, set by the server on the
// payload:
//   payload.source === "feed"  — feed mode. Open the home feed, read down it,
//                                act on the next post the server has not seen.
//   otherwise                  — strategist mode. Search content by keyword.
// Both then follow the same path: open the post, spend real time on it, like
// it, and comment if the task calls for one.

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

  switch (kind) {
    case "comment_on_feed":
      return engagePost(task, tab.id, ctx, { withComment: true });
    case "like_post":
      return engagePost(task, tab.id, ctx, { withComment: false });
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

// ── Engagement: find a post worth acting on, then like and/or comment ───────

async function engagePost(task, tabId, ctx, { withComment }) {
  const { taskId, payload } = task;
  const source = payload.source === "feed" ? "feed" : "search";

  // 1. Get in front of some posts
  const gathered =
    source === "feed"
      ? await gatherFromFeed(task, tabId, ctx)
      : await gatherFromSearch(task, tabId, ctx);

  if (gathered.error) return gathered.error;
  const posts = gathered.posts;

  if (posts.length === 0) {
    return {
      ok: true,
      result: {
        skipped: true,
        source,
        reason:
          source === "feed"
            ? "The feed did not render any posts I could read"
            : `No posts found for "${payload.keyword || ""}"`,
      },
    };
  }

  ctx.emitLog("info", "autopilot", `Read ${posts.length} posts off the ${source}`);

  // 2. Ask the server which one to act on (it also filters ones already used)
  let chosen = null;
  try {
    const pick = await ctx.apiCall("/api/autopilot/generate", {
      taskId,
      action: "pick_post",
      source,
      pitchOnJobPosts: payload.pitchOnJobPosts !== false,
      posts: posts.slice(0, 30).map((p) => ({
        postUrl: p.postUrl || "",
        postContent: (p.postContent || "").slice(0, 2000),
        authorName: p.authorName || "",
        authorHeadline: p.authorHeadline || "",
      })),
    });
    chosen = pick?.post || null;
    if (!chosen) {
      return {
        ok: true,
        result: {
          skipped: true,
          source,
          reason: pick?.reason || "Nothing worth engaging with",
        },
      };
    }
  } catch (e) {
    return { ok: false, error: `Post selection failed: ${e.message}` };
  }

  // 3. Open the post itself and spend real time on it
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
    source,
    postUrl: chosen.postUrl,
    authorName: chosen.authorName,
    authorHeadline: chosen.authorHeadline,
    keyword: payload.keyword,
  };

  // 4a. Like only
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

  // 4b. Ask the server what to say. It classifies the post and may come back
  //     with "say nothing", which is a legitimate answer and not a failure.
  let generated;
  try {
    generated = await ctx.apiCall("/api/autopilot/generate", {
      taskId,
      action: "comment",
      source,
      pitchOnJobPosts: payload.pitchOnJobPosts !== false,
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

  // 5. Like before commenting, the way a person does when a post lands.
  let liked = false;
  if (payload.alsoLike !== false) {
    const like = await likeCurrentPost(taskId, tabId, ctx);
    liked = Boolean(like.liked || like.alreadyLiked);
    await ctx.randomDelay(1500, 4000);
  }

  // 6. Post the comment
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

// ── Gathering posts ─────────────────────────────────────────────────────────

/** Feed mode: open the home feed and read down it. */
async function gatherFromFeed(task, tabId, ctx) {
  const { taskId, payload } = task;

  await ctx.navigateAndWait(tabId, "https://www.linkedin.com/feed/");

  if (!(await ctx.ensureSessionHealthy(tabId))) {
    return { error: { ok: false, error: "session lost", signal: "session lost" } };
  }

  // Let the feed settle, and look at it the way a person opening LinkedIn does
  await ctx.randomDelay(4000, 9000);

  try {
    const res = await ctx.sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "SCRAPE_FEED_POSTS",
      actionId: `autopilot-feed-${taskId}`,
      maxPosts: payload.postsPerSweep || 25,
    });
    return { posts: res?.data?.posts || [] };
  } catch (e) {
    return { error: { ok: false, error: `Could not read the feed: ${e.message}` } };
  }
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
