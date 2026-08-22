/**
 * WebSocket Server for Extension ↔ Dashboard Communication
 * Uses Socket.IO for the dashboard and raw WebSocket (ws) for the browser extension.
 */

import { Server as SocketIOServer, type Namespace, type Socket } from "socket.io";
import { WebSocketServer, WebSocket as RawWebSocket } from "ws";
import type { Server as HTTPServer } from "http";
import type { IncomingMessage } from "http";

// ─── Event Type Definitions ────────────────────────────

export type ExtensionEvent =
  | "extension:connected"
  | "extension:disconnected"
  | "task:start"
  | "task:progress"
  | "task:complete"
  | "task:error"
  | "job:found"
  | "job:applying"
  | "job:applied"
  | "post:scheduled"
  | "post:published"
  | "scraper:result"
  | "scraper:complete"
  | "limit:warning"
  | "limit:reached"
  | "safety:alert"
  | "automation:log"
  | "leadgen:log"
  | "leadgen:progress"
  | "leadgen:comment"
  | "leadgen:complete"
  | "leadgen:error";

export interface WSMessage {
  event: ExtensionEvent;
  data: Record<string, unknown>;
  timestamp: number;
}

interface QueuedMessage extends WSMessage {
  userId: string;
}

// ─── State ─────────────────────────────────────────────

let io: SocketIOServer | null = null;
let extensionNs: Namespace | null = null;
let dashboardNs: Namespace | null = null;
let rawWss: WebSocketServer | null = null;

// Dedicated upgrade path for the raw-WebSocket extension transport. Kept
// distinct from the Socket.IO path (/api/ws) so both can share one HTTP server.
const RAW_WS_PATH = "/ws/extension";

const MAX_QUEUED_PER_USER = 100;
const _HEARTBEAT_TIMEOUT = 60_000; // 60s — mark disconnected if no heartbeat in this window

// userId -> Set of socket IDs (extension sockets — Socket.IO or raw WS)
const extensionSockets = new Map<string, Set<string>>();

// raw WS socket ID -> RawWebSocket instance (for sending commands back to extension)
const rawExtensionConnections = new Map<string, RawWebSocket>();

// userId -> Set of socket IDs (dashboard sockets)
const dashboardSockets = new Map<string, Set<string>>();

// userId -> last heartbeat timestamp
const lastHeartbeat = new Map<string, number>();

// userId -> queued messages (delivered when dashboard reconnects)
const messageQueue = new Map<string, QueuedMessage[]>();

// ─── Helpers ───────────────────────────────────────────

function addSocket(map: Map<string, Set<string>>, userId: string, socketId: string) {
  if (!map.has(userId)) {
    map.set(userId, new Set());
  }
  map.get(userId)!.add(socketId);
}

function removeSocket(map: Map<string, Set<string>>, userId: string, socketId: string) {
  const sockets = map.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      map.delete(userId);
    }
  }
}

function queueMessage(userId: string, message: WSMessage) {
  if (!messageQueue.has(userId)) {
    messageQueue.set(userId, []);
  }
  const queue = messageQueue.get(userId)!;
  queue.push({ ...message, userId });
  // Enforce max queue size
  if (queue.length > MAX_QUEUED_PER_USER) {
    queue.shift();
  }
}

function flushQueue(userId: string) {
  const queue = messageQueue.get(userId);
  if (!queue || queue.length === 0) return;

  const sockets = dashboardSockets.get(userId);
  if (!sockets || sockets.size === 0) return;

  for (const msg of queue) {
    for (const sid of sockets) {
      dashboardNs?.to(sid).emit(msg.event, msg.data);
    }
  }
  messageQueue.delete(userId);
}

// ─── Broadcast to Dashboard ────────────────────────────

function broadcastToDashboard(userId: string, event: ExtensionEvent, data: Record<string, unknown>) {
  const sockets = dashboardSockets.get(userId);
  if (!sockets || sockets.size === 0) {
    // Dashboard offline — queue the message
    queueMessage(userId, { event, data, timestamp: Date.now() });
    return;
  }
  for (const sid of sockets) {
    dashboardNs?.to(sid).emit(event, data);
  }
}

// ─── Public API ────────────────────────────────────────

export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Origins permitted to open a Socket.IO connection.
 * Always includes the deployed app origin, any extra origins listed in
 * WS_ALLOWED_ORIGINS (comma-separated), localhost for dev, and every
 * chrome-extension:// origin (extension IDs differ per install).
 */
function allowedOrigins(): (string | RegExp)[] {
  const extra = (process.env.WS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const origins = [
    process.env.NEXTAUTH_URL,
    ...extra,
    "http://localhost:3000",
    "https://www.linkedin.com",
  ].filter(Boolean) as string[];

  return [...new Set(origins), /^chrome-extension:\/\/.+$/];
}

export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    path: "/api/ws",
    cors: {
      origin: allowedOrigins(),
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingInterval: 25_000,
    pingTimeout: 60_000,
    connectTimeout: 45_000,
  });

  // ── Error handler ──
  io.engine.on("connection_error", (err: { message: string }) => {
    console.error("[WS] Socket.IO connection error:", err.message);
  });

  // ── Extension Namespace (/extension) ──
  extensionNs = io.of("/extension");
  extensionNs.on("connection", (socket: Socket) => {
    let userId: string | null = null;

    socket.on("error", (err) => {
      console.error("[WS] Extension socket error:", err);
    });

    socket.on("AUTH", (data: { token: string }) => {
      if (!data.token) {
        socket.emit("AUTH_FAILURE", { error: "No token provided" });
        return;
      }

      userId = data.token;
      addSocket(extensionSockets, userId, socket.id);
      lastHeartbeat.set(userId, Date.now());

      socket.emit("AUTH_SUCCESS", { message: "Authenticated" });

      // Notify dashboard that extension connected
      broadcastToDashboard(userId, "extension:connected", { timestamp: Date.now() });
    });

    // Extension reports task/job/post/scraper events
    socket.on("REPORT_STATUS", (data: { event: ExtensionEvent; payload: Record<string, unknown> }) => {
      if (!userId) return;
      broadcastToDashboard(userId, data.event, data.payload);
    });

    // Extension profile scrape error — relay to dashboard so the user sees it
    socket.on("PROFILE_SCRAPE_ERROR", (data: { error?: string }) => {
      if (!userId) return;
      broadcastToDashboard(userId, "task:error", {
        message: data.error || "Profile scrape failed. Please try again.",
      });
    });

    socket.on("HEARTBEAT", () => {
      if (userId) {
        lastHeartbeat.set(userId, Date.now());
      }
      socket.emit("HEARTBEAT_ACK", { timestamp: Date.now() });
    });

    socket.on("disconnect", () => {
      if (userId) {
        removeSocket(extensionSockets, userId, socket.id);

        // Only broadcast disconnected if NO extension sockets left for this user
        if (!extensionSockets.has(userId)) {
          broadcastToDashboard(userId, "extension:disconnected", { timestamp: Date.now() });
          lastHeartbeat.delete(userId);
        }
      }
    });
  });

  // ── Dashboard Namespace (/dashboard) ──
  dashboardNs = io.of("/dashboard");
  dashboardNs.on("connection", (socket: Socket) => {
    console.log("[WS] Dashboard client connected:", socket.id);
    let userId: string | null = null;

    socket.on("error", (err) => {
      console.error("[WS] Dashboard socket error:", err);
    });

    // Client sends "auth" (WS_EVENTS.AUTH from types.ts)
    socket.on("auth", (data: { token: string }) => {
      if (!data.token) {
        socket.emit("auth:failure", { error: "No token provided" });
        return;
      }

      userId = data.token;
      addSocket(dashboardSockets, userId, socket.id);
      console.log("[WS] Dashboard authenticated for user:", userId, "extensionConnected:", isExtensionConnected(userId));

      // Client listens for "auth:success" (WS_EVENTS.AUTH_SUCCESS from types.ts)
      socket.emit("auth:success", {
        message: "Authenticated",
        extensionConnected: isExtensionConnected(userId),
      });

      // Flush any queued messages
      flushQueue(userId);
    });

    // Dashboard sends commands to extension
    socket.on("EXECUTE_ACTION", (data: Record<string, unknown>) => {
      if (!userId) return;
      sendToExtension(userId, data);
    });

    socket.on("disconnect", () => {
      if (userId) {
        removeSocket(dashboardSockets, userId, socket.id);
      }
    });
  });

  // ── Legacy default namespace (backward compat) ──
  io.on("connection", (socket: Socket) => {
    let authenticatedUserId: string | null = null;

    socket.on("AUTH", (data: { token: string }) => {
      if (!data.token) {
        socket.emit("AUTH_FAILURE", { error: "No token provided" });
        return;
      }

      authenticatedUserId = data.token;
      addSocket(extensionSockets, authenticatedUserId, socket.id);

      socket.emit("AUTH_SUCCESS", { message: "Authenticated" });
    });

    socket.on("REPORT_STATUS", (data) => {
      if (!authenticatedUserId) return;
      broadcastToDashboard(authenticatedUserId, "task:progress", data as Record<string, unknown>);
    });

    socket.on("HEARTBEAT", () => {
      if (authenticatedUserId) {
        lastHeartbeat.set(authenticatedUserId, Date.now());
      }
      socket.emit("HEARTBEAT_ACK", { timestamp: Date.now() });
    });

    socket.on("disconnect", () => {
      if (authenticatedUserId) {
        removeSocket(extensionSockets, authenticatedUserId, socket.id);
      }
    });
  });

  return io;
}

// ─── Raw WebSocket Server (for browser extension) ────

let rawIdCounter = 0;

export function initRawWebSocketServer(httpServer: HTTPServer): WebSocketServer {
  if (rawWss) return rawWss;

  rawWss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade for the raw-WS extension endpoint only.
  //
  // Socket.IO and Next.js both attach their own "upgrade" listeners to this
  // same server (Socket.IO for /api/ws/, Next.js for /_next/webpack-hmr and
  // Turbopack HMR in dev). We must therefore claim ONLY our own path and leave
  // every other upgrade untouched — grabbing the rest would break HMR and the
  // Socket.IO transport upgrade.
  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const path = (request.url || "").split("?")[0].replace(/\/$/, "");

    if (path !== RAW_WS_PATH) return;

    rawWss!.handleUpgrade(request, socket as never, head as never, (ws) => {
      rawWss!.emit("connection", ws, request);
    });
  });

  rawWss.on("connection", (ws: RawWebSocket) => {
    const socketId = `raw-${++rawIdCounter}`;
    console.log("[WS] Raw extension client connected:", socketId);
    let userId: string | null = null;

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "AUTH": {
            if (!message.token) {
              ws.send(JSON.stringify({ type: "AUTH_FAILURE", error: "No token provided" }));
              return;
            }
            userId = message.token;
            const uid: string = message.token;
            addSocket(extensionSockets, uid, socketId);
            rawExtensionConnections.set(socketId, ws);
            lastHeartbeat.set(uid, Date.now());
            console.log("[WS] Extension authenticated for user:", uid);

            ws.send(JSON.stringify({ type: "AUTH_SUCCESS", message: "Authenticated" }));

            // Notify dashboard that extension connected
            broadcastToDashboard(uid, "extension:connected", { timestamp: Date.now() });
            break;
          }

          case "HEARTBEAT": {
            if (userId) {
              lastHeartbeat.set(userId, Date.now());
            }
            ws.send(JSON.stringify({ type: "HEARTBEAT_ACK", timestamp: Date.now() }));
            break;
          }

          case "REPORT_STATUS": {
            if (!userId) break;
            const { type: _type, ...payload } = message;
            broadcastToDashboard(userId, payload.event || "task:progress", payload);
            break;
          }

          default:
            break;
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      if (userId) {
        removeSocket(extensionSockets, userId, socketId);
        rawExtensionConnections.delete(socketId);

        if (!extensionSockets.has(userId)) {
          broadcastToDashboard(userId, "extension:disconnected", { timestamp: Date.now() });
          lastHeartbeat.delete(userId);
        }
      }
    });

    ws.on("error", () => {
      // Clean up on error
      if (userId) {
        removeSocket(extensionSockets, userId, socketId);
        rawExtensionConnections.delete(socketId);
      }
    });
  });

  return rawWss;
}

/**
 * Send a command to the extension for a specific user
 * Sends via Socket.IO namespace AND raw WebSocket connections
 */
export function sendToExtension(userId: string, action: Record<string, unknown>): boolean {
  const sockets = extensionSockets.get(userId);
  if (!sockets || sockets.size === 0) return false;

  for (const sid of sockets) {
    if (sid.startsWith("raw-")) {
      // Raw WebSocket connection
      const rawWs = rawExtensionConnections.get(sid);
      if (rawWs && rawWs.readyState === RawWebSocket.OPEN) {
        rawWs.send(JSON.stringify({ type: "EXECUTE_ACTION", ...action }));
      }
    } else {
      // Socket.IO connection
      extensionNs?.to(sid).emit("EXECUTE_ACTION", action);
    }
  }
  return true;
}

/**
 * Check if a user's extension is connected.
 *
 * We treat an active extension socket as connected and do not hard-fail on
 * heartbeat freshness here. In MV3 service workers, heartbeat timers can pause
 * during background suspension, which caused false "offline" states in the
 * dashboard even when the extension was still connected.
 */
export function isExtensionConnected(userId: string): boolean {
  const sockets = extensionSockets.get(userId);
  if (!sockets || sockets.size === 0) return false;

  return true;
}

/**
 * Emit a typed event to a user's dashboard
 */
export function emitToDashboard(userId: string, event: ExtensionEvent, data: Record<string, unknown>): void {
  broadcastToDashboard(userId, event, data);
}

/**
 * Get the count of queued messages for a user
 */
export function getQueuedMessageCount(userId: string): number {
  return messageQueue.get(userId)?.length ?? 0;
}

/**
 * Get connection stats (for monitoring)
 */
export function getConnectionStats() {
  return {
    totalExtensionUsers: extensionSockets.size,
    totalDashboardUsers: dashboardSockets.size,
    totalQueuedMessages: Array.from(messageQueue.values()).reduce((sum, q) => sum + q.length, 0),
  };
}
