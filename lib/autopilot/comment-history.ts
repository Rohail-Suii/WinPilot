/**
 * What this account said recently, so the next comment does not say it again.
 *
 * The agent used to generate every comment in complete isolation — one post in,
 * one comment out, no idea what it had written on the previous forty. With one
 * persona, one prompt and one temperature, that produced a feed of comments
 * that all opened the same way and ran the same length. Read as a sequence they
 * were obviously machine-written, which is the one thing the whole system
 * exists to avoid.
 *
 * This module is the memory. It is deliberately cheap: one indexed read per
 * comment, openings only rather than whole comments, and no model call.
 */

import connectDB from "@/lib/db/connection";
import ActivityLog from "@/lib/db/models/activity-log";
import { sanitizeForAI } from "@/lib/utils";
import { shuffleArray } from "@/lib/anti-detection/patterns";
import type { LengthBand } from "./comment-quality";

/**
 * How far back to look.
 *
 * Enough to cover a sitting at the feed, few enough that the openings block
 * stays a rounding error in the prompt. Not configurable: exposing it would buy
 * the user nothing and cost six more edit sites.
 */
export const RECENT_LIMIT = 15;

/** Task kinds that produce a comment worth remembering. */
const COMMENTING_KINDS = ["comment_on_feed", "engage_target_post"];

export interface RecentComment {
  comment: string;
  angle?: string;
  postType?: string;
}

/**
 * The last comments this account actually posted, newest first.
 *
 * ActivityLog is the only place the comment text is stored as a structured,
 * queryable field. Its `{ userId: 1, module: 1 }` index covers the equality
 * prefix; the sort is in memory, over a collection a 90-day TTL keeps small.
 *
 * Never throws. A Mongo hiccup must cost the variety, not the comment.
 */
export async function recentComments(
  userId: string,
  limit = RECENT_LIMIT
): Promise<RecentComment[]> {
  try {
    await connectDB();

    const rows = await ActivityLog.find({
      userId,
      module: "autopilot",
      action: { $in: COMMENTING_KINDS },
      "details.comment": { $exists: true, $nin: [null, ""] },
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .select("details.comment details.postType details.angle")
      .lean();

    return rows
      .map((row) => {
        const details = (row.details ?? {}) as Record<string, unknown>;
        return {
          comment: String(details.comment ?? ""),
          angle: details.angle ? String(details.angle) : undefined,
          postType: details.postType ? String(details.postType) : undefined,
        };
      })
      .filter((row) => row.comment.trim().length > 0);
  } catch (error) {
    console.warn("[CommentHistory] Could not read recent comments:", error);
    return [];
  }
}

/** The first few words of a comment, which is where the sameness lives. */
function opening(comment: string, words = 6): string {
  return comment
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, words)
    .join(" ");
}

/**
 * Render recent openings for the prompt.
 *
 * Openings rather than whole comments: the opening is the part that repeats,
 * and six words costs about nine tokens against eighty for the full text.
 * Fifteen whole comments would be more than the entire variety feature is
 * allowed to spend.
 *
 * Deduped on the first three words so ten near-identical starts collapse to one
 * line and the block stays informative rather than becoming its own wall of
 * sameness. Sanitised because these strings began life as model output over
 * scraped posts and must not be able to break the block or carry instructions.
 */
export function renderRecentOpenings(recent: RecentComment[], max = 12): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const { comment } of recent) {
    const line = sanitizeForAI(opening(comment)).replace(/\s+/g, " ").trim();
    if (!line) continue;

    const key = line.toLowerCase().split(" ").slice(0, 3).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);

    lines.push(`- ${line}`);
    if (lines.length >= max) break;
  }

  return lines.join("\n");
}

/** Which band a comment that was actually posted fell into. */
function bandOf(comment: string): LengthBand {
  if (comment.length < 60) return "reaction";
  if (comment.length < 140) return "short";
  return "standard";
}

/**
 * The share of comments each band should get over time.
 *
 * Mostly standard, because a feed of one-liners reads as low effort in bulk.
 * Reactions are the strongest single signal that a person is typing, so they
 * have to appear — but a fifth of the time is plenty.
 */
const BAND_TARGET: Record<LengthBand, number> = {
  reaction: 0.2,
  short: 0.35,
  standard: 0.45,
};

const BANDS = Object.keys(BAND_TARGET) as LengthBand[];

/** One band drawn in proportion to the target shares. */
function weightedDraw(): LengthBand {
  const roll = Math.random();
  let cumulative = 0;
  for (const band of BANDS) {
    cumulative += BAND_TARGET[band];
    if (roll < cumulative) return band;
  }
  return "standard";
}

/**
 * Choose how long the next comment should aim to be.
 *
 * Steered by history rather than drawn blind. At a hundred and fifty comments a
 * day an unconditioned coin flip produces visible runs — four one-liners in a
 * row and the account looks broken — so the bands already under-represented in
 * the recent history are the ones in the running.
 *
 * Not perfectly balanced, though: a flawless distribution is its own tell, so
 * one draw in five ignores history entirely.
 *
 * Cost note: this reuses the rows already fetched for anti-repetition, so
 * steering the length costs no extra query.
 */
export function pickLengthBand(recent: RecentComment[]): LengthBand {
  if (recent.length < 3 || Math.random() < 0.2) return weightedDraw();

  const counts: Record<LengthBand, number> = { reaction: 0, short: 0, standard: 0 };
  for (const { comment } of recent) counts[bandOf(comment)] += 1;

  // Anything the recent run has less of than it should. shuffleArray keeps the
  // choice between equally-owed bands from settling into an order of its own.
  const owed = BANDS.filter(
    (band) => counts[band] / recent.length < BAND_TARGET[band]
  );

  return owed.length > 0 ? shuffleArray(owed)[0] : weightedDraw();
}
