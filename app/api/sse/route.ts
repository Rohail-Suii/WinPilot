/**
 * Server-Sent Events (SSE) Endpoint
 * Fallback real-time communication channel when WebSocket is unavailable.
 * Streams notification events and extension status updates to the dashboard.
 */

import { NextResponse } from "next/server";
import { getActorId } from "@/lib/utils/get-actor-id";
import { registerSseStream, unregisterSseStream } from "@/lib/sse";

// Re-export so existing callers that imported from this path still work
export { pushSseEvent } from "@/lib/sse";

export async function GET() {
  const actor = await getActorId();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = actor;

  const stream = new ReadableStream({
    start(controller) {
      registerSseStream(userId, controller);

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

      (controller as unknown as Record<string, () => void>).__cleanup = () => {
        clearInterval(heartbeatInterval);
        unregisterSseStream(userId, controller);
      };
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
