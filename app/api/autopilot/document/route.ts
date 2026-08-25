/**
 * The strategy document.
 *
 * Renders everything the agent knows and has done — goal, every cycle with its
 * review, all learnings, the full journal, and the pipeline funnel — as one
 * readable markdown document the user can export, archive, or paste elsewhere.
 *
 * `?format=markdown` returns the raw document as a file download; the default
 * JSON shape backs the dashboard's Journal tab.
 */

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/db/connection";
import { getActorId } from "@/lib/utils/get-actor-id";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import AgentConfig from "@/lib/db/models/agent-config";
import AgentGoal from "@/lib/db/models/agent-goal";
import AgentCycle from "@/lib/db/models/agent-cycle";
import AgentJournal from "@/lib/db/models/agent-journal";
import AgentMemory from "@/lib/db/models/agent-memory";
import AgentTarget from "@/lib/db/models/agent-target";

function fmtDate(d?: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

function fmtDateTime(d?: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 16).replace("T", " ");
}

export async function GET(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = actor.id;

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await connectDB();

    const [config, goal, cycles, memories, entries, funnel] = await Promise.all([
      AgentConfig.findOne({ userId }).lean(),
      AgentGoal.findOne({ userId }).lean(),
      AgentCycle.find({ userId }).sort({ weekNumber: 1 }).lean(),
      AgentMemory.find({ userId }).sort({ confidence: -1 }).lean(),
      AgentJournal.find({ userId }).sort({ createdAt: 1 }).limit(2000).lean(),
      AgentTarget.aggregate<{ _id: string; count: number }>([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: "$stage", count: { $sum: 1 } } },
      ]),
    ]);

    const markdown = renderMarkdown({ config, goal, cycles, memories, entries, funnel });

    const { searchParams } = new URL(req.url);
    if (searchParams.get("format") === "markdown") {
      return new NextResponse(markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="winpilot-strategy-${fmtDate(new Date())}.md"`,
        },
      });
    }

    return NextResponse.json({
      markdown,
      counts: {
        cycles: cycles.length,
        memories: memories.length,
        journalEntries: entries.length,
      },
    });
  } catch (error) {
    console.error("[Autopilot/Document] Failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function renderMarkdown(data: {
  config: any;
  goal: any;
  cycles: any[];
  memories: any[];
  entries: any[];
  funnel: { _id: string; count: number }[];
}): string {
  const { config, goal, cycles, memories, entries, funnel } = data;
  const out: string[] = [];

  out.push(`# WinPilot Autopilot — Strategy Document`);
  out.push(`\n> Generated ${fmtDateTime(new Date())}\n`);

  // ── Mission ───────────────────────────────────────────────────────────────
  out.push(`## Mission\n`);
  out.push(config?.mission ? `**${config.mission}**\n` : `_No mission set._\n`);

  if (goal) {
    out.push(`### Goal\n`);
    out.push(`${goal.northStar}\n`);
    out.push(
      `**Success metric:** ${goal.successMetric?.target} ${goal.successMetric?.kind} by ${fmtDate(goal.successMetric?.by)}\n`
    );

    if (goal.subGoals?.length) {
      out.push(`**Sub-goals**\n`);
      for (const sg of goal.subGoals) {
        out.push(`- ${sg.status === "hit" ? "[x]" : "[ ]"} ${sg.text} (${sg.metric}: ${sg.target})`);
      }
      out.push("");
    }

    const c = goal.constraints || {};
    out.push(`**Targeting**\n`);
    out.push(`| Field | Value |`);
    out.push(`|---|---|`);
    out.push(`| Niche | ${(c.niche || []).join(", ") || "—"} |`);
    out.push(`| Roles | ${(c.targetRoles || []).join(", ") || "—"} |`);
    out.push(`| Company size | ${c.targetCompanySizeMin ?? "—"}–${c.targetCompanySizeMax ?? "—"} |`);
    out.push(`| Geographies | ${(c.geographies || []).join(", ") || "—"} |`);
    out.push(`| Excludes | ${(c.excludes || []).join(", ") || "—"} |\n`);
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────
  out.push(`## Pipeline\n`);
  if (funnel.length === 0) {
    out.push(`_No targets yet._\n`);
  } else {
    out.push(`| Stage | Count |`);
    out.push(`|---|---|`);
    const order = [
      "discovered",
      "warming",
      "invited",
      "connected",
      "engaged",
      "dm_sent",
      "in_conversation",
      "opportunity",
      "dormant",
      "rejected",
    ];
    const map = new Map(funnel.map((f) => [f._id, f.count]));
    for (const stage of order) {
      if (map.has(stage)) out.push(`| ${stage} | ${map.get(stage)} |`);
    }
    out.push("");
  }

  // ── Cycles ────────────────────────────────────────────────────────────────
  out.push(`## Weekly cycles\n`);
  if (cycles.length === 0) {
    out.push(`_No cycles yet._\n`);
  }

  for (const cycle of cycles) {
    out.push(`### Week ${cycle.weekNumber} — ${fmtDate(cycle.startsAt)} to ${fmtDate(cycle.endsAt)}`);
    out.push(`_Status: ${cycle.status}${cycle.score != null ? ` · Score: ${cycle.score}/100` : ""}_\n`);
    out.push(`**Strategy**\n\n${cycle.strategy || "—"}\n`);

    const mix = cycle.channelMix || {};
    out.push(
      `**Effort split:** prospecting ${mix.prospecting}% · engagement ${mix.engagement}% · content ${mix.content}% · inbox ${mix.inbox}%\n`
    );

    if (cycle.targets?.length) {
      const actualMap = new Map((cycle.actuals || []).map((a: any) => [a.metric, a.achieved]));
      out.push(`| Metric | Planned | Achieved |`);
      out.push(`|---|---|---|`);
      for (const t of cycle.targets) {
        out.push(`| ${t.metric} | ${t.planned} | ${actualMap.get(t.metric) ?? 0} |`);
      }
      out.push("");
    }

    if (cycle.reviewSummary) out.push(`**Review**\n\n${cycle.reviewSummary}\n`);
    if (cycle.strategyDelta) out.push(`**What changed for the next week**\n\n${cycle.strategyDelta}\n`);
  }

  // ── Learnings ─────────────────────────────────────────────────────────────
  out.push(`## What I have learned\n`);
  if (memories.length === 0) {
    out.push(`_No learnings recorded yet._\n`);
  } else {
    out.push(`| Confidence | Kind | Learning |`);
    out.push(`|---|---|---|`);
    for (const m of memories) {
      out.push(`| ${m.confidence.toFixed(2)} | ${m.kind} | ${m.statement.replace(/\|/g, "\\|")} |`);
    }
    out.push("");
  }

  // ── Journal ───────────────────────────────────────────────────────────────
  out.push(`## Journal\n`);
  if (entries.length === 0) {
    out.push(`_Nothing logged yet._\n`);
  }

  let currentDay = "";
  for (const entry of entries) {
    const day = fmtDate(entry.createdAt);
    if (day !== currentDay) {
      currentDay = day;
      out.push(`\n### ${day}\n`);
    }
    const time = new Date(entry.createdAt).toISOString().slice(11, 16);
    out.push(`**${time} · ${entry.entryType}** — ${entry.text}\n`);
  }

  return out.join("\n");
}
