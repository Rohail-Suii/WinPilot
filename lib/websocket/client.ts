/**
 * WebSocket Client Utility for Dashboard
 * React hook that connects to the /dashboard namespace and integrates
 * with Zustand stores for extension status and notifications.
 *
 * Uses a shared singleton socket so multiple components can call useWebSocket()
 * without creating duplicate connections.
 */

"use client";

import { useEffect, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { useSession } from "next-auth/react";
import { useExtensionStore, useNotificationStore } from "@/lib/hooks/use-stores";
import { WS_EVENTS, type SseEventType } from "@/lib/websocket/types";

// ─── Shared Singleton State ────────────────────────────

let sharedSocket: Socket | null = null;
let subscriberCount = 0;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let currentUserId: string | null = null;

const MAX_RECONNECT_ATTEMPTS = 10;

function setupEventListeners(socket: Socket) {
  const events: SseEventType[] = [
    "extension:connected",
    "extension:disconnected",
    "task:start",
    "task:progress",
    "task:complete",
    "task:error",
    "job:found",
    "job:applying",
    "job:applied",
    "post:scheduled",
    "post:published",
    "scraper:result",
    "scraper:complete",
    "limit:warning",
    "limit:reached",
    "safety:alert",
  ];

  for (const event of events) {
    socket.on(event, (data: Record<string, unknown>) => {
      const store = useExtensionStore.getState();
      const notifStore = useNotificationStore.getState();

      switch (event) {
        case "extension:connected":
          store.setConnected(true);
          break;
        case "extension:disconnected":
          store.setConnected(false);
          store.setCurrentTask(null);
          break;
        case "task:start":
          store.setCurrentTask(data.label as string || "Running task...");
          break;
        case "task:progress":
          if (data.message) store.setCurrentTask(data.message as string);
          break;
        case "task:complete":
        case "task:error":
          store.setCurrentTask(null);
          break;
        case "limit:warning":
        case "limit:reached":
        case "safety:alert":
          notifStore.addNotification({
            _id: `ws-${Date.now()}`,
            type: event === "safety:alert" ? "safety_warning" : "limit_warning",
            title: data.title as string || event,
            message: data.message as string || "",
            module: data.module as string,
            read: false,
            createdAt: new Date().toISOString(),
          });
          break;
      }
    });
  }
}

function connectSharedSocket(userId: string) {
  if (sharedSocket?.connected && currentUserId === userId) return;

  // Clean up any existing socket
  if (sharedSocket) {
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
    sharedSocket = null;
  }

  currentUserId = userId;

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";
  const socket = io(`${wsUrl}/dashboard`, {
    path: "/api/ws",
    transports: ["websocket", "polling"],
    reconnection: false, // We handle reconnection manually
    timeout: 10_000,
  });

  socket.on("connect", () => {
    console.log("[LinkedBoost Dashboard] Socket.IO connected");
    reconnectAttempt = 0;
    socket.emit(WS_EVENTS.AUTH, { token: userId });
  });

  socket.on(WS_EVENTS.AUTH_SUCCESS, (data: { extensionConnected?: boolean }) => {
    console.log("[LinkedBoost Dashboard] Authenticated, extensionConnected:", data.extensionConnected);
    if (data.extensionConnected !== undefined) {
      useExtensionStore.getState().setConnected(data.extensionConnected);
    }
  });

  setupEventListeners(socket);

  socket.on("disconnect", (reason) => {
    console.log("[LinkedBoost Dashboard] Socket.IO disconnected, reason:", reason);
    // Only reconnect if still subscribed and not a client-initiated disconnect
    if (subscriberCount > 0 && reason !== "io client disconnect") {
      scheduleReconnect();
    }
  });

  socket.on("connect_error", (err) => {
    console.log("[LinkedBoost Dashboard] Socket.IO connect error:", err.message);
    if (subscriberCount > 0) {
      scheduleReconnect();
    }
  });

  sharedSocket = socket;
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) return;

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 32_000);
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    if (currentUserId && subscriberCount > 0) {
      connectSharedSocket(currentUserId);
    }
  }, delay);
}

function disconnectSharedSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (sharedSocket) {
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
    sharedSocket = null;
  }
  currentUserId = null;
  reconnectAttempt = 0;
}

// ─── Connection Hook ───────────────────────────────────

export function useWebSocket() {
  const { data: session } = useSession();

  useEffect(() => {
    subscriberCount++;

    if (session?.user?.id) {
      connectSharedSocket(session.user.id);
    }

    return () => {
      subscriberCount--;
      if (subscriberCount <= 0) {
        subscriberCount = 0;
        disconnectSharedSocket();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const sendCommand = useCallback((action: Record<string, unknown>) => {
    if (sharedSocket?.connected) {
      sharedSocket.emit("EXECUTE_ACTION", action);
    }
  }, []);

  const startAutomation = useCallback((searchId: string) => {
    if (sharedSocket?.connected) {
      sharedSocket.emit("EXECUTE_ACTION", { type: "START_AUTOMATION", searchId });
    }
  }, []);

  const stopAutomation = useCallback(() => {
    if (sharedSocket?.connected) {
      sharedSocket.emit("EXECUTE_ACTION", { type: "STOP_AUTOMATION" });
    }
  }, []);

  return {
    isConnected: sharedSocket?.connected ?? false,
    sendCommand,
    startAutomation,
    stopAutomation,
    reconnect: () => {
      if (currentUserId) {
        reconnectAttempt = 0;
        connectSharedSocket(currentUserId);
      }
    },
  };
}
