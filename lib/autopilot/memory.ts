/**
 * Durable learnings — the reason week 6 is smarter than week 1.
 *
 * The reviewer distils memories at the end of each cycle. `recall()` folds the
 * highest-confidence ones into every planning and generation prompt, so a
 * lesson learned in week 2 keeps shaping behaviour in week 9 without anyone
 * re-teaching it.
 *
 * Confidence moves in both directions: `reinforce()` when later data confirms a
 * statement, `decay()` when it is contradicted. Memories that fall below the
 * floor stop being recalled and eventually stop mattering, which is how stale
 * tactics retire on their own.
 */

import connectDB from "@/lib/db/connection";
import AgentMemory, {
  type IAgentMemory,
  type MemoryKind,
  type IMemoryEvidence,
} from "@/lib/db/models/agent-memory";

/** Below this, a memory is no longer worth prompt tokens. */
export const RECALL_FLOOR = 0.25;

export interface RememberInput {
  userId: string;
  kind: MemoryKind;
  statement: string;
  evidence?: IMemoryEvidence[];
  confidence?: number;
  sourceCycleId?: string;
  expiresAt?: Date;
}

/**
 * Store a learning. If a near-identical statement already exists it is
 * reinforced instead of duplicated — the agent should not accumulate ten copies
 * of the same insight across ten weeks.
 */
export async function remember(input: RememberInput): Promise<IAgentMemory | null> {
  try {
    await connectDB();

    const statement = input.statement.trim().slice(0, 500);
    if (!statement) return null;

    const existing = await findSimilar(input.userId, statement);
    if (existing) {
      return reinforce(existing._id.toString(), input.evidence);
    }

    return await AgentMemory.create({
      userId: input.userId,
      kind: input.kind,
      statement,
      evidence: input.evidence || [],
      confidence: input.confidence ?? 0.5,
      hitCount: 1,
      lastConfirmedAt: new Date(),
      sourceCycleId: input.sourceCycleId || undefined,
      expiresAt: input.expiresAt,
    });
  } catch (error) {
    console.error("[Autopilot/Memory] remember failed:", error);
    return null;
  }
}

/**
 * Cheap near-duplicate detection: same user, high word overlap.
 * Deliberately not embeddings — this runs on every memory write and the cost of
 * an occasional duplicate is far lower than the cost of an embedding call.
 */
async function findSimilar(
  userId: string,
  statement: string
): Promise<IAgentMemory | null> {
  const candidates = await AgentMemory.find({ userId }).limit(200);
  if (candidates.length === 0) return null;

  const target = tokenSet(statement);
  for (const candidate of candidates) {
    if (jaccard(target, tokenSet(candidate.statement)) >= 0.7) return candidate;
  }
  return null;
}

/**
 * Crude suffix stripping.
 *
 * The reviewer paraphrases: week 2 writes "comments referencing a specific
 * line", week 5 writes "comments which reference a specific line". Without
 * folding those to a common stem the overlap check misses the duplicate and the
 * same insight accumulates a new row every week. This is not linguistics — it
 * only has to make paraphrases of one claim collide.
 */
function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith("ly")) w = w.slice(0, -2);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .map(stem)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Confirmed again by new evidence — raise confidence, asymptotic to 1. */
export async function reinforce(
  memoryId: string,
  evidence?: IMemoryEvidence[]
): Promise<IAgentMemory | null> {
  await connectDB();
  const memory = await AgentMemory.findById(memoryId);
  if (!memory) return null;

  memory.confidence = Math.min(1, memory.confidence + (1 - memory.confidence) * 0.3);
  memory.hitCount += 1;
  memory.lastConfirmedAt = new Date();
  if (evidence?.length) {
    memory.evidence = [...memory.evidence, ...evidence].slice(-20);
  }
  await memory.save();
  return memory;
}

/** Contradicted by new data — halve the distance to zero. */
export async function decay(memoryId: string, factor = 0.5): Promise<void> {
  await connectDB();
  await AgentMemory.findByIdAndUpdate(memoryId, [
    { $set: { confidence: { $multiply: ["$confidence", factor] } } },
  ]);
}

export interface RecallOptions {
  kinds?: MemoryKind[];
  limit?: number;
  minConfidence?: number;
}

/** The highest-confidence learnings, most trusted first. */
export async function recall(
  userId: string,
  options: RecallOptions = {}
): Promise<IAgentMemory[]> {
  await connectDB();

  const filter: Record<string, unknown> = {
    userId,
    confidence: { $gte: options.minConfidence ?? RECALL_FLOOR },
  };
  if (options.kinds?.length) filter.kind = { $in: options.kinds };

  return AgentMemory.find(filter)
    .sort({ confidence: -1, hitCount: -1 })
    .limit(options.limit ?? 15)
    .lean<IAgentMemory[]>();
}

/** Prompt-ready block. Returns a placeholder rather than "" so prompts stay well-formed. */
export async function recallBlock(
  userId: string,
  options: RecallOptions = {}
): Promise<string> {
  const memories = await recall(userId, options);
  if (memories.length === 0) {
    return "(no learnings recorded yet — this is an early cycle)";
  }

  return memories
    .map((m) => `- [${m.kind}, confidence ${m.confidence.toFixed(2)}] ${m.statement}`)
    .join("\n");
}
