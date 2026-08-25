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

// ── Engagement: find a post worth acting on, then comment or like it ────────

async function engagePost(task, tabId, ctx, { withComment }) {
  const { taskId, payload } = task;
  const keyword = payload.keyword || "";
  if (!keyword) return { ok: false, error: "No keyword in payload" };

  // 1. Search recent content for the keyword
  const searchUrl =
    `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}&sortBy=date_posted`;
  await ctx.navigateAndWait(tabId, searchUrl);

  if (!(await ctx.ensureSessionHealthy(tabId))) {
    return { ok: false, error: "session lost", signal: "session lost" };
  }

  // Read the results the way a person would before acting on anything
  await ctx.randomDelay(3000, 8000);

  let posts = [];
  try {
    const res = await ctx.sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "SCRAPE_KEYWORD_POSTS",
      actionId: `autopilot-scrape-${taskId}`,
      keyword,
    });
    posts = res?.data?.posts || [];
  } catch (e) {
    return { ok: false, error: `Could not scrape posts: ${e.message}` };
  }

  if (posts.length === 0) {
    return {
      ok: true,
      result: { skipped: true, reason: `No posts found for "${keyword}"`, keyword },
    };
  }

  ctx.emitLog("info", "autopilot", `Found ${posts.length} posts for "${keyword}"`);

  // 2. Ask the server which one is worth it (it also filters ones already used)
  let chosen = null;
  try {
    const pick = await ctx.apiCall("/api/autopilot/generate", {
      taskId,
      action: "pick_post",
      posts: posts.slice(0, 15).map((p) => ({
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
          reason: pick?.reason || "Nothing worth engaging with",
          keyword,
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

  const readMs = 6000 + Math.random() * 14000;
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

  // 4a. Like only
  if (!withComment) {
    try {
      const res = await ctx.sendToContentScript(tabId, {
        type: "EXECUTE_ACTION",
        command: "LIKE_POST",
        actionId: `autopilot-like-${taskId}`,
      });
      const data = res?.data || {};
      if (!data.liked && !data.alreadyLiked) {
        return { ok: false, error: data.error || "Like button not found" };
      }
      return {
        ok: true,
        result: {
          skipped: Boolean(data.alreadyLiked),
          reason: data.alreadyLiked ? "Already liked" : undefined,
          postUrl: chosen.postUrl,
          authorName: chosen.authorName,
          keyword,
        },
      };
    } catch (e) {
      return { ok: false, error: `Like failed: ${e.message}` };
    }
  }

  // 4b. Ask the server for the comment text
  let comment = "";
  try {
    const gen = await ctx.apiCall("/api/autopilot/generate", {
      taskId,
      action: "comment",
      post: {
        postUrl: chosen.postUrl,
        postContent: (chosen.postContent || "").slice(0, 2000),
        authorName: chosen.authorName || "",
        authorHeadline: chosen.authorHeadline || "",
      },
    });
    comment = gen?.comment || "";
  } catch (e) {
    // A 422 here means the model produced boilerplate. Skipping is the correct
    // outcome — posting "Great post!" is worse than posting nothing.
    return {
      ok: true,
      result: { skipped: true, reason: `No usable comment written: ${e.message}`, keyword },
    };
  }

  if (!comment) {
    return { ok: true, result: { skipped: true, reason: "Empty comment returned", keyword } };
  }

  // 5. Post it
  try {
    const res = await ctx.sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "COMMENT_ON_POST",
      actionId: `autopilot-comment-${taskId}`,
      commentText: comment,
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
      postUrl: chosen.postUrl,
      authorName: chosen.authorName,
      authorHeadline: chosen.authorHeadline,
      comment,
      keyword,
    },
  };
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
    profile = res?.data || {};
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
