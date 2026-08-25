/**
 * One-time index reconciliation for the agent collections.
 *
 * Mongoose creates missing indexes on its own but will NOT replace one whose
 * key pattern already exists with different options — it throws
 * IndexOptionsConflict and gives up. `syncIndexes()` drops what the schema no
 * longer declares and rebuilds, which is what actually migrates a changed
 * index on a live database.
 *
 * This exists because the first version of `AgentTask` used a *sparse* compound
 * unique index on `{userId, dedupeKey}`. On a compound index sparse only skips
 * documents missing every indexed field, so every task got indexed with
 * `dedupeKey: null` and each user could hold exactly one key-less task ever —
 * which silently deadlocked the queue. The schema now uses a partial index; this
 * is what gets that change onto an existing deployment.
 *
 * Safe to call repeatedly: once the indexes match the schema, syncIndexes is a
 * no-op. Runs once per process.
 */

import connectDB from "@/lib/db/connection";
import AgentTask from "@/lib/db/models/agent-task";
import AgentTarget from "@/lib/db/models/agent-target";
import AgentThread from "@/lib/db/models/agent-thread";

let done = false;

export async function ensureAutopilotIndexes(): Promise<void> {
  if (done) return;
  done = true;

  try {
    await connectDB();

    // Only the collections with uniqueness constraints that have changed shape.
    const results = await Promise.allSettled([
      AgentTask.syncIndexes(),
      AgentTarget.syncIndexes(),
      AgentThread.syncIndexes(),
    ]);

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      for (const f of failures) {
        console.error("[Autopilot] Index sync failed:", (f as PromiseRejectedResult).reason);
      }
      // Let the next process boot retry rather than pinning a failed state.
      done = false;
      return;
    }

    console.log("[Autopilot] Indexes verified");
  } catch (error) {
    console.error("[Autopilot] Index bootstrap failed:", error);
    done = false;
  }
}
