/**
 * Shared in-memory SSE stream registry.
 * All server-side route handlers in the same Node.js process share this map,
 * allowing any route to push events to connected dashboard clients.
 */

const activeStreams = new Map<string, Set<ReadableStreamDefaultController>>();

export function pushSseEvent(
  userId: string,
  event: string,
  data: Record<string, unknown>
): void {
  const controllers = activeStreams.get(userId);
  if (!controllers || controllers.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\nid: ${Date.now()}\n\n`;
  const encoded = new TextEncoder().encode(payload);

  for (const controller of controllers) {
    try {
      controller.enqueue(encoded);
    } catch {
      // Controller already closed; removed on stream cancel
    }
  }
}

export function registerSseStream(
  userId: string,
  controller: ReadableStreamDefaultController
): void {
  if (!activeStreams.has(userId)) {
    activeStreams.set(userId, new Set());
  }
  activeStreams.get(userId)!.add(controller);
}

export function unregisterSseStream(
  userId: string,
  controller: ReadableStreamDefaultController
): void {
  const controllers = activeStreams.get(userId);
  if (controllers) {
    controllers.delete(controller);
    if (controllers.size === 0) {
      activeStreams.delete(userId);
    }
  }
}
