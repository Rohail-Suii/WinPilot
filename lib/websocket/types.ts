/**
 * WebSocket Event Types for Real-Time Communication
 *
 * Defines all events exchanged between the extension, dashboard, and server
 * across the /extension and /dashboard namespaces.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum WsNamespace {
  Extension = "/extension",
  Dashboard = "/dashboard",
}

export enum ConnectionStatus {
  Connecting = "connecting",
  Connected = "connected",
  Disconnected = "disconnected",
  Reconnecting = "reconnecting",
  Error = "error",
}

// ---------------------------------------------------------------------------
// Event name constants
// ---------------------------------------------------------------------------

export const WS_EVENTS = {
  // Authentication
  AUTH: "auth",
  AUTH_SUCCESS: "auth:success",
  AUTH_FAILURE: "auth:failure",

  // Extension lifecycle
  EXTENSION_CONNECTED: "extension:connected",
  EXTENSION_DISCONNECTED: "extension:disconnected",

  // Task lifecycle
  TASK_START: "task:start",
  TASK_PROGRESS: "task:progress",
  TASK_COMPLETE: "task:complete",
  TASK_ERROR: "task:error",

  // Job lifecycle
  JOB_FOUND: "job:found",
  JOB_APPLYING: "job:applying",
  JOB_APPLIED: "job:applied",

  // Post lifecycle
  POST_SCHEDULED: "post:scheduled",
  POST_PUBLISHED: "post:published",

  // Scraper events
  SCRAPER_RESULT: "scraper:result",
  SCRAPER_COMPLETE: "scraper:complete",

  // Limit / safety events
  LIMIT_WARNING: "limit:warning",
  LIMIT_REACHED: "limit:reached",
  SAFETY_ALERT: "safety:alert",

  // Automation logs
  AUTOMATION_LOG: "automation:log",

  // Heartbeat
  HEARTBEAT: "heartbeat",
  HEARTBEAT_ACK: "heartbeat:ack",

  // Legacy events (kept for backward compatibility)
  REPORT_STATUS: "REPORT_STATUS",
  ACTION_RESULT: "ACTION_RESULT",
  EXECUTE_ACTION: "EXECUTE_ACTION",

  // Queued messages delivery
  QUEUED_MESSAGES: "queued:messages",
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

// ---------------------------------------------------------------------------
// Payload interfaces
// ---------------------------------------------------------------------------

export interface AuthPayload {
  token: string;
}

export interface AuthSuccessPayload {
  userId: string;
  message: string;
}

export interface AuthFailurePayload {
  error: string;
}

// Extension lifecycle
export interface ExtensionConnectedPayload {
  userId: string;
  extensionVersion?: string;
  connectedAt: string;
}

export interface ExtensionDisconnectedPayload {
  userId: string;
  disconnectedAt: string;
  reason?: string;
}

// Task payloads
export interface TaskStartPayload {
  taskId: string;
  taskType: string;
  label: string;
  startedAt: string;
  metadata?: Record<string, unknown>;
}

export interface TaskProgressPayload {
  taskId: string;
  taskType: string;
  progress: number; // 0-100
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskCompletePayload {
  taskId: string;
  taskType: string;
  result?: Record<string, unknown>;
  completedAt: string;
}

export interface TaskErrorPayload {
  taskId: string;
  taskType: string;
  error: string;
  code?: string;
  failedAt: string;
}

// Job payloads
export interface JobFoundPayload {
  jobId: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  foundAt: string;
}

export interface JobApplyingPayload {
  jobId: string;
  title: string;
  company: string;
  startedAt: string;
}

export interface JobAppliedPayload {
  jobId: string;
  title: string;
  company: string;
  appliedAt: string;
  success: boolean;
  errorMessage?: string;
}

// Post payloads
export interface PostScheduledPayload {
  postId: string;
  scheduledFor: string;
  content?: string;
}

export interface PostPublishedPayload {
  postId: string;
  publishedAt: string;
  url?: string;
}

// Scraper payloads
export interface ScraperResultPayload {
  scraperId: string;
  resultType: string;
  data: Record<string, unknown>;
  receivedAt: string;
}

export interface ScraperCompletePayload {
  scraperId: string;
  totalResults: number;
  completedAt: string;
}

// Limit / safety payloads
export interface LimitWarningPayload {
  limitType: string;
  current: number;
  max: number;
  message: string;
}

export interface LimitReachedPayload {
  limitType: string;
  current: number;
  max: number;
  message: string;
  retryAfter?: number; // seconds
}

export interface SafetyAlertPayload {
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// Heartbeat payloads
export interface HeartbeatPayload {
  timestamp: number;
}

export interface HeartbeatAckPayload {
  timestamp: number;
  serverTimestamp: number;
}

// ---------------------------------------------------------------------------
// Queued message wrapper
// ---------------------------------------------------------------------------

export interface QueuedMessage {
  id: string;
  event: WsEventName;
  payload: unknown;
  timestamp: number;
  userId: string;
}

// ---------------------------------------------------------------------------
// Server-to-client event map (for type-safe Socket.IO usage)
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  [WS_EVENTS.AUTH_SUCCESS]: (payload: AuthSuccessPayload) => void;
  [WS_EVENTS.AUTH_FAILURE]: (payload: AuthFailurePayload) => void;
  [WS_EVENTS.EXTENSION_CONNECTED]: (payload: ExtensionConnectedPayload) => void;
  [WS_EVENTS.EXTENSION_DISCONNECTED]: (payload: ExtensionDisconnectedPayload) => void;
  [WS_EVENTS.TASK_START]: (payload: TaskStartPayload) => void;
  [WS_EVENTS.TASK_PROGRESS]: (payload: TaskProgressPayload) => void;
  [WS_EVENTS.TASK_COMPLETE]: (payload: TaskCompletePayload) => void;
  [WS_EVENTS.TASK_ERROR]: (payload: TaskErrorPayload) => void;
  [WS_EVENTS.JOB_FOUND]: (payload: JobFoundPayload) => void;
  [WS_EVENTS.JOB_APPLYING]: (payload: JobApplyingPayload) => void;
  [WS_EVENTS.JOB_APPLIED]: (payload: JobAppliedPayload) => void;
  [WS_EVENTS.POST_SCHEDULED]: (payload: PostScheduledPayload) => void;
  [WS_EVENTS.POST_PUBLISHED]: (payload: PostPublishedPayload) => void;
  [WS_EVENTS.SCRAPER_RESULT]: (payload: ScraperResultPayload) => void;
  [WS_EVENTS.SCRAPER_COMPLETE]: (payload: ScraperCompletePayload) => void;
  [WS_EVENTS.LIMIT_WARNING]: (payload: LimitWarningPayload) => void;
  [WS_EVENTS.LIMIT_REACHED]: (payload: LimitReachedPayload) => void;
  [WS_EVENTS.SAFETY_ALERT]: (payload: SafetyAlertPayload) => void;
  [WS_EVENTS.HEARTBEAT_ACK]: (payload: HeartbeatAckPayload) => void;
  [WS_EVENTS.QUEUED_MESSAGES]: (payload: QueuedMessage[]) => void;
  // Legacy events
  [WS_EVENTS.ACTION_RESULT]: (data: Record<string, unknown>) => void;
  [WS_EVENTS.EXECUTE_ACTION]: (action: Record<string, unknown>) => void;
}

export interface ClientToServerEvents {
  [WS_EVENTS.AUTH]: (payload: AuthPayload) => void;
  [WS_EVENTS.HEARTBEAT]: (payload: HeartbeatPayload) => void;
  // Extension emits these
  [WS_EVENTS.EXTENSION_CONNECTED]: (payload: ExtensionConnectedPayload) => void;
  [WS_EVENTS.EXTENSION_DISCONNECTED]: (payload: ExtensionDisconnectedPayload) => void;
  [WS_EVENTS.TASK_START]: (payload: TaskStartPayload) => void;
  [WS_EVENTS.TASK_PROGRESS]: (payload: TaskProgressPayload) => void;
  [WS_EVENTS.TASK_COMPLETE]: (payload: TaskCompletePayload) => void;
  [WS_EVENTS.TASK_ERROR]: (payload: TaskErrorPayload) => void;
  [WS_EVENTS.JOB_FOUND]: (payload: JobFoundPayload) => void;
  [WS_EVENTS.JOB_APPLYING]: (payload: JobApplyingPayload) => void;
  [WS_EVENTS.JOB_APPLIED]: (payload: JobAppliedPayload) => void;
  [WS_EVENTS.POST_SCHEDULED]: (payload: PostScheduledPayload) => void;
  [WS_EVENTS.POST_PUBLISHED]: (payload: PostPublishedPayload) => void;
  [WS_EVENTS.SCRAPER_RESULT]: (payload: ScraperResultPayload) => void;
  [WS_EVENTS.SCRAPER_COMPLETE]: (payload: ScraperCompletePayload) => void;
  [WS_EVENTS.LIMIT_WARNING]: (payload: LimitWarningPayload) => void;
  [WS_EVENTS.LIMIT_REACHED]: (payload: LimitReachedPayload) => void;
  [WS_EVENTS.SAFETY_ALERT]: (payload: SafetyAlertPayload) => void;
  // Legacy events
  [WS_EVENTS.REPORT_STATUS]: (data: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// SSE event types (for the /api/sse endpoint)
// ---------------------------------------------------------------------------

export type SseEventType =
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
  | "heartbeat:ack"
  | "notification";

export interface SseMessage {
  id: string;
  event: SseEventType;
  data: unknown;
  timestamp: number;
}
