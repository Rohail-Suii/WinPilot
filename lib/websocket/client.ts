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
    "automation:log",
    "leadgen:log",
    "leadgen:progress",
    "leadgen:comment",
    "leadgen:complete",
    "leadgen:error",
  ];

  function pushLog(
    level: "info" | "warn" | "error" | "success",
    source: "extension" | "api" | "content-script" | "system",
    message: string,
    details?: string,
  ) {
    useExtensionStore.getState().addLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      details,
    });
  }

  function pushLeadGenLog(
    level: "info" | "warn" | "error" | "success",
    source: "extension" | "api" | "content-script" | "system",
    message: string,
    details?: string,
  ) {
    useExtensionStore.getState().addLeadGenLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      details,
    });
  }

  for (const event of events) {
    socket.on(event, (data: Record<string, unknown>) => {
      const store = useExtensionStore.getState();
      const notifStore = useNotificationStore.getState();

      switch (event) {
        case "extension:connected":
          store.setConnected(true);
          pushLog("success", "system", "Extension connected");
          break;
        case "extension:disconnected":
          store.setConnected(false);
          store.setCurrentTask(null);
          store.setAutomationRunning(false);
          pushLog("warn", "system", "Extension disconnected");
          break;
        case "task:start":
          store.setCurrentTask(data.label as string || "Running task...");
          store.setLastTaskError(null);
          store.setAutomationRunning(true);
          pushLog("info", "system", data.label as string || "Task started");
          break;
        case "task:progress":
          if (data.message) store.setCurrentTask(data.message as string);
          pushLog("info", "extension", data.message as string || "Progress update");
          break;
        case "task:complete":
          store.setLastTaskError(null);
          store.setAiQuotaStatus(null);
          store.setCurrentTask(null);
          store.setAutomationRunning(false);
          pushLog("success", "system", data.message as string || "Task complete");
          break;
        case "task:error":
          if (data.message) store.setLastTaskError(data.message as string);
          if (data.aiQuota && typeof data.aiQuota === "object") {
            store.setAiQuotaStatus(data.aiQuota as {
              provider?: string;
              model?: string;
              remaining?: number;
              dailyLimit?: number;
              retryAfterSeconds?: number;
            });
          }
          store.setCurrentTask(null);
          store.setAutomationRunning(false);
          pushLog("error", "extension", data.message as string || "Task error");
          break;
        case "job:found":
          pushLog("info", "extension", data.message as string || `Found ${data.count || 0} jobs (page ${data.page || "?"})`);
          break;
        case "job:applying":
          pushLog("info", "extension", data.message as string || `Applying to ${data.jobTitle || "job"} at ${data.company || "company"}`);
          break;
        case "job:applied":
          pushLog("success", "extension", data.message as string || `Applied to ${data.jobTitle || "job"} at ${data.company || "company"}`);
          break;
        case "automation:log": {
          const level = (data.level as string) || "info";
          const source = (data.source as string) || "extension";
          const validLevel = (["info", "warn", "error", "success"].includes(level) ? level : "info") as "info" | "warn" | "error" | "success";
          const validSource = (["extension", "api", "content-script", "system"].includes(source) ? source : "extension") as "extension" | "api" | "content-script" | "system";
          pushLog(validLevel, validSource, data.message as string || "", data.details as string);
          break;
        }
        // ── Lead generation events ─────────────────────────────────
        case "leadgen:log": {
          const lvl = (data.level as string) || "info";
          const src = (data.source as string) || "extension";
          const vLvl = (["info", "warn", "error", "success"].includes(lvl) ? lvl : "info") as "info" | "warn" | "error" | "success";
          const vSrc = (["extension", "api", "content-script", "system"].includes(src) ? src : "extension") as "extension" | "api" | "content-script" | "system";
          pushLeadGenLog(vLvl, vSrc, data.message as string || "", data.details as string);
          break;
        }
        case "leadgen:progress":
          pushLeadGenLog("info", "extension", data.message as string || "Processing...");
          break;
        case "leadgen:comment":
          pushLeadGenLog("success", "extension", data.message as string || `Commented on post by ${data.postAuthor || "unknown"}`);
          break;
        case "leadgen:complete":
          useExtensionStore.getState().setLeadGenRunning(false);
          pushLeadGenLog("success", "system", data.message as string || "Lead gen run complete");
          break;
        case "leadgen:error":
          useExtensionStore.getState().setLeadGenRunning(false);
          pushLeadGenLog("error", "system", data.message as string || "Lead gen error");
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
          pushLog("warn", "system", data.message as string || event);
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

  // The WebSocket server shares the app's port, so same-origin is the correct
  // default. NEXT_PUBLIC_WS_URL only needs setting when it lives elsewhere.
  const wsUrl =
    process.env.NEXT_PUBLIC_WS_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

  const socket = io(`${wsUrl}/dashboard`, {
    path: "/api/ws",
    transports: ["websocket", "polling"],
    reconnection: false, // We handle reconnection manually
    timeout: 10_000,
  });

  socket.on("connect", () => {
    console.log("[Winpilot Dashboard] Socket.IO connected");
    reconnectAttempt = 0;
    socket.emit(WS_EVENTS.AUTH, { token: userId });
  });

  socket.on(WS_EVENTS.AUTH_SUCCESS, (data: { extensionConnected?: boolean }) => {
    console.log("[Winpilot Dashboard] Authenticated, extensionConnected:", data.extensionConnected);
    if (data.extensionConnected !== undefined) {
      useExtensionStore.getState().setConnected(data.extensionConnected);
    }
  });

  setupEventListeners(socket);

  socket.on("disconnect", (reason) => {
    console.log("[Winpilot Dashboard] Socket.IO disconnected, reason:", reason);
    // Only reconnect if still subscribed and not a client-initiated disconnect
    if (subscriberCount > 0 && reason !== "io client disconnect") {
      scheduleReconnect();
    }
  });

  socket.on("connect_error", (err) => {
    console.log("[Winpilot Dashboard] Socket.IO connect error:", err.message);
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
  }, [session?.user?.id]);

  const sendCommand = useCallback((action: Record<string, unknown>) => {
    if (sharedSocket?.connected) {
      sharedSocket.emit("EXECUTE_ACTION", action);
    }
  }, []);

  const startAutomation = useCallback((
    searchId: string,
    options?: { useAI?: boolean; useJobMatching?: boolean; useAIFormFilling?: boolean; useAutoMessaging?: boolean }
  ) => {
    if (sharedSocket?.connected) {
      sharedSocket.emit("EXECUTE_ACTION", { type: "START_AUTOMATION", searchId, options: options || {} });
    }
  }, []);

  /** Apply to a single job the user pasted a LinkedIn link for. */
  const applyJobUrl = useCallback((
    url: string,
    options?: { useAI?: boolean; useJobMatching?: boolean; useAIFormFilling?: boolean; useAutoMessaging?: boolean }
  ) => {
    if (sharedSocket?.connected) {
      sharedSocket.emit("EXECUTE_ACTION", { type: "APPLY_JOB_URL", url, options: options || {} });
    }
  }, []);

  /** Apply to every job on a results page the user pasted a link for. */
  const applyJobList = useCallback((
    url: string,
    options?: { useAI?: boolean; useJobMatching?: boolean; useAIFormFilling?: boolean; useAutoMessaging?: boolean }
  ) => {
    if (sharedSocket?.connected) {
      sharedSocket.emit("EXECUTE_ACTION", { type: "APPLY_JOB_LIST", url, options: options || {} });
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
    applyJobUrl,
    applyJobList,
    stopAutomation,
    reconnect: () => {
      if (currentUserId) {
        reconnectAttempt = 0;
        connectSharedSocket(currentUserId);
      }
    },
  };
}
