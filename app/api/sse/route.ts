/**
 * Server-Sent Events (SSE) Endpoint
 * Fallback real-time communication channel when WebSocket is unavailable.
 * Streams notification events and extension status updates to the dashboard.
 */

import { NextResponse } from "next/server";
import { getActorId } from "@/lib/utils/get-actor-id";

// userId -> Set of AbortControllers for active SSE connections
const activeStreams = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Push an event to all active SSE streams for a user.
 * Can be called from other API routes or the WebSocket server.
 */
export function pushSseEvent(
  userId: string,
  event: string,
  data: Record<string, unknown>
) {
  const controllers = activeStreams.get(userId);
  if (!controllers || controllers.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\nid: ${Date.now()}\n\n`;
  const encoded = new TextEncoder().encode(payload);

  for (const controller of controllers) {
    try {
      controller.enqueue(encoded);
    } catch {
      // Controller closed, will be cleaned up on stream cancel
    }
  }
}

export async function GET() {
  const actor = await getActorId();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = actor;

  const stream = new ReadableStream({
    start(controller) {
      // Register this controller
      if (!activeStreams.has(userId)) {
        activeStreams.set(userId, new Set());
      }
      activeStreams.get(userId)!.add(controller);

      // Send initial connection event
      const connectMsg = `event: connected\ndata: ${JSON.stringify({ userId, timestamp: Date.now() })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectMsg));

      // Heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          const hb = `event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
          controller.enqueue(new TextEncoder().encode(hb));
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 30_000);

      // Cleanup when stream is cancelled (client disconnects)
      const cleanup = () => {
        clearInterval(heartbeatInterval);
        const controllers = activeStreams.get(userId);
        if (controllers) {
          controllers.delete(controller);
          if (controllers.size === 0) {
            activeStreams.delete(userId);
          }
        }
      };

      // Store cleanup function for use in cancel
      (controller as unknown as Record<string, () => void>).__cleanup = cleanup;
    },
    cancel(controller) {
      const cleanup = (controller as unknown as Record<string, () => void>).__cleanup;
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering for SSE
    },
  });
}
