/**
 * The agent's living document.
 *
 * Every meaningful decision, action, observation, error and reflection lands
 * here as plain first-person prose. Two audiences read it: the user, on the
 * Journal tab at /dashboard/autopilot, and the planner itself, which re-reads
 * recent entries on restart so it can pick up mid-cycle knowing what it already
 * did and why.
 *
 * Writes are deliberately fire-and-forget: journaling must never be the reason
 * an automation step fails.
 */

import mongoose from "mongoose";
import connectDB from "@/lib/db/connection";
import AgentJournal, {
  type IAgentJournal,
  type JournalEntryType,
  type IJournalRefs,
} from "@/lib/db/models/agent-journal";
import { pushSseEvent } from "@/lib/sse";

export interface JournalInput {
  userId: string;
  cycleId?: string | mongoose.Types.ObjectId | null;
  entryType: JournalEntryType;
  phase?: string;
  text: string;
  refs?: IJournalRefs;
}

/**
 * Append one entry and push it to any open dashboard stream.
 * Returns the created entry, or null if the write failed.
 */
export async function journal(input: JournalInput): Promise<IAgentJournal | null> {
  try {
    await connectDB();

    const entry = await AgentJournal.create({
      userId: input.userId,
      cycleId: input.cycleId || undefined,
      entryType: input.entryType,
      phase: input.phase || "general",
      // The schema caps this at 4000; truncate rather than throw on a long AI answer.
      text: input.text.slice(0, 4000),
      refs: input.refs || {},
    });

    pushSseEvent(input.userId, "autopilot:journal", {
      id: entry._id.toString(),
      entryType: entry.entryType,
      phase: entry.phase,
      text: entry.text,
      refs: entry.refs,
      createdAt: entry.createdAt.toISOString(),
    });

    return entry;
  } catch (error) {
    console.error("[Autopilot/Journal] Write failed:", error);
    return null;
  }
}

/** Most recent entries first — what the dashboard and the planner both read. */
export async function recentJournal(
  userId: string,
  limit = 50,
  cycleId?: string
): Promise<IAgentJournal[]> {
  await connectDB();
  const filter: Record<string, unknown> = { userId };
  if (cycleId) filter.cycleId = cycleId;

  return AgentJournal.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 500))
    .lean<IAgentJournal[]>();
}

/**
 * A compact digest of what happened recently, for injection into planning
 * prompts. Oldest-first so the AI reads it as a timeline.
 */
export async function journalDigest(
  userId: string,
  limit = 30,
  cycleId?: string
): Promise<string> {
  const entries = await recentJournal(userId, limit, cycleId);
  if (entries.length === 0) return "(no journal entries yet — this is the first run)";

  return entries
    .reverse()
    .map((e) => {
      const when = new Date(e.createdAt).toISOString().slice(0, 16).replace("T", " ");
      return `[${when}] ${e.entryType}/${e.phase}: ${e.text}`;
    })
    .join("\n");
}
