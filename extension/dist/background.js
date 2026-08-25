// WinPilot Background Service Worker
// Handles WebSocket connection to the web app, relays commands to content scripts,
// and drives the full job automation loop.

import { io } from "./socket.io.esm.min.js";
import { runTask } from "./task-runner.js";

// Backend endpoints, fixed at build time. build.js substitutes these tokens
// with WINPILOT_APP_URL / WINPILOT_WS_URL (see extension/.env.example); the
// literals below are what an unstamped source file falls back to, so loading
// extension/ directly still reaches production instead of a broken host.
// The WebSocket server shares the app's origin (Socket.IO is mounted at
// /api/ws), so both URLs are normally the same host.
const BUILD_API_URL = "https://winpilot.onrender.com";
const BUILD_WS_URL = "https://winpilot.onrender.com";
const FALLBACK_URL = "https://winpilot.onrender.com";

function buildUrl(stamped) {
  // An unsubstituted token still carries its "__WIN" prefix.
  if (!stamped || stamped.startsWith("__WIN")) return FALLBACK_URL;
  return stamped.replace(/\/$/, "");
}

const DEFAULT_API_URL = buildUrl(BUILD_API_URL);
const DEFAULT_WS_URL = buildUrl(BUILD_WS_URL);
const HEARTBEAT_INTERVAL = 30000;
const RECONNECT_BASE_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

let socket = null;
let heartbeatTimer = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let authToken = null;
let commandQueue = [];
let wsUrl = DEFAULT_WS_URL;
let apiUrl = DEFAULT_API_URL;

// Automation state
let automationRunning = false;
let automationAborted = false;

// Autopilot runs one server-dispatched task at a time, on the same tab the
// other two loops use — so all three are mutually exclusive.
let autopilotRunning = false;

// ─── WebSocket Connection ─────────────────────────────

function normalizeWsUrl(url) {
  return url.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://");
}

function connect() {
  if (socket && socket.connected) return;

  try {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    socket = io(`${normalizeWsUrl(wsUrl)}/extension`, {
      path: "/api/ws",
      transports: ["websocket", "polling"],
      reconnection: false,
    });

    socket.on("connect", () => {
      console.log("[WinPilot] WebSocket connected to", normalizeWsUrl(wsUrl));
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      updateConnectionStatus(true);
      startHeartbeat();

      if (authToken) {
        console.log("[WinPilot] Authenticating with token:", authToken.substring(0, 8) + "...");
        socket.emit("AUTH", { token: authToken });
      } else {
        console.warn("[WinPilot] No authToken set — cannot authenticate");
      }

      while (commandQueue.length > 0) {
        const cmd = commandQueue.shift();
        sendToServer(cmd);
      }
    });

    socket.on("EXECUTE_ACTION", (message) => {
      const normalizedMessage =
        message && typeof message === "object"
          ? { ...message, type: message.type || "EXECUTE_ACTION" }
          : { type: "EXECUTE_ACTION" };
      handleServerMessage(normalizedMessage);
    });

    socket.on("SYNC_CONFIG", (data) => {
      handleServerMessage({ type: "SYNC_CONFIG", data });
    });

    socket.on("AUTH_SUCCESS", (data) => {
      handleServerMessage({ type: "AUTH_SUCCESS", ...data });
    });

    socket.on("AUTH_FAILURE", (data) => {
      handleServerMessage({ type: "AUTH_FAILURE", ...data });
    });

    socket.on("disconnect", () => {
      console.log("[WinPilot] WebSocket disconnected");
      updateConnectionStatus(false);
      stopHeartbeat();
      scheduleReconnect();
    });

    socket.on("connect_error", (error) => {
      console.error("[WinPilot] WebSocket error:", error);
      updateConnectionStatus(false);
      stopHeartbeat();
      scheduleReconnect();
    });
  } catch (e) {
    console.error("[WinPilot] Failed to create WebSocket:", e);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(
    RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );
  reconnectAttempts++;
  setTimeout(connect, delay);
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit("HEARTBEAT", { timestamp: Date.now() });
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ─── Message Handling ───────────────────────────────────

function handleServerMessage(message) {
  console.log("[WinPilot] Server message received:", message.type, message.searchId ? `searchId=${message.searchId}` : "");
  switch (message.type) {
    case "EXECUTE_ACTION":
      // Autopilot tasks are multi-step flows the background worker drives
      // itself; everything else is a single DOM command for the content script.
      if (message.command === "RUN_TASK") {
        handleAutopilotTask(message);
      } else {
        forwardToContentScript(message);
      }
      break;
    case "RUN_TASK":
      handleAutopilotTask(message);
      break;
    case "START_AUTOMATION":
      startAutomation(message.searchId, message.options || message.config || {});
      break;
    case "APPLY_JOB_URL":
      startSingleApply(message.url, message.options || {});
      break;
    case "APPLY_JOB_LIST":
      startListApply(message.url, message.options || {});
      break;
    case "STOP_AUTOMATION":
      stopAutomation();
      break;
    case "START_LEAD_GEN":
      startLeadGenAutomation(message.campaignId, message.options || {});
      break;
    case "STOP_LEAD_GEN":
      stopLeadGen();
      break;
    case "START_PROFILE_SCRAPE":
      startProfileScrape();
      break;
    case "SYNC_CONFIG":
      chrome.storage.local.set({ config: message.data });
      break;
    case "AUTH_SUCCESS":
      console.log("[WinPilot] Authenticated successfully");
      break;
    case "AUTH_FAILURE":
      console.error("[WinPilot] Authentication failed");
      authToken = null;
      chrome.storage.local.remove("authToken");
      break;
    default:
      break;
  }
}

// ─── Content Script Communication ───────────────────────

function getLinkedInTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: "https://www.linkedin.com/*" }, (tabs) => {
      resolve(tabs && tabs.length > 0 ? tabs[0] : null);
    });
  });
}

function ensureLinkedInTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: "https://www.linkedin.com/*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        resolve(tabs[0]);
      } else {
        chrome.tabs.create({ url: "https://www.linkedin.com/feed/", active: false }, (tab) => {
          setTimeout(() => resolve(tab), 4000);
        });
      }
    });
  });
}

function getIndeedTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: "https://www.indeed.com/*" }, (tabs) => {
      resolve(tabs && tabs.length > 0 ? tabs[0] : null);
    });
  });
}

function ensureIndeedTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: "https://www.indeed.com/*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        resolve(tabs[0]);
      } else {
        chrome.tabs.create({ url: "https://www.indeed.com/jobs", active: false }, (tab) => {
          setTimeout(() => resolve(tab), 4000);
        });
      }
    });
  });
}

function ensurePlatformTab(platform) {
  return platform === "indeed" ? ensureIndeedTab() : ensureLinkedInTab();
}

// `frameId` targets one specific frame in the tab (e.g. the Indeed Apply
// iframe) instead of the top frame every existing LinkedIn call site relies
// on implicitly — omitted, this behaves exactly as before.
function sendToContentScript(tabId, message, frameId) {
  return new Promise((resolve, reject) => {
    const cmd = message.command || message.type;
    console.log(`[WinPilot] -> Content script (tab ${tabId}${frameId != null ? `, frame ${frameId}` : ""}):`, cmd);
    emitLog("info", "content-script", `-> ${cmd}`, `tab ${tabId}`);
    const callback = (response) => {
      if (chrome.runtime.lastError) {
        const errMessage = chrome.runtime.lastError.message || "Unknown runtime error";
        const isAsyncChannelClosed =
          errMessage.includes("A listener indicated an asynchronous response") &&
          errMessage.includes("before a response was received");
        const isExpectedNavigationClose =
          isAsyncChannelClosed &&
          ["CLICK_EASY_APPLY", "NAVIGATE", "CLICK_NEXT_OR_SUBMIT"].includes(message.command);

        if (isExpectedNavigationClose) {
          console.warn(
            `[WinPilot] <- Content script channel closed during ${message.command}; treating as navigation success`
          );
          emitLog("warn", "content-script", `<- Channel closed during ${message.command}; treating as navigation success`);

          if (message.command === "CLICK_NEXT_OR_SUBMIT") {
            resolve({
              status: "success",
              actionId: message.actionId,
              data: {
                action: "next",
                navigationInProgress: true,
                inferred: true,
              },
            });
            return;
          }

          resolve({
            status: "success",
            actionId: message.actionId,
            data: {
              clicked: true,
              sdui: message.command === "CLICK_EASY_APPLY",
              navigationInProgress: true,
            },
          });
          return;
        }

        console.error(`[WinPilot] <- Content script error (tab ${tabId}):`, errMessage);
        emitLog("error", "content-script", `<- Error (tab ${tabId}): ${errMessage}`);
        reject(new Error(errMessage));
      } else {
        console.log(`[WinPilot] <- Content script (tab ${tabId}): status=${response?.status}`);
        emitLog("info", "content-script", `<- status=${response?.status}`, `tab ${tabId}, cmd=${cmd}`);
        resolve(response);
      }
    };

    if (frameId != null) {
      chrome.tabs.sendMessage(tabId, message, { frameId }, callback);
    } else {
      chrome.tabs.sendMessage(tabId, message, callback);
    }
  });
}

async function forwardToContentScript(message) {
  try {
    const tab = await getLinkedInTab();
    if (tab?.id) {
      const response = await sendToContentScript(tab.id, message);
      if (response) {
        sendToServer({ type: "REPORT_STATUS", ...response });
      }
    } else {
      sendToServer({
        type: "REPORT_STATUS",
        status: "error",
        error: "No active LinkedIn tab found",
        actionId: message.actionId,
      });
    }
  } catch (e) {
    console.error("[WinPilot] Failed to forward to content script:", e);
  }
}

function sendToServer(message) {
  if (socket && socket.connected) {
    if (message.type === "REPORT_STATUS") {
      socket.emit("REPORT_STATUS", {
        event: message.event || "task:progress",
        payload: message,
      });
      return;
    }

    socket.emit(message.type || "MESSAGE", message);
  } else {
    commandQueue.push(message);
    if (commandQueue.length > 100) commandQueue.shift();
  }
}

// ─── API Communication ──────────────────────────────────

async function apiCall(endpoint, body) {
  const url = `${apiUrl}${endpoint}`;
  console.log(`[WinPilot API] >> ${url}`, { authToken: authToken ? `${authToken.substring(0, 8)}...` : "NONE", body });
  emitLog("info", "api", `>> ${endpoint}`);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auth-token": authToken,
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    console.error(`[WinPilot API] Network error calling ${url}:`, fetchErr.message);
    console.error(`[WinPilot API] Check: Is the server running at ${apiUrl}? Is the extension authorized for this host?`);
    emitLog("error", "api", `Network error: ${fetchErr.message}`, url);
    throw new Error(`Network error: ${fetchErr.message} (URL: ${url})`);
  }

  console.log(`[WinPilot API] << ${url} status=${res.status}`);
  emitLog("info", "api", `<< ${endpoint} status=${res.status}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error(`[WinPilot API] Error response from ${url}:`, err);

    if (err?.code === "GEMINI_QUOTA_EXCEEDED" || err?.ai?.provider === "gemini") {
      const retrySeconds = Number(err?.ai?.retryAfterSeconds || 0);
      const limit = Number(err?.ai?.dailyLimit || 0);
      const model = err?.ai?.model || "gemini-2.5-flash";
      const retryText = retrySeconds > 0 ? `Retry in ~${retrySeconds}s.` : "Retry later.";
      const limitText = limit > 0 ? `Daily limit ${limit}.` : "Daily quota exhausted.";
      const friendly = `Gemini credits exhausted (${model}). ${limitText} ${retryText} Use a new Gemini API key or disable AI tailoring.`;

      chrome.storage.local.set({
        lastAiQuotaStatus: {
          provider: "gemini",
          model,
          remaining: 0,
          dailyLimit: limit,
          retryAfterSeconds: retrySeconds,
          timestamp: Date.now(),
          message: friendly,
        },
      });

      reportProgress("task:error", {
        message: friendly,
        aiQuota: {
          provider: "gemini",
          model,
          remaining: 0,
          dailyLimit: limit,
          retryAfterSeconds: retrySeconds,
        },
      });

      throw new Error(friendly);
    }

    throw new Error(err.error || `API error ${res.status}`);
  }

  const data = await res.json();
  console.log(`[WinPilot API] << ${url} response:`, JSON.stringify(data).substring(0, 200));
  return data;
}

// ─── Human-like Delays ──────────────────────────────────

function randomDelay(min, max) {
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6;
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const delay = Math.max(min, Math.min(max, Math.round(mean + z * stdDev)));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// ─── Anti-Detection: Session & Sign-Out Monitoring ──────

/**
 * Check if LinkedIn has signed the user out or is showing a security challenge.
 * Uses the content script's CHECK_SESSION command.
 * Returns: { signedOut: boolean, securityChallenge: boolean } or null on error.
 */
async function checkLinkedInSession(tabId) {
  try {
    const result = await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "CHECK_SESSION",
      actionId: `session-check-${Date.now()}`,
    });
    return result?.data || null;
  } catch (err) {
    console.warn("[WinPilot] Session check failed:", err.message);
    return null;
  }
}

/**
 * Wait for user to re-authenticate on LinkedIn.
 * Polls every 15 seconds, gives up after maxWaitMs (default 10 minutes).
 * Returns true if session is restored, false if timed out.
 */
async function waitForReAuthentication(tabId, maxWaitMs = 10 * 60 * 1000) {
  const startTime = Date.now();
  const pollInterval = 15000;

  reportProgress("task:error", {
    message: "⚠️ LinkedIn signed you out! Please sign back in on the LinkedIn tab. Automation is paused and will resume automatically once you're signed in.",
  });
  emitLog("warn", "system", "LinkedIn sign-out detected — waiting for re-authentication");

  while (Date.now() - startTime < maxWaitMs) {
    if (automationAborted) return false;

    await new Promise((r) => setTimeout(r, pollInterval));

    const session = await checkLinkedInSession(tabId);
    if (session && !session.signedOut && !session.securityChallenge) {
      reportProgress("task:progress", {
        message: "✓ LinkedIn session restored! Resuming automation...",
      });
      emitLog("info", "system", "LinkedIn session restored — resuming automation");
      // Give LinkedIn a moment to fully load after sign-in
      await randomDelay(3000, 6000);
      return true;
    }

    if (session?.securityChallenge) {
      reportProgress("task:error", {
        message: "⚠️ LinkedIn security challenge detected. Please complete it manually on the LinkedIn tab.",
      });
    }

    const remainingMin = Math.round((maxWaitMs - (Date.now() - startTime)) / 60000);
    emitLog("info", "system", `Still waiting for re-auth... ${remainingMin}min remaining`);
  }

  reportProgress("task:error", {
    message: "Timed out waiting for LinkedIn re-authentication. Stopping automation.",
  });
  return false;
}

/**
 * Simulate natural browsing activity between job applications.
 * This makes the automation pattern look like a human browsing LinkedIn.
 */
async function simulateBrowsingBreak(tabId) {
  const breakType = Math.random();

  if (breakType < 0.35) {
    // Scroll the feed for a bit
    emitLog("info", "extension", "Taking a browsing break: scrolling feed...");
    reportProgress("task:progress", { message: "Browsing LinkedIn feed..." });
    try {
      await sendToContentScript(tabId, {
        type: "EXECUTE_ACTION",
        command: "SIMULATE_BROWSING",
        actionId: `browse-feed-${Date.now()}`,
        duration: 5000 + Math.random() * 10000, // 5-15s of browsing
      });
    } catch { /* ignore errors during browsing simulation */ }
    await randomDelay(2000, 5000);
  } else if (breakType < 0.6) {
    // Brief pause (simulates reading something)
    emitLog("info", "extension", "Taking a reading pause...");
    await randomDelay(4000, 12000);
  } else if (breakType < 0.8) {
    // View notifications briefly
    emitLog("info", "extension", "Taking a browsing break: checking notifications...");
    try {
      await sendToContentScript(tabId, {
        type: "EXECUTE_ACTION",
        command: "SIMULATE_BROWSING",
        actionId: `browse-notif-${Date.now()}`,
        duration: 3000 + Math.random() * 5000,
      });
    } catch { /* ignore */ }
    await randomDelay(1500, 4000);
  } else {
    // Just a random short pause
    await randomDelay(3000, 8000);
  }
}

/**
 * Perform a session health check. Returns true if safe to continue.
 * If signed out, waits for re-auth. If security challenge, pauses.
 */
async function ensureSessionHealthy(tabId) {
  const session = await checkLinkedInSession(tabId);
  if (!session) return true; // Can't check, assume OK

  if (session.signedOut) {
    return await waitForReAuthentication(tabId);
  }

  if (session.securityChallenge) {
    reportProgress("task:error", {
      message: "⚠️ LinkedIn security challenge detected. Please complete it manually, then automation will resume.",
    });
    // Wait for challenge to be resolved (same mechanism as re-auth)
    return await waitForReAuthentication(tabId);
  }

  return true;
}

/**
 * Indeed counterparts of the session-health helpers above. Kept as independent
 * functions rather than a parameterized generalization of the LinkedIn ones —
 * the LinkedIn anti-detection path is proven and stays untouched.
 */
async function checkIndeedSession(tabId) {
  try {
    const result = await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "CHECK_SESSION",
      actionId: `indeed-session-check-${Date.now()}`,
    });
    return result?.data || null;
  } catch (err) {
    console.warn("[WinPilot] Indeed session check failed:", err.message);
    return null;
  }
}

async function waitForIndeedReAuthentication(tabId, maxWaitMs = 10 * 60 * 1000) {
  const startTime = Date.now();
  const pollInterval = 15000;

  reportProgress("task:error", {
    message: "⚠️ Indeed signed you out! Please sign back in on the Indeed tab. Automation is paused and will resume automatically once you're signed in.",
  });
  emitLog("warn", "system", "Indeed sign-out detected — waiting for re-authentication");

  while (Date.now() - startTime < maxWaitMs) {
    if (automationAborted) return false;
    await new Promise((r) => setTimeout(r, pollInterval));

    const session = await checkIndeedSession(tabId);
    if (session && !session.signedOut && !session.securityChallenge) {
      reportProgress("task:progress", { message: "✓ Indeed session restored! Resuming automation..." });
      emitLog("info", "system", "Indeed session restored — resuming automation");
      await randomDelay(3000, 6000);
      return true;
    }

    if (session?.securityChallenge) {
      reportProgress("task:error", {
        message: "⚠️ Indeed security challenge detected. Please complete it manually on the Indeed tab.",
      });
    }
  }

  reportProgress("task:error", {
    message: "Timed out waiting for Indeed re-authentication. Stopping automation.",
  });
  return false;
}

async function ensureIndeedSessionHealthy(tabId) {
  const session = await checkIndeedSession(tabId);
  if (!session) return true; // Can't check, assume OK

  if (session.signedOut) {
    return await waitForIndeedReAuthentication(tabId);
  }
  if (session.securityChallenge) {
    reportProgress("task:error", {
      message: "⚠️ Indeed security challenge detected. Please complete it manually, then automation will resume.",
    });
    return await waitForIndeedReAuthentication(tabId);
  }
  return true;
}

function normalizeAutomationOptions(options) {
  const source = options && typeof options === "object" ? options : {};
  return {
    useAI: source.useAI !== false,
    useJobMatching: source.useJobMatching !== false,
    // Default OFF to preserve rule-based filling unless user opts in
    useAIFormFilling: source.useAIFormFilling === true,
    // Default OFF — messaging companies is opt-in. The two channels are
    // independent: the company page and a person there (hiring team or a
    // 1st-degree connection) can each be toggled on its own.
    useAutoMessagePage: source.useAutoMessagePage === true,
    useAutoMessagePerson: source.useAutoMessagePerson === true,
  };
}

function isGeminiQuotaErrorMessage(message) {
  const text = (message || "").toString().toLowerCase();
  return (
    text.includes("gemini") &&
    (text.includes("quota") || text.includes("resource_exhausted") || text.includes("rate limit") || text.includes("credits exhausted"))
  );
}

function isMissingFieldValue(field) {
  if (field.type === "file") return false;

  const value = typeof field.value === "string" ? field.value.trim() : "";
  if (field.type === "checkbox") return value !== "true";
  if (field.type === "radio") return !value;
  if (field.type === "select" || field.type === "custom-dropdown") {
    if (!value) return true;
    const normalized = value.toLowerCase();
    return normalized === "select" || normalized === "choose" || normalized === "none" || normalized === "please select" || normalized === "pick one";
  }

  return !value;
}

function normalizeAnswerForField(field, rawAnswer) {
  const label = (field?.label || "").toLowerCase();
  const inputType = (field?.inputType || "").toLowerCase();
  const selector = (field?.selector || "").toLowerCase();
  const text = (rawAnswer || "").toString().trim();

  if (field?.type === "checkbox") {
    return text && text.toLowerCase() === "false" ? "false" : "true";
  }

  const numericLike =
    inputType === "number" ||
    inputType === "tel" ||
    selector.includes("numeric") ||
    label.includes("how many") ||
    label.includes("how much") ||
    label.includes("on a scale") ||
    label.includes("approximately") ||
    label.includes("capital") ||
    label.includes("investor") ||
    label.includes("network") ||
    label.includes("year") ||
    label.includes("salary") ||
    label.includes("phone") ||
    label.includes("notice") ||
    label.includes("experience") ||
    label.includes("gpa") ||
    label.includes("zip") ||
    label.includes("postal");

  if (numericLike) {
    const decimalLike =
      label.includes("decimal") ||
      label.includes("million") ||
      label.includes("usd") ||
      label.includes("capital");

    if (decimalLike) {
      const normalized = text.replace(/[^\d.]/g, "");
      const parsed = Number(normalized);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed.toString();
      }
      return "5.0";
    }

    // Prefer first number group so "5 years" → "5" and "50,000-60,000" → "50000"
    const firstNumber = text.match(/\d[\d,]*(?:\.\d+)?/);
    if (firstNumber) {
      const cleaned = firstNumber[0].replace(/,/g, "");
      // For years/experience prefer integer
      if (label.includes("year") || label.includes("experience") || label.includes("how many")) {
        return String(parseInt(cleaned, 10));
      }
      return cleaned.replace(/\..*$/, ""); // salary etc. as integer digits
    }
    if (label.includes("phone")) return "0000000000";
    if (label.includes("salary")) return "5000";
    if (label.includes("year") || label.includes("experience")) return "3";
    return "1";
  }

  return text;
}

function fallbackAnswerForField(field) {
  const label = (field?.label || "").toLowerCase();
  const selector = (field?.selector || "").toLowerCase();

  const isNumericPrompt =
    selector.includes("numeric") ||
    label.includes("how many") ||
    label.includes("how much") ||
    label.includes("on a scale") ||
    label.includes("approximately") ||
    label.includes("capital") ||
    label.includes("investor") ||
    label.includes("network") ||
    label.includes("decimal");

  if (isNumericPrompt) {
    if (label.includes("scale")) return "8";
    if (label.includes("decimal") || label.includes("million") || label.includes("capital") || label.includes("usd")) {
      return "5.0";
    }
    return "5";
  }

  const pickBestSelectOption = (options = []) => {
    // Always prefer "Yes" — it keeps doors open
    const yesOpt = options.find((o) => {
      const val = (o?.value || "").toString().trim().toLowerCase();
      const txt = (o?.text || o?.label || "").toString().trim().toLowerCase();
      return val === "yes" || txt === "yes";
    });
    if (yesOpt) return yesOpt.value || yesOpt.label || yesOpt.text || "";
    const valid = options.find((o) => {
      const value = (o?.value || "").toString().trim().toLowerCase();
      const text = (o?.text || o?.label || "").toString().trim().toLowerCase();
      const joined = `${value} ${text}`;
      return (!!value || !!text) && !/select|choose|please|option|pick one|--/.test(joined);
    });
    return valid?.value || valid?.label || valid?.text || options[0]?.value || options[0]?.label || "";
  };

  if (field.type === "checkbox") return "true";
  if (field.type === "radio") {
    // Prefer "Yes" for radio buttons too
    const yesRadio = (field.options || []).find((o) => {
      const lbl = (o.label || o.text || "").toLowerCase();
      const val = (o.value || "").toLowerCase();
      return lbl === "yes" || val === "yes";
    });
    return yesRadio?.value || yesRadio?.label || field.options?.[0]?.value || field.options?.[0]?.label || "Yes";
  }
  if (field.type === "select" || field.type === "custom-dropdown") {
    return pickBestSelectOption(field.options || []);
  }
  if (label.includes("linkedin")) return "https://www.linkedin.com/in/profile";
  if (label.includes("website") || label.includes("portfolio")) return "https://example.com";
  if (label.includes("city")) return "Dubai";
  if (label.includes("country")) return "United Arab Emirates";
  return normalizeAnswerForField(field, "Yes");
}

function optionTextList(field) {
  return (field?.options || [])
    .map((o) => (o?.label || o?.text || o?.value || "").toString().trim())
    .filter(Boolean);
}

function inferFieldExpectedFormat(field) {
  const label = (field?.label || "").toLowerCase();
  const inputType = (field?.inputType || "").toLowerCase();
  const maxLength = Number(field?.maxLength || 0);

  if (field?.type === "radio" || field?.type === "select" || field?.type === "custom-dropdown") {
    const opts = optionTextList(field);
    if (opts.length <= 4 && opts.some((o) => /^(yes|no)$/i.test(o))) return "yes_no";
    return "text";
  }
  if (field?.type === "textarea" || maxLength > 80) return "long_text";
  if (inputType === "number" || /salary|compensation|pay|how many|years of|experience|scale|gpa/i.test(label)) {
    if (/salary|compensation|pay|ctc/.test(label)) return "currency";
    return "digits";
  }
  return "unknown";
}

function resolveOptionSelector(field, answer) {
  if (!field || !answer) return field?.selector || null;
  const options = field.options || [];
  if (!options.length) return field.selector || null;

  const normalized = String(answer).trim().toLowerCase();
  const match =
    options.find((o) => (o.label || "").toString().trim().toLowerCase() === normalized) ||
    options.find((o) => (o.value || "").toString().trim().toLowerCase() === normalized) ||
    options.find((o) => (o.text || "").toString().trim().toLowerCase() === normalized) ||
    options.find((o) => {
      const lbl = (o.label || o.text || o.value || "").toString().trim().toLowerCase();
      return lbl && (lbl.includes(normalized) || normalized.includes(lbl));
    });

  return match?.selector || field.selector || null;
}

/**
 * Ask the server AI form-answerer for answers to missing fields.
 * Returns a Map of field label → answer string.
 */
async function getAIFormAnswers(fields, applicationId) {
  if (!fields.length) return new Map();

  const questions = fields.map((field) => ({
    label: field.label || field.ariaLabel || "Unknown question",
    type: field.type || "text",
    options: optionTextList(field),
    maxLength: field.maxLength || undefined,
    expectedFormat: inferFieldExpectedFormat(field),
  }));

  try {
    const result = await apiCall(`/api/jobs/automate?step=answer-form`, {
      applicationId,
      questions,
    });

    const map = new Map();
    for (const item of result?.answers || []) {
      const key = (item.question || "").toLowerCase().trim();
      if (key && item.answer) {
        map.set(key, String(item.answer));
      }
    }
    return map;
  } catch (err) {
    console.warn(`[WinPilot] AI form answering failed: ${err.message}`);
    emitLog("warn", "api", "AI form answering failed — falling back to rules", err.message);
    return new Map();
  }
}

async function answerFieldForForm(field, storedRules, aiAnswers) {
  const labelKey = (field?.label || "").toLowerCase().trim();

  // Prefer AI answer when available
  if (aiAnswers && aiAnswers.size > 0) {
    const aiRaw =
      aiAnswers.get(labelKey) ||
      [...aiAnswers.entries()].find(([k]) => labelKey && (labelKey.includes(k) || k.includes(labelKey)))?.[1];

    if (aiRaw) {
      const chosen = normalizeAnswerForField(field, aiRaw);
      if (chosen) {
        // For radio/select, map free-text AI answer onto an option
        if (field.type === "radio" || field.type === "select" || field.type === "custom-dropdown") {
          const options = field.options || [];
          const match = options.find((o) => {
            const lbl = (o.label || o.text || o.value || "").toString().trim().toLowerCase();
            const ans = chosen.toLowerCase();
            return lbl === ans || lbl.includes(ans) || ans.includes(lbl);
          });
          if (match) {
            return match.value || match.label || match.text || chosen;
          }
        }
        return chosen;
      }
    }
  }

  const raw = getRuleBasedAnswer(field, storedRules);
  return normalizeAnswerForField(field, raw) || fallbackAnswerForField(field);
}

async function getStoredFormRules() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["formFieldRules"], (result) => {
      resolve(result.formFieldRules || {});
    });
  });
}

async function recordUnknownFieldSituation(field, jobTitle) {
  const entry = {
    label: field?.label || "",
    type: field?.type || "",
    inputType: field?.inputType || "",
    required: !!field?.required,
    selector: field?.selector || "",
    jobTitle: jobTitle || "",
    timestamp: Date.now(),
  };

  return new Promise((resolve) => {
    chrome.storage.local.get(["formUnknownSituations"], (result) => {
      const list = Array.isArray(result.formUnknownSituations) ? result.formUnknownSituations : [];
      list.push(entry);
      if (list.length > 200) list.shift();
      chrome.storage.local.set({ formUnknownSituations: list }, () => resolve(true));
    });
  });
}

async function recordUnknownAutomationSituation(kind, details = {}, jobTitle = "") {
  const entry = {
    kind: kind || "unknown",
    label: details?.label || kind || "",
    type: "automation-situation",
    inputType: details?.inputType || "",
    required: false,
    selector: details?.selector || "",
    jobTitle: jobTitle || "",
    context: details || {},
    timestamp: Date.now(),
  };

  return new Promise((resolve) => {
    chrome.storage.local.get(["formUnknownSituations"], (result) => {
      const list = Array.isArray(result.formUnknownSituations) ? result.formUnknownSituations : [];
      list.push(entry);
      if (list.length > 200) list.shift();
      chrome.storage.local.set({ formUnknownSituations: list }, () => resolve(true));
    });
  });
}

function getRuleBasedAnswer(field, storedRules) {
  const label = (field?.label || "").toLowerCase();
  const inputType = (field?.inputType || "").toLowerCase();
  const selector = (field?.selector || "").toLowerCase();

  if (storedRules && typeof storedRules === "object") {
    for (const [pattern, rawValue] of Object.entries(storedRules)) {
      if (label.includes(String(pattern).toLowerCase())) {
        return String(rawValue);
      }
    }
  }

  if (field.type === "checkbox") {
    if (
      label.includes("consent") ||
      label.includes("privacy") ||
      label.includes("declare") ||
      label.includes("terms") ||
      label.includes("policy") ||
      label.includes("authorize")
    ) {
      return "true";
    }
    return "true";
  }

  if (field.type === "radio") {
    const options = field.options || [];
    const optionByText = (txt) => options.find((o) => (o.label || "").toLowerCase().includes(txt));

    if (label.includes("sponsorship") || label.includes("visa")) {
      return optionByText("no")?.value || options[0]?.value || "Yes";
    }
    if (label.includes("authorized") || label.includes("work authorization")) {
      return optionByText("yes")?.value || options[0]?.value || "Yes";
    }
    // Default: prefer "Yes" for all other radio questions
    const yesRadio = optionByText("yes");
    return yesRadio?.value || options[0]?.value || "Yes";
  }

  if (field.type === "select" || field.type === "custom-dropdown") {
    const options = field.options || [];
    // Always prefer "Yes" option — it keeps doors open and avoids disqualification
    const yesOption = options.find((o) => {
      const val = (o?.value || "").toString().trim().toLowerCase();
      const txt = (o?.text || "").toString().trim().toLowerCase();
      return val === "yes" || txt === "yes";
    });
    if (yesOption) return yesOption.value;

    const valid = options.find((o) => {
      const value = (o?.value || "").toString().trim().toLowerCase();
      const text = (o?.text || "").toString().trim().toLowerCase();
      const joined = `${value} ${text}`;
      return !!value && !/select|choose|please|option|pick one|--/.test(joined);
    });
    return valid?.value || options[0]?.value || "";
  }

  if (
    selector.includes("numeric") ||
    label.includes("how many") ||
    label.includes("how much") ||
    label.includes("approximately") ||
    label.includes("capital") ||
    label.includes("investor") ||
    label.includes("network") ||
    label.includes("on a scale")
  ) {
    if (label.includes("scale")) return "8";
    if (label.includes("million") || label.includes("capital") || label.includes("usd") || label.includes("decimal")) {
      return "5.0";
    }
    return "5";
  }

  if (inputType === "email" || label.includes("email")) return "applicant@example.com";
  if (inputType === "url" || label.includes("linkedin")) return "https://www.linkedin.com/in/applicant";
  if (label.includes("portfolio") || label.includes("website")) return "https://example.com";
  if (label.includes("first name")) return "Ahsan";
  if (label.includes("last name")) return "Khan";
  if (label.includes("city")) return "Dubai";
  if (label.includes("country")) return "United Arab Emirates";

  return fallbackAnswerForField(field);
}

// ─── Tab Loading Helpers ────────────────────────────────

function waitForTabLoad(tabId, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // resolve anyway to not block automation
    }, timeout);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function ensureContentScriptReady(tabId, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await sendToContentScript(tabId, {
        type: "EXECUTE_ACTION",
        command: "GET_PAGE_INFO",
        actionId: `ping-${Date.now()}`,
      });
      if (response?.status === "success") return true;
    } catch (err) {
      console.warn(`[WinPilot] Content script not ready (attempt ${attempt + 1}): ${err.message}`);
      if (attempt < maxRetries - 1) {
        if (attempt === 0) {
          // First failure: the content script may just not have loaded yet — inject it directly.
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ["content.js"],
            });
          } catch (injectErr) {
            console.warn(`[WinPilot] Could not inject content script: ${injectErr.message}`);
          }
        } else {
          // Still failing: the tab's JS context is likely orphaned (e.g. the extension was
          // reloaded while this tab was already open). A plain injection re-runs in that same
          // stale context, so force a full reload to get a context tied to the current extension.
          console.warn(`[WinPilot] Reloading tab ${tabId} to recover a stale content script context`);
          try {
            await chrome.tabs.reload(tabId, { bypassCache: true });
            await waitForTabLoad(tabId);
          } catch (reloadErr) {
            console.warn(`[WinPilot] Could not reload tab: ${reloadErr.message}`);
          }
        }
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  return false;
}

async function navigateAndWait(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await waitForTabLoad(tabId);
  // SDUI content loads asynchronously after page load; wait longer with human-like variance
  await randomDelay(4000, 7000);
  await ensureContentScriptReady(tabId);
}

async function ensureIndeedContentScriptReady(tabId, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await sendToContentScript(tabId, {
        type: "EXECUTE_ACTION",
        command: "GET_PAGE_INFO",
        actionId: `indeed-ping-${Date.now()}`,
      });
      if (response?.status === "success") return true;
    } catch (err) {
      console.warn(`[WinPilot] Indeed content script not ready (attempt ${attempt + 1}): ${err.message}`);
      if (attempt < maxRetries - 1) {
        if (attempt === 0) {
          try {
            await chrome.scripting.executeScript({ target: { tabId }, files: ["indeed-content.js"] });
          } catch (injectErr) {
            console.warn(`[WinPilot] Could not inject Indeed content script: ${injectErr.message}`);
          }
        } else {
          try {
            await chrome.tabs.reload(tabId, { bypassCache: true });
            await waitForTabLoad(tabId);
          } catch (reloadErr) {
            console.warn(`[WinPilot] Could not reload tab: ${reloadErr.message}`);
          }
        }
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  return false;
}

async function navigateAndWaitIndeed(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await waitForTabLoad(tabId);
  await randomDelay(3000, 5000);
  await ensureIndeedContentScriptReady(tabId);
}

/**
 * Indeed Apply commonly renders its form inside a smartapply.indeed.com
 * iframe rather than the top document. The Indeed content script is injected
 * into every frame (manifest all_frames: true) and answers PING with
 * { isTopFrame }, so the apply-frame is identified by PINGing each
 * non-top frame chrome.webNavigation reports for the tab and keeping the
 * one that responds. Returns null when the form turned out to be
 * same-document (no smartapply iframe attached), in which case callers
 * should target the top frame instead.
 */
async function findSmartApplyFrameId(tabId, timeoutMs = 8000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    let frames = [];
    try {
      frames = await chrome.webNavigation.getAllFrames({ tabId });
    } catch {
      frames = [];
    }
    const candidates = (frames || []).filter(
      (f) => f.frameId !== 0 && /smartapply\.indeed\.com/i.test(f.url || "")
    );
    for (const frame of candidates) {
      try {
        const pong = await sendToContentScript(
          tabId,
          { type: "EXECUTE_ACTION", command: "PING", actionId: `ping-frame-${frame.frameId}` },
          frame.frameId
        );
        if (pong?.status === "success") return frame.frameId;
      } catch {
        // frame not ready yet — try again next poll
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// ─── Job Automation Engine ──────────────────────────────

function reportProgress(event, data) {
  sendToServer({
    type: "REPORT_STATUS",
    event,
    ...data,
  });

  // Also notify popup
  chrome.runtime.sendMessage({
    type: "AUTOMATION_PROGRESS",
    event,
    ...data,
  }).catch(() => {});
}

/**
 * Send a detailed log line to the dashboard via WebSocket.
 * Also prints to the service-worker console for dev-tools debugging.
 *
 * @param {"info"|"warn"|"error"|"success"} level
 * @param {"extension"|"api"|"content-script"|"system"} source
 * @param {string} message  – human-readable log text
 * @param {string} [details] – optional extra detail (e.g. JSON snippet)
 */
function emitLog(level, source, message, details) {
  sendToServer({
    type: "REPORT_STATUS",
    event: "automation:log",
    level,
    source,
    message,
    details: details || undefined,
  });
}

// ─── Auto Messaging: reach the company after applying ───

/** Ask the server for the message text for one outreach attempt. */
async function composeOutreachMessage(applicationId, channel, recipient) {
  const result = await apiCall(`/api/jobs/automate?step=outreach-message`, {
    applicationId,
    channel,
    recipientName: recipient?.name || "",
    recipientHeadline: recipient?.headline || "",
  });
  return result?.message || "";
}

/**
 * Open a composer on the current page, write the message, send it.
 * Returns { sent, error } and always leaves the composer closed.
 */
async function sendOutreachOnCurrentPage(tabId, applicationId, channel, recipient, actionKey, selector) {
  const openResult = await sendToContentScript(tabId, {
    type: "EXECUTE_ACTION",
    command: "OPEN_MESSAGE_COMPOSER",
    actionId: `msg-open-${actionKey}`,
    selector: selector || "",
  });

  if (!openResult?.data?.opened) {
    return { sent: false, error: openResult?.data?.error || "Message composer did not open" };
  }

  if (openResult.data.topic) {
    emitLog("info", "extension", `Message topic selected: ${openResult.data.topic}`);
  }

  // Only spend an AI call once a composer is actually in front of us
  const text = await composeOutreachMessage(applicationId, channel, recipient);
  if (!text) {
    await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "CLOSE_MESSAGE_OVERLAY",
      actionId: `msg-close-${actionKey}`,
    });
    return { sent: false, error: "No message text was generated" };
  }

  // Read-and-type pause, so the message is not sent the instant the box opens
  await randomDelay(1500, 3000);

  const sendResult = await sendToContentScript(tabId, {
    type: "EXECUTE_ACTION",
    command: "SEND_MESSAGE",
    actionId: `msg-send-${actionKey}`,
    text,
  });

  await sendToContentScript(tabId, {
    type: "EXECUTE_ACTION",
    command: "CLOSE_MESSAGE_OVERLAY",
    actionId: `msg-close-${actionKey}`,
  }).catch(() => {});

  if (sendResult?.data?.sent) {
    return { sent: true, message: text, topic: openResult.data.topic || "" };
  }
  return { sent: false, error: sendResult?.data?.error || "Message was not sent" };
}

/**
 * Record one outreach attempt and let the user know how it went. A company
 * that cannot be messaged is a normal outcome worth remembering, not an
 * error to retry forever.
 */
async function recordOutreachOutcome(applicationId, companyName, jobTitle, channel, recipient, outcome) {
  try {
    await apiCall(`/api/jobs/automate?step=outreach-complete`, {
      applicationId,
      sent: !!outcome.sent,
      channel,
      recipient: recipient?.name || undefined,
      message: outcome.message || undefined,
      reason: outcome.sent ? undefined : outcome.error,
    });
  } catch (recordErr) {
    emitLog("warn", "api", "Could not record outreach outcome", recordErr?.message || "");
  }

  if (outcome.sent) {
    reportProgress("task:progress", {
      message: `Messaged ${recipient?.name || companyName} about ${jobTitle}.`,
      jobTitle,
    });
    emitLog("info", "extension", `Outreach sent via ${channel} to ${recipient?.name || companyName}`);
  } else {
    reportProgress("task:progress", {
      message: `No message sent to ${recipient?.name || companyName}: ${outcome.error}.`,
      jobTitle,
    });
    emitLog("info", "extension", `Outreach skipped (${channel}) for ${companyName}: ${outcome.error}`);
  }
}

/**
 * Message the company page itself, under its Careers topic. Independent of
 * the "message a person" channel below — gated by ctx.useAutoMessagePage.
 */
async function attemptCompanyPageOutreach(tabId, ctx, application, companyName, company, actionKey) {
  const applicationId = application._id;
  const companyUrl = company?.url || "";

  if (!companyUrl) {
    await recordOutreachOutcome(applicationId, companyName, application.jobTitle, "company_page", null, {
      sent: false,
      error: "No company page linked on this job post",
    });
    return;
  }

  const recipient = { name: company.name || companyName, headline: "" };
  emitLog("info", "extension", `Opening ${companyUrl} to message the company page`);

  await navigateAndWait(tabId, companyUrl);
  ctx.navigatedAway = true;
  await randomDelay(2500, 4500);

  let outcome;
  if (await ensureContentScriptReady(tabId)) {
    outcome = await sendOutreachOnCurrentPage(tabId, applicationId, "company_page", recipient, `${actionKey}-page`);
  } else {
    outcome = { sent: false, error: "Could not connect to the company page" };
  }

  await recordOutreachOutcome(applicationId, companyName, application.jobTitle, "company_page", recipient, outcome);
}

/**
 * Message a person at the company: the hiring team named on the job post if
 * one of them is messageable, otherwise an existing 1st-degree connection
 * who works there. Independent of the "message the page" channel above —
 * gated by ctx.useAutoMessagePerson.
 */
async function attemptCompanyPersonOutreach(tabId, ctx, application, companyName, company, hiringTeam, actionKey) {
  const applicationId = application._id;

  // ── Prefer the hiring team on the job post
  const messageableHirer = hiringTeam.find((person) => person.canMessage);
  if (messageableHirer) {
    emitLog("info", "extension", `Messaging hiring team member ${messageableHirer.name} at ${companyName}`);
    await randomDelay(1200, 2500);
    const outcome = await sendOutreachOnCurrentPage(
      tabId,
      applicationId,
      "hiring_team",
      messageableHirer,
      `${actionKey}-hirer`,
      messageableHirer.selector
    );
    await recordOutreachOutcome(applicationId, companyName, application.jobTitle, "hiring_team", messageableHirer, outcome);
    if (outcome.sent) return;
  }

  // ── Fall back to a 1st-degree connection who works there
  const companyUrl = company?.url || "";
  if (!companyUrl) {
    if (!messageableHirer) {
      await recordOutreachOutcome(applicationId, companyName, application.jobTitle, "connection", null, {
        sent: false,
        error: "No hiring contact or company page on this job post",
      });
    }
    return;
  }

  emitLog("info", "extension", `Looking for a connection at ${companyName}`);
  await navigateAndWait(tabId, `${companyUrl}people/`);
  ctx.navigatedAway = true;
  await randomDelay(3000, 5000);

  if (!(await ensureContentScriptReady(tabId))) {
    await recordOutreachOutcome(applicationId, companyName, application.jobTitle, "connection", null, {
      sent: false,
      error: "Could not connect to the company people page",
    });
    return;
  }

  const peopleResult = await sendToContentScript(tabId, {
    type: "EXECUTE_ACTION",
    command: "SCRAPE_COMPANY_PEOPLE",
    actionId: `people-${actionKey}`,
  });
  const people = peopleResult?.data?.people || [];

  // 1st-degree only: anyone else cannot be messaged without InMail credits
  const connection = people.find((person) => /1st/.test(person.degree || ""));
  if (!connection?.profileUrl) {
    await recordOutreachOutcome(applicationId, companyName, application.jobTitle, "connection", null, {
      sent: false,
      error: `No first-degree connection found at ${companyName}`,
    });
    return;
  }

  emitLog("info", "extension", `Messaging connection ${connection.name} at ${companyName}`);
  await navigateAndWait(tabId, connection.profileUrl);
  await randomDelay(2500, 4000);

  let outcome;
  if (await ensureContentScriptReady(tabId)) {
    outcome = await sendOutreachOnCurrentPage(tabId, applicationId, "connection", connection, `${actionKey}-conn`);
  } else {
    outcome = { sent: false, error: "Could not connect to the profile page" };
  }
  await recordOutreachOutcome(applicationId, companyName, application.jobTitle, "connection", connection, outcome);
}

/**
 * After an application goes through, try to put a short message in front of
 * a human at that company. "Message the page" and "message a person there"
 * are independent, user-toggled channels (ctx.useAutoMessagePage /
 * ctx.useAutoMessagePerson) — when both are on, both are attempted and both
 * messages can go out. Never throws: outreach must not sink an application.
 */
async function attemptCompanyOutreach(tabId, ctx, application, jobWithDetail) {
  const applicationId = application?._id;
  if (!applicationId) return;

  const actionKey = String(applicationId).slice(-8);
  const companyName = application.company || jobWithDetail?.company || "the company";

  try {
    reportProgress("task:progress", {
      message: `Looking for someone to message at ${companyName}...`,
      jobTitle: application.jobTitle,
    });

    // Clear LinkedIn's "application sent" dialog first — it sits on top of the
    // page and would otherwise swallow the clicks below
    await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "CLOSE_MESSAGE_OVERLAY",
      actionId: `outreach-dismiss-${actionKey}`,
    }).catch(() => {});
    await randomDelay(800, 1600);

    const targetsResult = await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "GET_OUTREACH_TARGETS",
      actionId: `outreach-targets-${actionKey}`,
    });
    const company = targetsResult?.data?.company || null;
    const hiringTeam = targetsResult?.data?.hiringTeam || [];

    if (ctx.useAutoMessagePerson) {
      await attemptCompanyPersonOutreach(tabId, ctx, application, companyName, company, hiringTeam, actionKey);
    }

    if (ctx.useAutoMessagePage) {
      await attemptCompanyPageOutreach(tabId, ctx, application, companyName, company, actionKey);
    }
  } catch (err) {
    emitLog("warn", "extension", `Outreach failed for ${companyName}`, err?.message || "");
  }
}

/**
 * Take one candidate job from a results list all the way to submitted:
 * bring the tab back to the list, open the job, check LinkedIn's qualification
 * signal, read the posting, then run the shared apply routine.
 *
 * Shared by the saved-search run and by "apply to every job on this page".
 * `ctx` is the run state described on applyToJobOnTab, plus `listUrl` (the
 * results page to return to) and `useJobMatching`.
 *
 * Resolves with { status: "applied", application } or { status: "skipped", reason }.
 * Throws only on errors that should be recorded as a failed application.
 */
async function processJobCandidate(tabId, candidateJob, ctx, meta = {}) {
  const actionKey = meta.actionKey || "job";
  const jobLabel = candidateJob.title || candidateJob.jobId || candidateJob.url;

  // Clear the previous candidate's record so a failure here is never charged to it
  ctx.application = null;

  // Back to the results page if the previous job navigated away
  if (ctx.navigatedAway && ctx.listUrl) {
    console.log(`[WinPilot] Returning to results page ${ctx.listUrl}`);
    await navigateAndWait(tabId, ctx.listUrl);
    await randomDelay(900, 1500);
    ctx.navigatedAway = false;
  }

  // Verify we're on the results page before selecting a card
  const pageInfoCheck = await sendToContentScript(tabId, {
    type: "EXECUTE_ACTION",
    command: "GET_PAGE_INFO",
    actionId: `pagecheck-${actionKey}`,
  });
  const currentTabUrl = pageInfoCheck?.data?.url || "";
  if (
    ctx.listUrl &&
    !currentTabUrl.includes("/jobs/search") &&
    !currentTabUrl.includes("/jobs/collection")
  ) {
    console.log(`[WinPilot] Not on results page (url=${currentTabUrl}), navigating back...`);
    await navigateAndWait(tabId, ctx.listUrl);
    await randomDelay(900, 1500);
  }

  const selectResult = await sendToContentScript(tabId, {
    type: "EXECUTE_ACTION",
    command: "SELECT_JOB_FROM_LIST",
    actionId: `select-${actionKey}`,
    jobId: candidateJob.jobId,
    jobUrl: candidateJob.url,
  });

  if (!selectResult?.data?.selected) {
    // The card could not be clicked (lazy-rendered row, or a job id we know from
    // the link rather than from the list). Open the job's own page instead.
    if (!candidateJob.url) {
      return {
        status: "skipped",
        reason: `could not select job card in results list (${selectResult?.data?.error || "unknown"})`,
      };
    }

    emitLog("info", "extension", `Could not select "${jobLabel}" in the list — opening its job page instead`);
    await navigateAndWait(tabId, candidateJob.url);
    ctx.navigatedAway = true;
    await randomDelay(1200, 2200);

    if (!(await ensureContentScriptReady(tabId))) {
      return { status: "skipped", reason: "could not connect to the LinkedIn tab" };
    }
  }

  // Simulate time spent reading the job card (like a human would)
  await randomDelay(1500, 3500);

  const qualResult = await sendToContentScript(tabId, {
    type: "EXECUTE_ACTION",
    command: "CHECK_JOB_QUALIFICATION",
    actionId: `qual-${actionKey}`,
    maxAttempts: 12,
    delayMs: 350,
  });
  const qualification = qualResult?.data?.qualification || {
    status: "unknown",
    matched: false,
    text: "",
  };

  // Proceed if matched OR if status is unknown (LinkedIn didn't show qualification info)
  const shouldSkipJob = ctx.useJobMatching && (
    qualification.status === "missing_required" ||
    qualification.status === "no_match" ||
    (qualification.matched === false && qualification.status !== "unknown")
  );
  const qualificationLabel =
    qualification.text ||
    String(qualification.status || "unknown").replace(/_/g, " ");

  console.log(`[WinPilot] Qualification check: status="${qualification.status}", matched=${qualification.matched}, shouldSkip=${shouldSkipJob}, text="${qualification.text || ""}"`);
  emitLog("info", "extension", `Qualification check: status="${qualification.status}", matched=${qualification.matched}, shouldSkip=${shouldSkipJob}`, qualification.text || "");

  if (shouldSkipJob) {
    return {
      status: "skipped",
      qualification: true,
      reason: `LinkedIn qualification signal is "${qualificationLabel}"`,
    };
  }

  console.log(`[WinPilot] Proceeding with application for ${jobLabel}...`);
  emitLog("info", "extension", `Proceeding with application for ${jobLabel}`);

  // Simulate reading the job description (human-like pause before scraping)
  await randomDelay(2000, 5000);

  let detail = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const detailResult = await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "SCRAPE_JOB_DETAIL",
      actionId: `detail-${actionKey}-${attempt}`,
    });
    detail = detailResult?.data?.detail;
    if (detail?.description) break;
    await randomDelay(1500, 2500);
  }

  if (!detail?.description) {
    throw new Error("Could not extract job description");
  }

  const jobWithDetail = {
    ...candidateJob,
    url: candidateJob.url || detail.url,
    title: detail.title || candidateJob.title,
    company: detail.company || candidateJob.company,
    description: detail.description,
  };

  const application = await applyToJobOnTab(tabId, jobWithDetail, ctx);
  return { status: "applied", application };
}

/**
 * Errors that must stop the whole run rather than just skip one job.
 */
function abortedError() {
  const err = new Error("Automation stopped by user");
  err.aborted = true;
  return err;
}

function sessionLostError() {
  const err = new Error("LinkedIn session could not be restored");
  err.fatal = true;
  return err;
}

/**
 * Apply to ONE job on the tab that is already showing it (search side panel or
 * job page). Shared by the bulk search run and the single pasted-link run.
 *
 * ctx carries the run's mutable state:
 *   { searchId?, useAI, useAIFormFilling, storedRules, application, navigatedAway }
 * `useAI` / `useAIFormFilling` are switched off in place when the AI provider
 * runs out of quota, `application` exposes the registered record to the
 * caller's error handler, and `navigatedAway` tells the caller the tab no
 * longer shows the search results page.
 *
 * Throws on failure; resolves with the applied application record.
 */
async function applyToJobOnTab(tabId, jobWithDetail, ctx) {
  let targetApp = null;

  let prepData = null;

  const registerResult = await apiCall(`/api/jobs/automate?step=register-job`, {
    searchId: ctx.searchId,
    job: {
      title: jobWithDetail.title,
      company: jobWithDetail.company,
      location: jobWithDetail.location || "",
      url: jobWithDetail.url,
      description: jobWithDetail.description || "",
    },
  });

  targetApp = registerResult?.application || {
    _id: null,
    jobTitle: jobWithDetail.title,
    company: jobWithDetail.company,
    jobUrl: jobWithDetail.url,
  };

  ctx.application = targetApp;

  if (!targetApp?._id) {
    throw new Error("Could not register application record for job");
  }

  reportProgress("job:applying", {
    message: ctx.useAI
      ? `Applying to ${targetApp.jobTitle || jobWithDetail.title} at ${targetApp.company || jobWithDetail.company}...`
      : `Applying (AI OFF) to ${targetApp.jobTitle || jobWithDetail.title} at ${targetApp.company || jobWithDetail.company}...`,
    jobTitle: targetApp.jobTitle || jobWithDetail.title,
    company: targetApp.company || jobWithDetail.company,
  });

  if (ctx.useAI) {
    try {
      prepData = await apiCall(`/api/jobs/automate?step=prepare-apply`, {
        applicationId: targetApp._id,
      });
    } catch (prepErr) {
      const prepMessage = prepErr?.message || "";
      if (isGeminiQuotaErrorMessage(prepMessage)) {
        ctx.useAI = false;
        reportProgress("task:error", {
          message: `${prepMessage} Switched to AI Mode OFF for remaining jobs.`,
        });
        reportProgress("task:progress", {
          message: "AI Mode OFF active: continuing with existing LinkedIn resume (no AI calls).",
        });
      } else {
        throw prepErr;
      }
    }

    if (ctx.useAI && !prepData?.resumePdf) {
      throw new Error("Tailored resume PDF was not generated");
    }
  }

  // Try Easy Apply from the search results side panel first
  let easyApplyResult = await sendToContentScript(tabId, {
    type: "EXECUTE_ACTION",
    command: "CLICK_EASY_APPLY",
    actionId: `apply-${targetApp._id}`,
  });

  if (!easyApplyResult?.data?.clicked) {
    // Side panel miss — open the full job page and retry
    console.log(`[WinPilot] Easy Apply not found on side panel, navigating to job page...`);
    await navigateAndWait(tabId, targetApp.jobUrl);
    ctx.navigatedAway = true;

    if (!(await ensureSessionHealthy(tabId))) {
      throw sessionLostError();
    }

    await randomDelay(1500, 3000);

    easyApplyResult = await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "CLICK_EASY_APPLY",
      actionId: `apply-${targetApp._id}-retry`,
    });
    if (!easyApplyResult?.data?.clicked) {
      throw new Error(`Easy Apply button not found: ${easyApplyResult?.data?.error || "unknown"}`);
    }
  }

  if (easyApplyResult?.data?.sdui) {
    ctx.navigatedAway = true;
    await waitForTabLoad(tabId);
    await randomDelay(1400, 2200);
    await ensureContentScriptReady(tabId);
  }

  const MAX_FORM_STEPS = 15;
  let uploaded = false;
  let submitted = false;
  let lastFieldsSignature = "";
  let repeatedSignatureCount = 0;

  for (let step = 0; step < MAX_FORM_STEPS; step++) {
    if (automationAborted) throw abortedError();

    const fieldsResult = await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "GET_FORM_FIELDS",
      actionId: `fields-${targetApp._id}-${step}`,
    });
    const fields = fieldsResult?.data?.fields || [];

    const fieldsSignature = fields
      .filter((f) => f.required)
      .map((f) => `${f.type}:${(f.label || "").toLowerCase().trim()}:${String(f.value || "").toLowerCase().trim()}`)
      .sort()
      .join("|");

    if (fieldsSignature && fieldsSignature === lastFieldsSignature) {
      repeatedSignatureCount++;
    } else {
      repeatedSignatureCount = 0;
      lastFieldsSignature = fieldsSignature;
    }

    if (repeatedSignatureCount >= 4) {
      await recordUnknownAutomationSituation(
        "form-stuck-no-progress",
        {
          label: "No progress detected across repeated form steps",
          source: "GET_FORM_FIELDS",
          step: step + 1,
          repeatedSignatureCount,
          fieldsSignature,
        },
        targetApp.jobTitle
      );
      throw new Error("No form progress detected; skipping this job");
    }

    if (ctx.useAI && prepData?.resumePdf && !uploaded && fields.some((f) => f.type === "file")) {
      const uploadResult = await sendToContentScript(tabId, {
        type: "EXECUTE_ACTION",
        command: "UPLOAD_RESUME",
        actionId: `upload-${targetApp._id}-${step}`,
        fileData: prepData.resumePdf,
        fileName: prepData.resumeFileName || "tailored-resume.pdf",
      });
      if (!uploadResult?.data?.uploaded) {
        throw new Error(`Resume upload failed: ${uploadResult?.data?.error || "unknown"}`);
      }
      uploaded = true;
      await randomDelay(1000, 1600);
    }

    const requiredMissing = fields.filter((f) => f.required && isMissingFieldValue(f));

    // Batch AI answers for this form step when AI Form Filling is enabled
    let aiAnswers = new Map();
    if (ctx.useAIFormFilling && requiredMissing.length > 0) {
      reportProgress("task:progress", {
        message: `AI answering ${requiredMissing.length} form question(s)...`,
        jobTitle: targetApp.jobTitle || jobWithDetail.title,
      });
      try {
        aiAnswers = await getAIFormAnswers(requiredMissing, targetApp._id);
        if (aiAnswers.size > 0) {
          emitLog("info", "api", `AI form fill returned ${aiAnswers.size} answer(s)`);
        }
      } catch (formAiErr) {
        const formAiMessage = formAiErr?.message || "";
        if (isGeminiQuotaErrorMessage(formAiMessage)) {
          ctx.useAIFormFilling = false;
          chrome.storage.local.set({ useAIFormFilling: false });
          reportProgress("task:error", {
            message: `${formAiMessage} Switched AI Form Filling OFF for remaining jobs.`,
          });
        } else {
          emitLog("warn", "api", "AI form fill error, using rules", formAiMessage);
        }
      }
    }

    for (let i = 0; i < requiredMissing.length; i++) {
      const field = requiredMissing[i];
      const chosen = await answerFieldForForm(field, ctx.storedRules, ctx.useAIFormFilling ? aiAnswers : null);

      if (!chosen) {
        await recordUnknownFieldSituation(field, targetApp.jobTitle);
        continue;
      }

      const fillSelector = resolveOptionSelector(field, chosen) || field.selector;

      await sendToContentScript(tabId, {
        type: "EXECUTE_ACTION",
        command: "FILL_FORM_FIELD",
        actionId: `fill-${targetApp._id}-${step}-${i}`,
        fieldIndex: i,
        selector: fillSelector,
        value: chosen,
        fieldType: field.type,
        fieldLabel: field.label,
      });
      await randomDelay(800, 2000);
    }

    const dropdownResult = await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "AUTO_SELECT_DROPDOWNS",
      actionId: `auto-dropdown-${targetApp._id}-${step}`,
    });
    if ((dropdownResult?.data?.selectedCount || 0) > 0) {
      await randomDelay(300, 700);
    }

    const navResult = await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "CLICK_NEXT_OR_SUBMIT",
      actionId: `nav-${targetApp._id}-${step}`,
    });

    const navAction = navResult?.data?.action;
    if (navAction === "submitted") {
      submitted = true;
      await randomDelay(1000, 1500);
      try {
        await sendToContentScript(tabId, {
          type: "EXECUTE_ACTION",
          command: "GET_PAGE_INFO",
          actionId: `post-submit-check-${targetApp._id}`,
        });
      } catch { /* ignore - page may have navigated */ }
      break;
    }

    if (navAction === "next" || navAction === "review") {
      await randomDelay(1500, 3000);
      continue;
    }

    if (navAction === "continue_applying") {
      await recordUnknownAutomationSituation(
        "linkedin-continue-applying-interstitial",
        {
          label: "LinkedIn safety interstitial after Easy Apply",
          source: "CLICK_NEXT_OR_SUBMIT",
          href: navResult?.data?.href || "",
          safety: !!navResult?.data?.safety,
        },
        targetApp.jobTitle
      );
      ctx.navigatedAway = true;
      await waitForTabLoad(tabId);
      await randomDelay(1400, 2200);
      await ensureContentScriptReady(tabId);
      continue;
    }

    if (navAction === "blocked") {
      const stillMissing = requiredMissing.filter((f) => isMissingFieldValue(f));
      if (stillMissing.length > 0) {
        for (const field of stillMissing) {
          await recordUnknownFieldSituation(field, targetApp.jobTitle);
        }
      }
      throw new Error(`Navigation blocked: ${navResult?.data?.error || "required fields unresolved"}`);
    }

    await recordUnknownAutomationSituation(
      "form-navigation-unknown-action",
      {
        label: "Unknown form navigation action",
        source: "CLICK_NEXT_OR_SUBMIT",
        action: navAction || "none",
        error: navResult?.data?.error || "",
        step: step + 1,
      },
      targetApp.jobTitle
    );

    throw new Error(`Form navigation blocked on step ${step + 1} (action=${navAction || "none"})`);
  }

  if (!submitted) {
    throw new Error("Application was not submitted within the allowed form steps");
  }

  // Mark that we need to return to search results for the next job
  ctx.navigatedAway = true;

  // Post-submission pause — humans don't immediately move on
  await randomDelay(2000, 5000);

  if (targetApp?._id) {
    await apiCall(`/api/jobs/automate?step=complete`, {
      applicationId: targetApp._id,
      success: true,
      notes: "Auto-applied via WinPilot",
    });
  }

  // Auto Messaging: try to reach a human at this company before moving on.
  // Runs after the application is safely recorded, and never throws.
  if (ctx.useAutoMessagePage || ctx.useAutoMessagePerson) {
    await attemptCompanyOutreach(tabId, ctx, targetApp, jobWithDetail);
  }

  return targetApp;
}

/**
 * Indeed counterpart of processJobCandidate. Written fresh against the Indeed
 * command set rather than a parameterized generalization of the LinkedIn
 * version — Indeed has no qualification-percentage signal to check, and no
 * outreach step (out of scope for Indeed entirely).
 */
async function processIndeedJobCandidate(tabId, candidateJob, ctx, meta = {}) {
  const actionKey = meta.actionKey || "job";
  const jobLabel = candidateJob.title || candidateJob.jobId || candidateJob.url;

  ctx.application = null;

  if (ctx.navigatedAway && ctx.listUrl) {
    await navigateAndWaitIndeed(tabId, ctx.listUrl);
    await randomDelay(900, 1500);
    ctx.navigatedAway = false;
  }

  const selectResult = await sendToContentScript(tabId, {
    type: "EXECUTE_ACTION",
    command: "SELECT_JOB_FROM_LIST",
    actionId: `indeed-select-${actionKey}`,
    jobId: candidateJob.jobId,
    jobUrl: candidateJob.url,
  });

  if (!selectResult?.data?.selected) {
    if (!candidateJob.url) {
      return {
        status: "skipped",
        reason: `could not select job card in results list (${selectResult?.data?.error || "unknown"})`,
      };
    }
    emitLog("info", "extension", `Could not select "${jobLabel}" in the list — opening its job page instead`);
    await navigateAndWaitIndeed(tabId, candidateJob.url);
    ctx.navigatedAway = true;
    await randomDelay(1200, 2200);
    if (!(await ensureIndeedContentScriptReady(tabId))) {
      return { status: "skipped", reason: "could not connect to the Indeed tab" };
    }
  }

  await randomDelay(1500, 3500);

  let detail = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const detailResult = await sendToContentScript(tabId, {
      type: "EXECUTE_ACTION",
      command: "SCRAPE_JOB_DETAIL",
      actionId: `indeed-detail-${actionKey}-${attempt}`,
    });
    detail = detailResult?.data?.detail;
    if (detail?.description) break;
    await randomDelay(1500, 2500);
  }

  if (!detail?.description) {
    throw new Error("Could not extract job description");
  }

  const jobWithDetail = {
    ...candidateJob,
    url: candidateJob.url || detail.url,
    title: detail.title || candidateJob.title,
    company: detail.company || candidateJob.company,
    description: detail.description,
  };

  const application = await applyToIndeedJob(tabId, jobWithDetail, ctx);
  return { status: "applied", application };
}

/**
 * Apply to ONE Indeed job on the tab already showing it. Mirrors
 * applyToJobOnTab's shape (register -> prep resume -> click apply -> fill
 * form loop -> complete) but targets Indeed's command set, and additionally
 * resolves the SmartApply iframe's frameId once so every form-step message
 * reaches wherever the form actually rendered.
 */
async function applyToIndeedJob(tabId, jobWithDetail, ctx) {
  const registerResult = await apiCall(`/api/jobs/automate?step=register-job`, {
    searchId: ctx.searchId,
    job: {
      title: jobWithDetail.title,
      company: jobWithDetail.company,
      location: jobWithDetail.location || "",
      url: jobWithDetail.url,
      description: jobWithDetail.description || "",
      platform: "indeed",
    },
  });

  const targetApp = registerResult?.application || {
    _id: null,
    jobTitle: jobWithDetail.title,
    company: jobWithDetail.company,
    jobUrl: jobWithDetail.url,
  };
  ctx.application = targetApp;

  if (!targetApp?._id) {
    throw new Error("Could not register application record for job");
  }

  reportProgress("job:applying", {
    message: `Applying to ${targetApp.jobTitle || jobWithDetail.title} at ${targetApp.company || jobWithDetail.company} (Indeed)...`,
    jobTitle: targetApp.jobTitle || jobWithDetail.title,
    company: targetApp.company || jobWithDetail.company,
  });

  let prepData = null;
  if (ctx.useAI) {
    try {
      prepData = await apiCall(`/api/jobs/automate?step=prepare-apply`, { applicationId: targetApp._id });
    } catch (prepErr) {
      const prepMessage = prepErr?.message || "";
      if (isGeminiQuotaErrorMessage(prepMessage)) {
        ctx.useAI = false;
        reportProgress("task:error", { message: `${prepMessage} Switched to AI Mode OFF for remaining jobs.` });
      } else {
        throw prepErr;
      }
    }
    if (ctx.useAI && !prepData?.resumePdf) {
      throw new Error("Tailored resume PDF was not generated");
    }
  }

  const applyResult = await sendToContentScript(tabId, {
    type: "EXECUTE_ACTION",
    command: "CLICK_EASY_APPLY",
    actionId: `indeed-apply-${targetApp._id}`,
  });
  if (!applyResult?.data?.clicked) {
    throw new Error(`Apply button not found: ${applyResult?.data?.error || "unknown"}`);
  }

  // Indeed Apply commonly opens a smartapply.indeed.com iframe for the form;
  // resolve its frameId once and use it for every remaining message. A null
  // result means the form rendered same-document — fall back to the top frame.
  const formFrameId = await findSmartApplyFrameId(tabId);

  const MAX_FORM_STEPS = 15;
  let uploaded = false;
  let submitted = false;
  let lastFieldsSignature = "";
  let repeatedSignatureCount = 0;

  for (let step = 0; step < MAX_FORM_STEPS; step++) {
    if (automationAborted) throw abortedError();

    const fieldsResult = await sendToContentScript(
      tabId,
      { type: "EXECUTE_ACTION", command: "GET_FORM_FIELDS", actionId: `indeed-fields-${targetApp._id}-${step}` },
      formFrameId
    );
    const fields = fieldsResult?.data?.fields || [];

    const fieldsSignature = fields
      .filter((f) => f.required)
      .map((f) => `${f.type}:${(f.label || "").toLowerCase().trim()}:${String(f.value || "").toLowerCase().trim()}`)
      .sort()
      .join("|");
    if (fieldsSignature && fieldsSignature === lastFieldsSignature) {
      repeatedSignatureCount++;
    } else {
      repeatedSignatureCount = 0;
      lastFieldsSignature = fieldsSignature;
    }
    if (repeatedSignatureCount >= 4) {
      throw new Error("No form progress detected; skipping this job");
    }

    if (ctx.useAI && prepData?.resumePdf && !uploaded && fields.some((f) => f.type === "file")) {
      const uploadResult = await sendToContentScript(
        tabId,
        {
          type: "EXECUTE_ACTION",
          command: "UPLOAD_RESUME",
          actionId: `indeed-upload-${targetApp._id}-${step}`,
          fileData: prepData.resumePdf,
          fileName: prepData.resumeFileName || "tailored-resume.pdf",
        },
        formFrameId
      );
      if (!uploadResult?.data?.uploaded) {
        throw new Error(`Resume upload failed: ${uploadResult?.data?.error || "unknown"}`);
      }
      uploaded = true;
      await randomDelay(1000, 1600);
    }

    const requiredMissing = fields.filter((f) => f.required && isMissingFieldValue(f));

    let aiAnswers = new Map();
    if (ctx.useAIFormFilling && requiredMissing.length > 0) {
      try {
        aiAnswers = await getAIFormAnswers(requiredMissing, targetApp._id);
      } catch (formAiErr) {
        const formAiMessage = formAiErr?.message || "";
        if (isGeminiQuotaErrorMessage(formAiMessage)) {
          ctx.useAIFormFilling = false;
          chrome.storage.local.set({ useAIFormFilling: false });
        }
      }
    }

    for (let i = 0; i < requiredMissing.length; i++) {
      const field = requiredMissing[i];
      const chosen = await answerFieldForForm(field, ctx.storedRules, ctx.useAIFormFilling ? aiAnswers : null);
      if (!chosen) {
        await recordUnknownFieldSituation(field, targetApp.jobTitle);
        continue;
      }
      const fillSelector = resolveOptionSelector(field, chosen) || field.selector;
      await sendToContentScript(
        tabId,
        {
          type: "EXECUTE_ACTION",
          command: "FILL_FORM_FIELD",
          actionId: `indeed-fill-${targetApp._id}-${step}-${i}`,
          fieldIndex: i,
          selector: fillSelector,
          value: chosen,
          fieldType: field.type,
          fieldLabel: field.label,
        },
        formFrameId
      );
      await randomDelay(800, 2000);
    }

    await sendToContentScript(
      tabId,
      { type: "EXECUTE_ACTION", command: "AUTO_SELECT_DROPDOWNS", actionId: `indeed-auto-dropdown-${targetApp._id}-${step}` },
      formFrameId
    );

    const navResult = await sendToContentScript(
      tabId,
      { type: "EXECUTE_ACTION", command: "CLICK_NEXT_OR_SUBMIT", actionId: `indeed-nav-${targetApp._id}-${step}` },
      formFrameId
    );
    const navAction = navResult?.data?.action;

    if (navAction === "submitted") {
      submitted = true;
      await randomDelay(1000, 1500);
      break;
    }
    if (navAction === "next") {
      await randomDelay(1500, 3000);
      continue;
    }

    throw new Error(`Form navigation blocked on step ${step + 1} (action=${navAction || "none"})`);
  }

  if (!submitted) {
    throw new Error("Application was not submitted within the allowed form steps");
  }

  ctx.navigatedAway = true;
  await randomDelay(2000, 5000);

  if (targetApp?._id) {
    await apiCall(`/api/jobs/automate?step=complete`, {
      applicationId: targetApp._id,
      success: true,
      notes: "Auto-applied via WinPilot",
    });
  }

  // No outreach step for Indeed — out of scope (no equivalent messaging surface).
  return targetApp;
}

/**
 * Search + apply loop for one Indeed keyword, mirroring the shape of the
 * LinkedIn keyword/page loop inside startAutomation but written independently
 * (Indeed's pagination is a "Next" click rather than a `start=` page param
 * LinkedIn exposes directly on the URL, and there is no qualification signal
 * to check). `stats` is a shared { applied, failed } counter the caller
 * folds into its own run totals.
 */
async function runIndeedKeywordSearch(tab, keyword, url, jobCtx, stats) {
  emitLog("info", "extension", `Searching Indeed for "${keyword}"`);
  reportProgress("task:progress", { message: `Searching Indeed for "${keyword}"...` });

  try {
    await navigateAndWaitIndeed(tab.id, url);
    if (!(await ensureIndeedSessionHealthy(tab.id))) {
      reportProgress("task:error", { message: "Indeed session could not be restored — skipping remaining Indeed keywords" });
      return;
    }

    const MAX_PAGES = 10;
    const processedJobIds = new Set();
    jobCtx.storedRules = jobCtx.storedRules || (await getStoredFormRules());

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      if (automationAborted) return;

      if (pageNum > 1) {
        const paginated = await sendToContentScript(tab.id, {
          type: "EXECUTE_ACTION",
          command: "CLICK_PAGINATION_NEXT",
          actionId: `indeed-page-${pageNum}`,
        });
        if (!paginated?.data?.clicked) break;
        await randomDelay(1500, 3000);
      }

      const scrapeResult = await sendToContentScript(tab.id, {
        type: "EXECUTE_ACTION",
        command: "SCRAPE_JOB_LISTINGS",
        actionId: `indeed-scrape-p${pageNum}`,
      });
      const scrapedJobs = scrapeResult?.data?.jobs || [];
      if (scrapedJobs.length === 0) break;

      const eligibleJobs = scrapedJobs.filter((job) => {
        if (job?.applied) return false;
        const hasTarget = !!(job?.url || job?.jobId);
        if (!hasTarget) return false;
        const key = job.jobId || job.url;
        if (processedJobIds.has(key)) return false;
        return true;
      });

      if (eligibleJobs.length === 0) continue;

      jobCtx.listUrl = url;
      jobCtx.navigatedAway = false;

      for (let i = 0; i < eligibleJobs.length; i++) {
        const candidateJob = eligibleJobs[i];
        processedJobIds.add(candidateJob.jobId || candidateJob.url);

        if (automationAborted) return;
        if (!(await ensureIndeedSessionHealthy(tab.id))) return;

        if (i > 0) {
          const interJobDelay = 5000 + Math.random() * 15000;
          await randomDelay(interJobDelay * 0.8, interJobDelay * 1.2);
        }

        try {
          const outcome = await processIndeedJobCandidate(tab.id, candidateJob, jobCtx, {
            actionKey: `indeed-p${pageNum}-${i}`,
          });
          if (outcome.status === "skipped") {
            stats.failed++;
            reportProgress("task:progress", {
              message: `Skipping ${candidateJob.title}: ${outcome.reason}.`,
              jobTitle: candidateJob.title,
            });
            continue;
          }
          stats.applied++;
          reportProgress("job:applied", {
            message: `Applied to ${outcome.application.jobTitle} at ${outcome.application.company} (Indeed)`,
            jobTitle: outcome.application.jobTitle,
            company: outcome.application.company,
            appliedCount: stats.applied,
          });
        } catch (jobErr) {
          if (jobCtx.application?._id) {
            await apiCall(`/api/jobs/automate?step=complete`, {
              applicationId: jobCtx.application._id,
              success: false,
              notes: `Auto-apply failed: ${jobErr.message}`,
            }).catch(() => {});
          }
          if (jobErr?.aborted) return;
          stats.failed++;
          reportProgress("task:error", {
            message: `Skipped ${candidateJob.title}: ${jobErr.message}`,
            jobTitle: candidateJob.title,
          });
          jobCtx.navigatedAway = true;
        }
      }
    }
  } catch (err) {
    emitLog("warn", "extension", `Indeed search for "${keyword}" failed: ${err.message}`);
    reportProgress("task:progress", { message: `No results for "${keyword}" on Indeed (${err.message})` });
  }
}

async function startAutomation(searchId, options = {}) {
  if (automationRunning) {
    reportProgress("task:error", { message: "Automation already running" });
    return;
  }

  // Starting values only — jobCtx below owns these for the rest of the run,
  // since the apply routine switches them off when the AI provider runs dry.
  const { useAI, useJobMatching, useAIFormFilling, useAutoMessagePage, useAutoMessagePerson } = normalizeAutomationOptions(options);

  console.log(`[WinPilot] ====== STARTING AUTOMATION ======`);
  console.log(`[WinPilot] searchId: ${searchId}`);
  console.log(`[WinPilot] apiUrl: ${apiUrl}`);
  console.log(`[WinPilot] authToken: ${authToken ? `${authToken.substring(0, 8)}...` : "NOT SET"}`);
  console.log(`[WinPilot] wsUrl: ${wsUrl}`);
  console.log(`[WinPilot] useAI: ${useAI}, useJobMatching: ${useJobMatching}, useAIFormFilling: ${useAIFormFilling}, useAutoMessagePage: ${useAutoMessagePage}, useAutoMessagePerson: ${useAutoMessagePerson}`);
  emitLog(
    "info",
    "system",
    "====== STARTING AUTOMATION ======",
    `searchId=${searchId}, useAI=${useAI}, useAIFormFilling=${useAIFormFilling}`
  );

  automationRunning = true;
  automationAborted = false;

  chrome.storage.local.set({
    automationRunning: true,
    automationSearchId: searchId,
    // Keep AI fallback module in sync for post-submit validation fixes
    useAIFormFilling,
  });

  reportProgress("task:start", { label: "Starting job automation..." });
  reportProgress("task:progress", {
    message: [
      useAI ? "AI resume ON" : "AI resume OFF",
      useJobMatching ? "matching ON" : "matching OFF",
      useAIFormFilling ? "AI form fill ON" : "AI form fill OFF (rules)",
      useAutoMessagePage ? "message page ON" : null,
      useAutoMessagePerson ? "message employee ON" : null,
    ].filter(Boolean).join(" · "),
  });

  // Shared state for every job in this run. The AI switches flip off in place
  // when the provider runs out of quota, and the apply routine reports back
  // whether the tab still shows the results page.
  const jobCtx = {
    searchId,
    listUrl: "",
    useAI,
    useJobMatching,
    useAIFormFilling,
    useAutoMessagePage,
    useAutoMessagePerson,
    storedRules: null,
    application: null,
    navigatedAway: false,
  };

  try {
    // Step 1: Get one search URL per keyword (LinkedIn doesn't handle a comma-separated
    // multi-phrase keyword string well, so each keyword gets its own search)
    console.log(`[WinPilot] Step 1: Fetching search configuration...`);
    reportProgress("task:progress", { message: "Fetching search configuration..." });
    const startData = await apiCall(`/api/jobs/automate?step=start`, { searchId });
    console.log(`[WinPilot] Step 1 result:`, JSON.stringify(startData).substring(0, 300));
    // remaining is null when server-side daily caps are disabled
    const remainingText =
      startData.remaining == null ? "no daily limit" : `${startData.remaining} remaining today`;
    emitLog("info", "extension", "Search configuration received", `${startData.searches?.length || 0} keyword(s), ${remainingText}`);

    if (!startData.searches?.length) {
      throw new Error("No search URL returned");
    }

    // "both" runs LinkedIn entries, then Indeed entries, sequentially — one
    // tab per platform, never interleaved.
    const linkedinSearches = startData.searches.filter((s) => s.platform !== "indeed");
    const indeedSearches = startData.searches.filter((s) => s.platform === "indeed");

    reportProgress("task:progress", {
      message: `Navigating to job search (${remainingText})...`,
    });

    let tab = null;
    if (linkedinSearches.length > 0) {
      tab = await ensureLinkedInTab();
      console.log(`[WinPilot] Got LinkedIn tab: id=${tab.id}, url=${tab.url}`);
    }

    if (automationAborted) return cleanup("Automation stopped by user");

    // Helper: build a search URL for a specific page number
    function getSearchUrlForPage(baseUrl, pageNum) {
      try {
        const url = new URL(baseUrl);
        if (pageNum > 1) {
          url.searchParams.set("start", String((pageNum - 1) * 25));
        } else {
          url.searchParams.delete("start");
        }
        return url.toString();
      } catch {
        return baseUrl;
      }
    }

    // Configuration for multi-page processing. These are runaway guards for a
    // single run, not a daily policy cap (daily caps are disabled server-side).
    const MAX_PAGES = 20;
    const MAX_JOBS_PER_RUN = 500;
    let totalAppliedCount = 0;
    let totalFailedCount = 0;
    let totalSkippedQualificationCount = 0;
    let totalPagesProcessed = 0;
    const processedJobIds = new Set();

    // Search each LinkedIn keyword one at a time
    keywordLoop: for (const { keyword, url: keywordSearchUrl } of linkedinSearches) {
      if (automationAborted) return cleanup("Automation stopped by user");
      if (totalAppliedCount + totalFailedCount >= MAX_JOBS_PER_RUN) break keywordLoop;

      console.log(`[WinPilot] ====== Searching keyword: "${keyword}" ======`);
      emitLog("info", "extension", `Searching keyword: "${keyword}"`);
      reportProgress("task:progress", { message: `Searching for "${keyword}"...` });

      try {
        await chrome.tabs.update(tab.id, { url: keywordSearchUrl, active: true });
        await waitForTabLoad(tab.id);
        await randomDelay(4000, 7000); // Longer initial load wait
        const csReady = await ensureContentScriptReady(tab.id);
        console.log(`[WinPilot] Content script ready: ${csReady}`);
        if (!csReady) {
          emitLog("warn", "extension", `Skipping "${keyword}": could not connect to the LinkedIn tab's content script`);
          continue keywordLoop;
        }

        // Session health check before starting
        if (!(await ensureSessionHealthy(tab.id))) {
          return cleanup("Automation stopped: LinkedIn session could not be restored");
        }

        let currentPage = 1;

        // Multi-page loop
        pageLoop: for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
          if (automationAborted) return cleanup("Automation stopped by user");

          currentPage = pageNum;
          totalPagesProcessed++;
          const currentPageUrl = getSearchUrlForPage(keywordSearchUrl, pageNum);

      // Navigate to the correct page (only if pageNum > 1 or first time)
      if (pageNum > 1) {
        console.log(`[WinPilot] Navigating to page ${pageNum}: ${currentPageUrl}`);

        // Take a longer break between pages (natural behavior)
        emitLog("info", "extension", `Taking a break before navigating to page ${pageNum}...`);
        await randomDelay(5000, 15000);

        await navigateAndWait(tab.id, currentPageUrl);
        await randomDelay(3000, 5000);

        // Session check after page navigation
        if (!(await ensureSessionHealthy(tab.id))) {
          return cleanup("Automation stopped: LinkedIn session could not be restored");
        }
      }

      console.log(`[WinPilot] ====== Processing Page ${pageNum}/${MAX_PAGES} ======`);
      reportProgress("task:progress", { message: `Processing page ${pageNum}...` });

      // Step 2: Scrape job listings for current page
      console.log(`[WinPilot] Step 2: Scraping job listings on page ${pageNum}...`);
      reportProgress("task:progress", { message: `Scraping job listings on page ${pageNum}...` });
      // Simulate browsing the listings page first
      await randomDelay(2500, 5000);

      let scrapeResult = await sendToContentScript(tab.id, {
        type: "EXECUTE_ACTION",
        command: "SCRAPE_JOB_LISTINGS",
        actionId: `scrape-listings-p${pageNum}`,
      });

      let scrapedJobs = scrapeResult?.data?.jobs || [];

      // LinkedIn periodically changes the results page layout (e.g. the "AI job
      // search" rollout), which can leave the scraper reading 0 jobs off a page
      // that actually has results. Reload once and retry on page 1 before
      // concluding the search truly came back empty.
      if (scrapedJobs.length === 0 && pageNum === 1 && !scrapeResult?.data?.noResultsConfirmed) {
        console.warn(`[WinPilot] Page ${pageNum}: 0 jobs parsed, reloading and retrying once...`);
        emitLog("warn", "extension", "No jobs parsed on first attempt — reloading and retrying once...");
        await navigateAndWait(tab.id, currentPageUrl);
        await randomDelay(3000, 5000);
        scrapeResult = await sendToContentScript(tab.id, {
          type: "EXECUTE_ACTION",
          command: "SCRAPE_JOB_LISTINGS",
          actionId: `scrape-listings-p${pageNum}-retry`,
        });
        scrapedJobs = scrapeResult?.data?.jobs || [];
      }

      console.log(`[WinPilot] Page ${pageNum}: ${scrapedJobs.length} jobs found`);
      emitLog("info", "extension", `Page ${pageNum}: ${scrapedJobs.length} jobs found`);
      if (scrapedJobs.length > 0) {
        console.log(`[WinPilot] First job:`, JSON.stringify(scrapedJobs[0]));
      }

      if (scrapedJobs.length === 0) {
        if (pageNum === 1) {
          console.error(`[WinPilot] Step 2 FAILED: scrapeResult =`, JSON.stringify(scrapeResult));
          const reason = scrapeResult?.data?.noResultsConfirmed
            ? "No jobs found on the search results page"
            : "No jobs found on the search results page (LinkedIn's page layout may have changed — retried once)";
          throw new Error(reason);
        } else {
          console.log(`[WinPilot] No more jobs found on page ${pageNum}, finishing pagination`);
          break pageLoop;
        }
      }

      // Process all unapplied jobs with a URL/id. Do NOT gate on list-card Easy Apply badges —
      // modern LinkedIn often hides them, which previously left eligible=0 on full pages of jobs.
      // Easy Apply vs external is decided on the detail pane / CLICK_EASY_APPLY.
      const eligibleJobs = scrapedJobs.filter((job) => {
        if (job?.applied) return false;
        const hasTarget = !!(job?.url || job?.jobId);
        if (!hasTarget) return false;
        const keys = [job.jobId, job.url].filter(Boolean);
        if (keys.some((k) => processedJobIds.has(k))) return false;
        return true;
      });
      const dedupedEligibleJobs = [];
      const seenJobKeys = new Set();
      for (const job of eligibleJobs) {
        // Ensure every job has a navigable URL
        if (!job.url && job.jobId) {
          job.url = `https://www.linkedin.com/jobs/view/${job.jobId}/`;
        }
        const key = (job.jobId || job.url || "").trim();
        if (!key || seenJobKeys.has(key) || processedJobIds.has(key)) continue;
        seenJobKeys.add(key);
        dedupedEligibleJobs.push(job);
      }
      const skippedAppliedCount = scrapedJobs.filter((job) => job?.applied).length;
      const knownEasyApplyCount = scrapedJobs.filter((job) => job?.easyApply === true).length;
      const unknownApplyCount = scrapedJobs.filter(
        (job) => job?.easyApply == null || job?.easyApply === undefined
      ).length;
      const externalOnCardCount = scrapedJobs.filter((job) => job?.easyApply === false).length;
      const missingUrlCount = scrapedJobs.filter((job) => !job?.url && !job?.jobId).length;

      console.log(
        `[WinPilot] Page ${pageNum} eligibility: total=${scrapedJobs.length}, easyApplyBadge=${knownEasyApplyCount}, unknown=${unknownApplyCount}, externalCard=${externalOnCardCount}, noUrl=${missingUrlCount}, alreadyApplied=${skippedAppliedCount}, eligible=${dedupedEligibleJobs.length}`
      );
      emitLog(
        "info",
        "extension",
        `Page ${pageNum} eligibility: total=${scrapedJobs.length}, easyApplyBadge=${knownEasyApplyCount}, unknown=${unknownApplyCount}, externalCard=${externalOnCardCount}, noUrl=${missingUrlCount}, alreadyApplied=${skippedAppliedCount}, eligible=${dedupedEligibleJobs.length}`
      );

      if (dedupedEligibleJobs.length === 0) {
        console.log(`[WinPilot] No new eligible jobs on page ${pageNum}, trying next page...`);
        continue;
      }

      reportProgress("job:found", {
        message: `Page ${pageNum}: Found ${scrapedJobs.length} jobs (${skippedAppliedCount} already applied). Processing ${dedupedEligibleJobs.length} eligible jobs.`,
        count: scrapedJobs.length,
        page: pageNum,
      });

      jobCtx.storedRules = await getStoredFormRules();
      jobCtx.listUrl = currentPageUrl;
      jobCtx.navigatedAway = false;
      const remainingQuota = MAX_JOBS_PER_RUN - totalAppliedCount - totalFailedCount;
      const jobsToProcessOnThisPage = Math.min(dedupedEligibleJobs.length, remainingQuota, 25);

      if (jobsToProcessOnThisPage <= 0) {
        console.log(`[WinPilot] Reached max jobs limit (${MAX_JOBS_PER_RUN}), stopping`);
        break pageLoop;
      }

      let pageAppliedCount = 0;
      let pageFailedCount = 0;
      let pageSkippedQualificationCount = 0;

      for (let jobIndex = 0; jobIndex < jobsToProcessOnThisPage; jobIndex++) {
        const candidateJob = dedupedEligibleJobs[jobIndex];

        // Mark as processed to avoid reprocessing
        processedJobIds.add(candidateJob.jobId || candidateJob.url);

        if (automationAborted) return cleanup("Automation stopped by user");

        // ─── Anti-Detection: Session check before each job ───
        if (!(await ensureSessionHealthy(tab.id))) {
          return cleanup("Automation stopped: LinkedIn session could not be restored");
        }

        // ─── Anti-Detection: Natural browsing break every 2-4 jobs ───
        if (jobIndex > 0 && jobIndex % (2 + Math.floor(Math.random() * 3)) === 0) {
          emitLog("info", "extension", `Taking a natural browsing break after ${jobIndex} jobs...`);
          await simulateBrowsingBreak(tab.id);
        }

        // ─── Anti-Detection: Variable inter-job delay (longer than before) ───
        if (jobIndex > 0) {
          const interJobDelay = 5000 + Math.random() * 15000; // 5-20 seconds between jobs
          await randomDelay(interJobDelay * 0.8, interJobDelay * 1.2);
        }

        try {
          console.log(`[WinPilot] Processing job ${jobIndex + 1}/${jobsToProcessOnThisPage} (page ${pageNum}): ${candidateJob.title}`);
          emitLog("info", "extension", `Processing job ${jobIndex + 1}/${jobsToProcessOnThisPage} (page ${pageNum}): ${candidateJob.title}`);

          const outcome = await processJobCandidate(tab.id, candidateJob, jobCtx, {
            actionKey: `p${pageNum}-${jobIndex}`,
          });

          if (outcome.status === "skipped") {
            if (outcome.qualification) pageSkippedQualificationCount++;
            pageFailedCount++;
            totalFailedCount++;
            reportProgress("task:progress", {
              message: `Skipping ${candidateJob.title}: ${outcome.reason}.`,
              jobTitle: candidateJob.title,
            });
            continue;
          }

          const appliedApp = outcome.application;

          pageAppliedCount++;
          totalAppliedCount++;
          reportProgress("job:applied", {
            message: `Applied to ${appliedApp.jobTitle} at ${appliedApp.company}`,
            jobTitle: appliedApp.jobTitle,
            company: appliedApp.company,
            appliedCount: totalAppliedCount,
            page: currentPage,
          });
        } catch (jobErr) {
          if (jobCtx.application?._id) {
            await apiCall(`/api/jobs/automate?step=complete`, {
              applicationId: jobCtx.application._id,
              success: false,
              notes: `Auto-apply failed: ${jobErr.message}`,
            }).catch(() => {});
          }

          // A stop request or a lost session ends the run, not just this job
          if (jobErr?.aborted) return cleanup("Automation stopped by user");
          if (jobErr?.fatal) return cleanup(`Automation stopped: ${jobErr.message}`);

          pageFailedCount++;
          totalFailedCount++;
          reportProgress("task:error", {
            message: `Skipped ${candidateJob.title}: ${jobErr.message}`,
            jobTitle: candidateJob.title,
          });
          // If the error might have caused navigation, flag for return
          jobCtx.navigatedAway = true;
        }
      }

      // Update total skipped count
      totalSkippedQualificationCount += pageSkippedQualificationCount;

      console.log(`[WinPilot] Page ${pageNum} complete: Applied=${pageAppliedCount}, Failed=${pageFailedCount}, Skipped=${pageSkippedQualificationCount}`);
      emitLog("info", "extension", `Page ${pageNum} complete: Applied=${pageAppliedCount}, Failed=${pageFailedCount}, Skipped=${pageSkippedQualificationCount}`);

      // Check if we should continue to the next page
      if (totalAppliedCount + totalFailedCount >= MAX_JOBS_PER_RUN) {
        console.log(`[WinPilot] Reached max jobs limit (${MAX_JOBS_PER_RUN}), stopping pagination`);
        break pageLoop;
      }
        } // End of pageLoop
      } catch (keywordErr) {
        console.error(`[WinPilot] Keyword "${keyword}" failed: ${keywordErr.message}`);
        emitLog("warn", "extension", `Search for "${keyword}" failed: ${keywordErr.message}`);
        reportProgress("task:progress", {
          message: `No results for "${keyword}" (${keywordErr.message}), trying next keyword...`,
        });
        continue keywordLoop;
      }
    } // End of keywordLoop

    // Indeed leg — runs after every LinkedIn keyword, on its own tab, never
    // interleaved with the LinkedIn loop above.
    if (indeedSearches.length > 0 && !automationAborted) {
      const indeedTab = await ensureIndeedTab();
      const indeedStats = { applied: 0, failed: 0 };
      jobCtx.searchId = searchId;
      for (const { keyword, url: indeedSearchUrl } of indeedSearches) {
        if (automationAborted) break;
        await runIndeedKeywordSearch(indeedTab, keyword, indeedSearchUrl, jobCtx, indeedStats);
      }
      totalAppliedCount += indeedStats.applied;
      totalFailedCount += indeedStats.failed;
    }

    reportProgress("task:complete", {
      message: `Automation complete. Keywords searched: ${startData.searches.length}, pages processed: ${totalPagesProcessed}. Applied: ${totalAppliedCount}, Failed/Skipped: ${totalFailedCount} (${totalSkippedQualificationCount} skipped by LinkedIn qualification signal).`,
      appliedCount: totalAppliedCount,
      failedCount: totalFailedCount,
      skippedQualificationCount: totalSkippedQualificationCount,
      pagesProcessed: totalPagesProcessed,
    });
    return cleanup();
  } catch (err) {
    console.error("[WinPilot] ====== AUTOMATION FAILED ======");
    console.error("[WinPilot] Error:", err.message);
    console.error("[WinPilot] Stack:", err.stack);
    console.error("[WinPilot] apiUrl:", apiUrl, "authToken:", authToken ? `${authToken.substring(0, 8)}...` : "NOT SET");
    emitLog("error", "system", `AUTOMATION FAILED: ${err.message}`);
    reportProgress("task:error", {
      message: `Automation failed: ${err.message}`,
    });
  }

  cleanup();
}

function stopAutomation() {
  automationAborted = true;
  reportProgress("task:progress", { message: "Stopping automation..." });
}

/**
 * Apply to every job on a results page the user pasted a link to — a saved
 * search, a collection, or one of LinkedIn's "jobs that match your profile"
 * feeds. Reads the page's job list and runs the same per-job pipeline the
 * saved-search automation uses, for that one page.
 */
/**
 * Indeed counterpart of the LinkedIn body of startListApply below — applies
 * to every job on a pasted Indeed results page. `jobCtx` and the
 * automationRunning/automationAborted flags are already set up by the caller;
 * this owns the rest of the run (including calling cleanup()) so
 * startListApply can simply `return` its result.
 */
async function runIndeedListApply(resolved, jobCtx) {
  let appliedCount = 0;
  let failedCount = 0;

  try {
    jobCtx.listUrl = resolved.listUrl;
    const tab = await ensureIndeedTab();
    if (automationAborted) return cleanup("Automation stopped by user");

    reportProgress("task:progress", { message: "Opening the Indeed jobs page..." });
    await navigateAndWaitIndeed(tab.id, jobCtx.listUrl);
    await randomDelay(3000, 5000);

    if (!(await ensureIndeedContentScriptReady(tab.id))) {
      throw new Error("Could not connect to the Indeed tab — reload Indeed and try again");
    }
    if (!(await ensureIndeedSessionHealthy(tab.id))) {
      return cleanup("Automation stopped: Indeed session could not be restored");
    }

    reportProgress("task:progress", { message: "Reading the jobs on the page..." });
    await randomDelay(2000, 4000);

    const scrapeResult = await sendToContentScript(tab.id, {
      type: "EXECUTE_ACTION",
      command: "SCRAPE_JOB_LISTINGS",
      actionId: "indeed-scrape-pasted-list",
    });
    const scrapedJobs = scrapeResult?.data?.jobs || [];
    const alreadyAppliedOnPage = scrapedJobs.filter((job) => job?.applied).length;

    let candidates = [];
    const seen = new Set();
    for (const job of scrapedJobs) {
      if (job?.applied) continue;
      if (!job?.url && !job?.jobId) continue;
      const url = job.url || `https://www.indeed.com/viewjob?jk=${job.jobId}`;
      const key = job.jobId || url;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ ...job, url });
    }

    if (candidates.length === 0 && resolved.jobIds?.length) {
      emitLog(
        "warn",
        "extension",
        `Could not read the list on the page — using the ${resolved.jobIds.length} job id(s) from the link instead`
      );
      candidates = resolved.jobIds.map((jobId, i) => ({
        jobId,
        url: (resolved.jobUrls || [])[i] || `https://www.indeed.com/viewjob?jk=${jobId}`,
        title: `Job ${jobId}`,
        company: "",
      }));
    }

    if (candidates.length === 0) {
      throw new Error(
        alreadyAppliedOnPage > 0
          ? `No new jobs on that page — all ${alreadyAppliedOnPage} are already applied to`
          : "No jobs found on that page"
      );
    }

    let alreadyAppliedBefore = 0;
    try {
      const filtered = await apiCall(`/api/jobs/automate?step=filter-applied`, {
        jobUrls: candidates.map((c) => c.url),
      });
      const appliedUrls = new Set(filtered?.appliedUrls || []);
      if (appliedUrls.size > 0) {
        alreadyAppliedBefore = candidates.filter((c) => appliedUrls.has(c.url)).length;
        candidates = candidates.filter((c) => !appliedUrls.has(c.url));
      }
    } catch (filterErr) {
      emitLog("warn", "api", "Could not check previously applied jobs", filterErr?.message || "");
    }

    const maxJobs = Number.isFinite(resolved.maxJobs) ? resolved.maxJobs : 15;
    const jobsToProcess = Math.min(candidates.length, Math.max(0, maxJobs));

    if (jobsToProcess === 0) {
      reportProgress("task:complete", {
        message: `Nothing to do — every job on that page was already applied to.`,
        appliedCount: 0,
        failedCount: 0,
      });
      return cleanup();
    }

    const skippedNote = alreadyAppliedOnPage + alreadyAppliedBefore;
    reportProgress("job:found", {
      message: `Found ${scrapedJobs.length || candidates.length} job(s) on the page — applying to ${jobsToProcess}${skippedNote ? ` (${skippedNote} already applied)` : ""}.`,
      count: jobsToProcess,
    });

    jobCtx.storedRules = await getStoredFormRules();

    for (let i = 0; i < jobsToProcess; i++) {
      const candidateJob = candidates[i];
      if (automationAborted) return cleanup("Automation stopped by user");
      if (!(await ensureIndeedSessionHealthy(tab.id))) {
        return cleanup("Automation stopped: Indeed session could not be restored");
      }

      if (i > 0) {
        const interJobDelay = 5000 + Math.random() * 15000;
        await randomDelay(interJobDelay * 0.8, interJobDelay * 1.2);
      }

      try {
        const outcome = await processIndeedJobCandidate(tab.id, candidateJob, jobCtx, {
          actionKey: `indeed-list-${i}`,
        });
        if (outcome.status === "skipped") {
          failedCount++;
          reportProgress("task:progress", {
            message: `Skipping ${candidateJob.title}: ${outcome.reason}.`,
            jobTitle: candidateJob.title,
          });
          continue;
        }
        appliedCount++;
        reportProgress("job:applied", {
          message: `Applied to ${outcome.application.jobTitle} at ${outcome.application.company} (Indeed)`,
          jobTitle: outcome.application.jobTitle,
          company: outcome.application.company,
          appliedCount,
        });
      } catch (jobErr) {
        if (jobCtx.application?._id) {
          await apiCall(`/api/jobs/automate?step=complete`, {
            applicationId: jobCtx.application._id,
            success: false,
            notes: `Auto-apply failed: ${jobErr.message}`,
          }).catch(() => {});
        }
        if (jobErr?.aborted) return cleanup("Automation stopped by user");
        failedCount++;
        reportProgress("task:error", {
          message: `Skipped ${candidateJob.title}: ${jobErr.message}`,
          jobTitle: candidateJob.title,
        });
        jobCtx.navigatedAway = true;
      }
    }

    reportProgress("task:complete", {
      message: `Page complete. Applied: ${appliedCount}, skipped/failed: ${failedCount}.`,
      appliedCount,
      failedCount,
    });
    return cleanup();
  } catch (err) {
    console.error("[WinPilot] Indeed job list apply failed:", err.message);
    emitLog("error", "system", `INDEED LIST APPLY FAILED: ${err.message}`);
    reportProgress("task:error", { message: `Could not apply: ${err.message}` });
    reportProgress("task:complete", {
      message: `Stopped after ${appliedCount} application(s): ${err.message}`,
      appliedCount,
      failedCount,
    });
  }

  cleanup();
}

async function startListApply(rawUrl, options = {}) {
  if (automationRunning) {
    reportProgress("task:error", { message: "Automation already running" });
    return;
  }

  const { useAI, useJobMatching, useAIFormFilling, useAutoMessagePage, useAutoMessagePerson } = normalizeAutomationOptions(options);
  const jobCtx = {
    searchId: null,
    listUrl: "",
    useAI,
    useJobMatching,
    useAIFormFilling,
    useAutoMessagePage,
    useAutoMessagePerson,
    storedRules: null,
    application: null,
    navigatedAway: false,
  };

  automationRunning = true;
  automationAborted = false;
  chrome.storage.local.set({
    automationRunning: true,
    automationSearchId: null,
    useAIFormFilling,
  });

  console.log(`[WinPilot] ====== APPLY TO PASTED JOB LIST ======`, rawUrl);
  emitLog("info", "system", "====== APPLY TO PASTED JOB LIST ======", rawUrl);
  reportProgress("task:start", { label: "Applying to the jobs on that page..." });

  let appliedCount = 0;
  let failedCount = 0;
  let skippedQualificationCount = 0;

  try {
    // Step 1: server validates the link and hands back a clean results URL
    const resolved = await apiCall(`/api/jobs/automate?step=list-apply`, { url: rawUrl });
    if (!resolved?.listUrl) {
      throw new Error("Could not read a jobs list from that link");
    }

    if (resolved.platform === "indeed") {
      return await runIndeedListApply(resolved, jobCtx);
    }

    jobCtx.listUrl = resolved.listUrl;

    // Step 2: open the results page
    const tab = await ensureLinkedInTab();
    if (automationAborted) return cleanup("Automation stopped by user");

    reportProgress("task:progress", { message: "Opening the jobs page..." });
    await navigateAndWait(tab.id, jobCtx.listUrl);
    await randomDelay(4000, 7000);

    if (!(await ensureContentScriptReady(tab.id))) {
      throw new Error("Could not connect to the LinkedIn tab — reload LinkedIn and try again");
    }
    if (!(await ensureSessionHealthy(tab.id))) {
      return cleanup("Automation stopped: LinkedIn session could not be restored");
    }

    // Step 3: read the job list, with one reload retry — LinkedIn periodically
    // ships layout changes that leave the scraper reading 0 jobs off a full page
    reportProgress("task:progress", { message: "Reading the jobs on the page..." });
    await randomDelay(2000, 4000);

    let scrapeResult = await sendToContentScript(tab.id, {
      type: "EXECUTE_ACTION",
      command: "SCRAPE_JOB_LISTINGS",
      actionId: "scrape-pasted-list",
    });
    let scrapedJobs = scrapeResult?.data?.jobs || [];

    if (scrapedJobs.length === 0 && !scrapeResult?.data?.noResultsConfirmed) {
      emitLog("warn", "extension", "No jobs parsed on first attempt — reloading and retrying once...");
      await navigateAndWait(tab.id, jobCtx.listUrl);
      await randomDelay(3000, 5000);
      scrapeResult = await sendToContentScript(tab.id, {
        type: "EXECUTE_ACTION",
        command: "SCRAPE_JOB_LISTINGS",
        actionId: "scrape-pasted-list-retry",
      });
      scrapedJobs = scrapeResult?.data?.jobs || [];
    }

    const alreadyAppliedOnPage = scrapedJobs.filter((job) => job?.applied).length;

    // Build the candidate list: everything on the page with a usable target
    let candidates = [];
    const seen = new Set();
    for (const job of scrapedJobs) {
      if (job?.applied) continue;
      if (!job?.url && !job?.jobId) continue;
      const url = job.url || `https://www.linkedin.com/jobs/view/${job.jobId}/`;
      const key = job.jobId || url;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ ...job, url });
    }

    // The page rendered nothing we could read — fall back to the job ids the
    // link itself names, opening each job page directly.
    if (candidates.length === 0 && resolved.jobIds?.length) {
      emitLog(
        "warn",
        "extension",
        `Could not read the list on the page — using the ${resolved.jobIds.length} job id(s) from the link instead`
      );
      candidates = resolved.jobIds.map((jobId, i) => ({
        jobId,
        url: (resolved.jobUrls || [])[i] || `https://www.linkedin.com/jobs/view/${jobId}/`,
        title: `Job ${jobId}`,
        company: "",
      }));
    }

    if (candidates.length === 0) {
      throw new Error(
        alreadyAppliedOnPage > 0
          ? `No new jobs on that page — all ${alreadyAppliedOnPage} are already applied to`
          : "No jobs found on that page"
      );
    }

    // Step 4: drop the ones already applied to in an earlier run
    let alreadyAppliedBefore = 0;
    try {
      const filtered = await apiCall(`/api/jobs/automate?step=filter-applied`, {
        jobUrls: candidates.map((c) => c.url),
      });
      const appliedUrls = new Set(filtered?.appliedUrls || []);
      if (appliedUrls.size > 0) {
        alreadyAppliedBefore = candidates.filter((c) => appliedUrls.has(c.url)).length;
        candidates = candidates.filter((c) => !appliedUrls.has(c.url));
      }
    } catch (filterErr) {
      emitLog("warn", "api", "Could not check previously applied jobs", filterErr?.message || "");
    }

    const maxJobs = Number.isFinite(resolved.maxJobs) ? resolved.maxJobs : 25;
    const jobsToProcess = Math.min(candidates.length, Math.max(0, maxJobs));

    if (jobsToProcess === 0) {
      reportProgress("task:complete", {
        message: `Nothing to do — every job on that page was already applied to.`,
        appliedCount: 0,
        failedCount: 0,
      });
      return cleanup();
    }

    const skippedNote = alreadyAppliedOnPage + alreadyAppliedBefore;
    reportProgress("job:found", {
      message: `Found ${scrapedJobs.length || candidates.length} job(s) on the page — applying to ${jobsToProcess}${skippedNote ? ` (${skippedNote} already applied)` : ""}.`,
      count: jobsToProcess,
    });

    // Step 5: apply to each one with the shared pipeline
    jobCtx.storedRules = await getStoredFormRules();

    for (let i = 0; i < jobsToProcess; i++) {
      const candidateJob = candidates[i];

      if (automationAborted) return cleanup("Automation stopped by user");

      if (!(await ensureSessionHealthy(tab.id))) {
        return cleanup("Automation stopped: LinkedIn session could not be restored");
      }

      // ─── Anti-Detection: natural browsing break every 2-4 jobs ───
      if (i > 0 && i % (2 + Math.floor(Math.random() * 3)) === 0) {
        emitLog("info", "extension", `Taking a natural browsing break after ${i} jobs...`);
        await simulateBrowsingBreak(tab.id);
      }

      // ─── Anti-Detection: variable inter-job delay ───
      if (i > 0) {
        const interJobDelay = 5000 + Math.random() * 15000;
        await randomDelay(interJobDelay * 0.8, interJobDelay * 1.2);
      }

      try {
        console.log(`[WinPilot] Processing job ${i + 1}/${jobsToProcess}: ${candidateJob.title}`);
        emitLog("info", "extension", `Processing job ${i + 1}/${jobsToProcess}: ${candidateJob.title}`);

        const outcome = await processJobCandidate(tab.id, candidateJob, jobCtx, {
          actionKey: `list-${i}`,
        });

        if (outcome.status === "skipped") {
          if (outcome.qualification) skippedQualificationCount++;
          failedCount++;
          reportProgress("task:progress", {
            message: `Skipping ${candidateJob.title}: ${outcome.reason}.`,
            jobTitle: candidateJob.title,
          });
          continue;
        }

        appliedCount++;
        reportProgress("job:applied", {
          message: `Applied to ${outcome.application.jobTitle} at ${outcome.application.company}`,
          jobTitle: outcome.application.jobTitle,
          company: outcome.application.company,
          appliedCount,
        });
      } catch (jobErr) {
        if (jobCtx.application?._id) {
          await apiCall(`/api/jobs/automate?step=complete`, {
            applicationId: jobCtx.application._id,
            success: false,
            notes: `Auto-apply failed: ${jobErr.message}`,
          }).catch(() => {});
        }

        // A stop request or a lost session ends the run, not just this job
        if (jobErr?.aborted) return cleanup("Automation stopped by user");
        if (jobErr?.fatal) return cleanup(`Automation stopped: ${jobErr.message}`);

        failedCount++;
        reportProgress("task:error", {
          message: `Skipped ${candidateJob.title}: ${jobErr.message}`,
          jobTitle: candidateJob.title,
        });
        jobCtx.navigatedAway = true;
      }
    }

    reportProgress("task:complete", {
      message: `Page complete. Applied: ${appliedCount}, skipped/failed: ${failedCount} (${skippedQualificationCount} skipped by LinkedIn qualification signal).`,
      appliedCount,
      failedCount,
      skippedQualificationCount,
    });
    return cleanup();
  } catch (err) {
    console.error("[WinPilot] Job list apply failed:", err.message);
    emitLog("error", "system", `JOB LIST APPLY FAILED: ${err.message}`);
    reportProgress("task:error", { message: `Could not apply: ${err.message}` });
    reportProgress("task:complete", {
      message: `Stopped after ${appliedCount} application(s): ${err.message}`,
      appliedCount,
      failedCount,
    });
  }

  cleanup();
}

/**
 * Apply to a single job the user pasted a link to.
 *
 * Same pipeline as the search run — check the job, tailor the resume, fill and
 * submit Easy Apply — but for exactly one job, with no search behind it. The
 * server resolves whatever LinkedIn link shape was pasted into a job page URL.
 */
/**
 * Indeed counterpart of the LinkedIn body of startSingleApply below — applies
 * to exactly one Indeed job. `ctx` and the automationRunning/automationAborted
 * flags are already set up by the caller; this owns the rest of the run
 * (including calling cleanup()) so startSingleApply can simply `return` its
 * result. Indeed has no qualification signal to check, so this skips straight
 * to reading the posting and applying.
 */
async function runIndeedSingleApply(resolved, ctx) {
  try {
    const jobUrl = resolved.jobUrl;
    const tab = await ensureIndeedTab();
    if (automationAborted) return cleanup("Automation stopped by user");

    reportProgress("task:progress", { message: `Opening job ${resolved.jobId}...` });
    await navigateAndWaitIndeed(tab.id, jobUrl);
    await randomDelay(2500, 4500);

    if (!(await ensureIndeedContentScriptReady(tab.id))) {
      throw new Error("Could not connect to the Indeed tab — reload Indeed and try again");
    }
    if (!(await ensureIndeedSessionHealthy(tab.id))) {
      return cleanup("Automation stopped: Indeed session could not be restored");
    }

    await randomDelay(2000, 4000);
    let detail = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (automationAborted) return cleanup("Automation stopped by user");
      const detailResult = await sendToContentScript(tab.id, {
        type: "EXECUTE_ACTION",
        command: "SCRAPE_JOB_DETAIL",
        actionId: `indeed-detail-single-${resolved.jobId}-${attempt}`,
      });
      detail = detailResult?.data?.detail;
      if (detail?.description) break;
      await randomDelay(1500, 2500);
    }

    if (!detail?.description) {
      throw new Error("Could not read the job description from that page");
    }

    const jobWithDetail = {
      url: jobUrl,
      jobId: resolved.jobId,
      title: detail.title || "Job",
      company: detail.company || "Unknown",
      location: detail.location || "",
      description: detail.description,
    };

    reportProgress("job:found", {
      message: `Found ${jobWithDetail.title} at ${jobWithDetail.company}`,
      count: 1,
    });

    ctx.storedRules = await getStoredFormRules();
    const applied = await applyToIndeedJob(tab.id, jobWithDetail, ctx);

    reportProgress("job:applied", {
      message: `Applied to ${applied.jobTitle} at ${applied.company} (Indeed)`,
      jobTitle: applied.jobTitle,
      company: applied.company,
      appliedCount: 1,
    });
    reportProgress("task:complete", {
      message: `Applied to ${applied.jobTitle} at ${applied.company}.`,
      appliedCount: 1,
      failedCount: 0,
    });
    return cleanup();
  } catch (err) {
    if (ctx.application?._id) {
      await apiCall(`/api/jobs/automate?step=complete`, {
        applicationId: ctx.application._id,
        success: false,
        notes: `Auto-apply failed: ${err.message}`,
      }).catch(() => {});
    }
    if (err?.aborted) return cleanup("Automation stopped by user");

    const reason = /apply button not found/i.test(err.message || "")
      ? `${err.message} — this job likely applies on the company's own website, which WinPilot can't automate.`
      : err.message;

    console.error("[WinPilot] Indeed single job apply failed:", err.message);
    emitLog("error", "system", `INDEED SINGLE JOB APPLY FAILED: ${err.message}`);
    reportProgress("task:error", { message: `Could not apply: ${reason}` });
    reportProgress("task:complete", {
      message: `Did not apply to the pasted job: ${reason}`,
      appliedCount: 0,
      failedCount: 1,
    });
  }

  cleanup();
}

async function startSingleApply(rawUrl, options = {}) {
  if (automationRunning) {
    reportProgress("task:error", { message: "Automation already running" });
    return;
  }

  const { useAI, useJobMatching, useAIFormFilling, useAutoMessagePage, useAutoMessagePerson } = normalizeAutomationOptions(options);
  const ctx = {
    searchId: null,
    useAI,
    useJobMatching,
    useAIFormFilling,
    useAutoMessagePage,
    useAutoMessagePerson,
    storedRules: null,
    application: null,
    navigatedAway: false,
  };

  automationRunning = true;
  automationAborted = false;
  chrome.storage.local.set({
    automationRunning: true,
    automationSearchId: null,
    useAIFormFilling,
  });

  console.log(`[WinPilot] ====== SINGLE JOB APPLY ======`, rawUrl);
  emitLog("info", "system", "====== SINGLE JOB APPLY ======", rawUrl);
  reportProgress("task:start", { label: "Applying to pasted job link..." });

  try {
    // Step 1: server turns the pasted link into a canonical job URL and tells
    // us whether this job was already applied to
    const resolved = await apiCall(`/api/jobs/automate?step=single-apply`, { url: rawUrl });
    const jobUrl = resolved?.jobUrl;
    if (!jobUrl) {
      throw new Error("Could not read a job id from that link");
    }

    if (resolved.alreadyApplied) {
      const label = resolved.existing?.jobTitle
        ? `${resolved.existing.jobTitle} at ${resolved.existing.company}`
        : "this job";
      reportProgress("task:complete", {
        message: `Already applied to ${label} — skipping.`,
        appliedCount: 0,
        failedCount: 0,
      });
      return cleanup();
    }

    if (resolved.platform === "indeed") {
      return await runIndeedSingleApply(resolved, ctx);
    }

    // Step 2: open the job page
    const tab = await ensureLinkedInTab();
    if (automationAborted) return cleanup("Automation stopped by user");

    reportProgress("task:progress", { message: `Opening job ${resolved.jobId}...` });
    await navigateAndWait(tab.id, jobUrl);
    await randomDelay(2500, 4500);

    if (!(await ensureContentScriptReady(tab.id))) {
      throw new Error("Could not connect to the LinkedIn tab — reload LinkedIn and try again");
    }
    if (!(await ensureSessionHealthy(tab.id))) {
      return cleanup("Automation stopped: LinkedIn session could not be restored");
    }

    // Step 3: check the job before applying
    const qualResult = await sendToContentScript(tab.id, {
      type: "EXECUTE_ACTION",
      command: "CHECK_JOB_QUALIFICATION",
      actionId: `qual-single-${resolved.jobId}`,
      maxAttempts: 12,
      delayMs: 350,
    });
    const qualification = qualResult?.data?.qualification || { status: "unknown", matched: false, text: "" };
    const qualificationLabel =
      qualification.text || String(qualification.status || "unknown").replace(/_/g, " ");
    emitLog("info", "extension", `Qualification check: status="${qualification.status}", matched=${qualification.matched}`, qualification.text || "");

    const shouldSkipJob =
      useJobMatching &&
      (qualification.status === "missing_required" ||
        qualification.status === "no_match" ||
        (qualification.matched === false && qualification.status !== "unknown"));

    if (shouldSkipJob) {
      reportProgress("task:complete", {
        message: `Did not apply: LinkedIn qualification signal is "${qualificationLabel}". Turn Job Matching off to apply anyway.`,
        appliedCount: 0,
        failedCount: 1,
      });
      return cleanup();
    }

    // Step 4: read the posting
    await randomDelay(2000, 4000);
    let detail = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (automationAborted) return cleanup("Automation stopped by user");
      const detailResult = await sendToContentScript(tab.id, {
        type: "EXECUTE_ACTION",
        command: "SCRAPE_JOB_DETAIL",
        actionId: `detail-single-${resolved.jobId}-${attempt}`,
      });
      detail = detailResult?.data?.detail;
      if (detail?.description) break;
      await randomDelay(1500, 2500);
    }

    if (!detail?.description) {
      throw new Error("Could not read the job description from that page");
    }

    const jobWithDetail = {
      url: jobUrl,
      jobId: resolved.jobId,
      title: detail.title || "Job",
      company: detail.company || "Unknown",
      location: detail.location || "",
      description: detail.description,
    };

    reportProgress("job:found", {
      message: `Found ${jobWithDetail.title} at ${jobWithDetail.company}`,
      count: 1,
    });

    // Step 5: apply — same routine the search run uses
    ctx.storedRules = await getStoredFormRules();
    const applied = await applyToJobOnTab(tab.id, jobWithDetail, ctx);

    reportProgress("job:applied", {
      message: `Applied to ${applied.jobTitle} at ${applied.company}`,
      jobTitle: applied.jobTitle,
      company: applied.company,
      appliedCount: 1,
    });
    reportProgress("task:complete", {
      message: `Applied to ${applied.jobTitle} at ${applied.company}.`,
      appliedCount: 1,
      failedCount: 0,
    });
    return cleanup();
  } catch (err) {
    if (ctx.application?._id) {
      await apiCall(`/api/jobs/automate?step=complete`, {
        applicationId: ctx.application._id,
        success: false,
        notes: `Auto-apply failed: ${err.message}`,
      }).catch(() => {});
    }

    if (err?.aborted) return cleanup("Automation stopped by user");

    // A missing Easy Apply button on a single pasted job almost always means the
    // posting sends applicants to the company's own site, which can't be automated.
    const reason = /easy apply button not found/i.test(err.message || "")
      ? `${err.message} — this job likely applies on the company's own website, which WinPilot can't automate.`
      : err.message;

    console.error("[WinPilot] Single job apply failed:", err.message);
    emitLog("error", "system", `SINGLE JOB APPLY FAILED: ${err.message}`);
    reportProgress("task:error", { message: `Could not apply: ${reason}` });
    reportProgress("task:complete", {
      message: `Did not apply to the pasted job: ${reason}`,
      appliedCount: 0,
      failedCount: 1,
    });
  }

  cleanup();
}

// ─── Lead Generation Automation State ──────────────────

let leadGenRunning = false;
let leadGenAborted = false;

function stopLeadGen() {
  leadGenAborted = true;
  emitLeadLog("info", "system", "Stopping lead generation...");
}

function emitLeadLog(level, source, message, details) {
  sendToServer({
    type: "REPORT_STATUS",
    event: "leadgen:log",
    level,
    source,
    message,
    details: details || undefined,
  });

  // Also notify popup
  chrome.runtime.sendMessage({
    type: "LEADGEN_PROGRESS",
    level,
    source,
    message,
  }).catch(() => {});
}

function reportLeadProgress(event, data) {
  sendToServer({
    type: "REPORT_STATUS",
    event,
    ...data,
  });

  chrome.runtime.sendMessage({
    type: "LEADGEN_PROGRESS",
    event,
    ...data,
  }).catch(() => {});
}

/**
 * Lead Generation Automation Engine
 *
 * Flow per run:
 *   For each keyword in the campaign:
 *     1. Navigate to LinkedIn search (posts, sorted by date)
 *     2. Scrape visible posts via content script
 *     3. Filter out already-commented posts & posts not mentioning the keyword
 *     4. For each new post (up to postsPerKeyword):
 *        a. Generate a personalized comment (AI or template)
 *        b. Navigate to the individual post page
 *        c. Simulate reading the post
 *        d. Post the comment with human-like typing
 *        e. Record the comment to the server
 *        f. Wait for cooldown (2-5 min)
 *        g. Insert browsing break every ~3 comments
 *
 * Anti-detection measures used:
 *   - Gaussian-distributed delays everywhere
 */
// ─── Profile Scrape: extract user's own LinkedIn profile ────────────────────

async function startProfileScrape() {
  console.log("[WinPilot] Starting profile scrape...");

  let tab;
  try {
    tab = await getLinkedInTab();
  } catch (e) {
    sendToServer({
      type: "PROFILE_SCRAPE_ERROR",
      error: "Could not find an open LinkedIn tab. Please open LinkedIn first.",
    });
    return;
  }

  if (!tab?.id) {
    sendToServer({
      type: "PROFILE_SCRAPE_ERROR",
      error: "No active LinkedIn tab found. Please open LinkedIn and navigate to your profile.",
    });
    return;
  }

  // Check if the tab is on a /in/ profile page
  const tabUrl = tab.url || "";
  if (!tabUrl.includes("linkedin.com/in/")) {
    // Navigate to the user's own profile
    console.log("[WinPilot] Not on a profile page, navigating to profile...");
    try {
      await sendToContentScript(tab.id, {
        type: "EXECUTE_ACTION",
        command: "NAVIGATE",
        actionId: `profile-nav-${Date.now()}`,
        url: "https://www.linkedin.com/in/me/",
      });
      // Wait for navigation
      await new Promise((r) => setTimeout(r, 4000));
      // Re-fetch the tab to get updated URL
      tab = await getLinkedInTab();
      if (!tab?.id) {
        sendToServer({
          type: "PROFILE_SCRAPE_ERROR",
          error: "Navigation to LinkedIn profile failed.",
        });
        return;
      }
    } catch (e) {
      // Navigation closes the channel — that is expected; just wait and continue
      await new Promise((r) => setTimeout(r, 4000));
      tab = await getLinkedInTab();
      if (!tab?.id) {
        sendToServer({ type: "PROFILE_SCRAPE_ERROR", error: "Navigation failed." });
        return;
      }
    }
  }

  // Execute SCRAPE_USER_PROFILE in the content script
  let result;
  try {
    result = await sendToContentScript(tab.id, {
      type: "EXECUTE_ACTION",
      command: "SCRAPE_USER_PROFILE",
      actionId: `profile-scrape-${Date.now()}`,
    });
  } catch (e) {
    sendToServer({
      type: "PROFILE_SCRAPE_ERROR",
      error: `Scrape failed: ${e.message}`,
    });
    return;
  }

  if (result?.status !== "success" || !result?.data?.profileData) {
    sendToServer({
      type: "PROFILE_SCRAPE_ERROR",
      error: result?.error || "Profile scrape returned no data.",
    });
    return;
  }

  // POST scraped data to the server
  try {
    const response = await apiCall("/api/profile-optimizer?action=scrape-profile", result.data.profileData);
    sendToServer({
      type: "PROFILE_SCRAPE_SUCCESS",
      profileId: response.profileId,
      profileData: result.data.profileData,
    });
    console.log("[WinPilot] Profile scrape complete, profileId:", response.profileId);
  } catch (e) {
    sendToServer({
      type: "PROFILE_SCRAPE_ERROR",
      error: `Failed to save profile: ${e.message}`,
    });
  }
}

async function startLeadGenAutomation(campaignId, options = {}) {
  if (leadGenRunning) {
    reportLeadProgress("leadgen:error", { message: "Lead generation already running" });
    return;
  }
  if (automationRunning) {
    reportLeadProgress("leadgen:error", {
      message: "Job automation is running. Stop it first before starting lead generation.",
    });
    return;
  }

  leadGenRunning = true;
  leadGenAborted = false;
  chrome.storage.local.set({ leadGenRunning: true, leadGenCampaignId: campaignId });

  console.log("[WinPilot] ====== STARTING LEAD GEN AUTOMATION ======");
  console.log("[WinPilot] campaignId:", campaignId);

  try {
    // ── Load campaign ────────────────────────────────────────────────────────
    const campaignRes = await fetch(`${apiUrl}/api/lead-gen?id=${encodeURIComponent(campaignId)}`, {
      headers: { "x-auth-token": authToken },
    });
    if (!campaignRes.ok) throw new Error(`Failed to load campaign: ${campaignRes.status}`);
    const { campaign } = await campaignRes.json();

    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "active") {
      reportLeadProgress("leadgen:error", {
        message: `Campaign is ${campaign.status}. Set it to Active first.`,
      });
      return;
    }

    emitLeadLog("info", "system", `Campaign loaded: "${campaign.name}"`);
    emitLeadLog("info", "system", `Keywords: ${campaign.keywords.join(", ")}`);
    emitLeadLog("info", "system", `Daily limit: ${campaign.dailyCommentLimit} | Per keyword: ${campaign.postsPerKeyword}`);

    // ── Ensure LinkedIn tab is open ──────────────────────────────────────────
    const tab = await ensureLinkedInTab();
    if (!tab?.id) {
      reportLeadProgress("leadgen:error", { message: "Could not open LinkedIn tab" });
      return;
    }

    const alreadyCommented = new Set(campaign.alreadyCommentedUrls || []);
    let totalCommentedThisRun = 0;
    let processedPosts = 0;

    // ── Per-keyword loop ─────────────────────────────────────────────────────
    for (const keyword of campaign.keywords) {
      if (leadGenAborted) break;

      emitLeadLog("info", "extension", `Searching for keyword: "${keyword}"`);
      reportLeadProgress("leadgen:progress", {
        message: `Searching LinkedIn for: "${keyword}"`,
        keyword,
      });

      // Check session health before navigating
      if (!await ensureSessionHealthy(tab.id)) break;

      // Navigate to LinkedIn content search, sorted by date
      const searchUrl =
        `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}&sortBy=date_posted`;
      await navigateAndWait(tab.id, searchUrl);

      // Check session again after navigation
      if (!await ensureSessionHealthy(tab.id)) break;

      // Simulate briefly reading the feed before acting
      await randomDelay(3000, 7000);

      // Scrape posts
      let posts = [];
      try {
        const scrapeRes = await sendToContentScript(tab.id, {
          type: "EXECUTE_ACTION",
          command: "SCRAPE_KEYWORD_POSTS",
          actionId: `lead-scrape-${Date.now()}`,
          keyword,
        });
        posts = scrapeRes?.data?.posts || [];
      } catch (e) {
        emitLeadLog("warn", "extension", `Could not scrape posts for "${keyword}": ${e.message}`);
        continue;
      }

      emitLeadLog("info", "extension", `Found ${posts.length} posts for "${keyword}"`);
      reportLeadProgress("leadgen:progress", {
        message: `Found ${posts.length} posts for "${keyword}"`,
        keyword,
        found: posts.length,
      });

      // ── AI intent classification: keep only potential clients ─────────────
      if (campaign.useAI && posts.length > 0) {
        try {
          emitLeadLog("info", "api", `Filtering ${posts.length} posts for client intent...`);
          const classifyRes = await apiCall("/api/lead-gen", {
            action: "classify_posts",
            campaignId,
            posts: posts.slice(0, 15).map((p) => ({
              postUrl: p.postUrl,
              postContent: p.postContent,
              authorName: p.authorName,
              authorHeadline: p.authorHeadline,
            })),
            keyword,
          });
          if (classifyRes?.posts) {
            const before = posts.length;
            posts = classifyRes.posts;
            emitLeadLog(
              posts.length > 0 ? "info" : "warn",
              "api",
              `Client filter: ${posts.length}/${before} posts are potential clients`
            );
            reportLeadProgress("leadgen:progress", {
              message: `${posts.length}/${before} posts identified as potential clients`,
              keyword,
            });
          }
        } catch (e) {
          emitLeadLog("warn", "api", `Intent filter failed: ${e.message} — proceeding with all posts`);
        }
      }

      // Record found count
      try {
        await fetch(`${apiUrl}/api/lead-gen`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-auth-token": authToken },
          body: JSON.stringify({
            id: campaignId,
            // We bump stats.totalFound via a dedicated field — use record_comment for comments
          }),
        });
      } catch { /* ignore — stats update is non-critical */ }

      // Filter out already-commented posts
      const newPosts = posts.filter((p) => {
        const normalized = (p.postUrl || "").split("?")[0].replace(/\/$/, "");
        return normalized && !alreadyCommented.has(normalized);
      });

      if (newPosts.length === 0) {
        emitLeadLog("info", "extension", `No new posts for "${keyword}" — all already commented`);
        continue;
      }

      // ── Per-post loop ──────────────────────────────────────────────────────
      for (const post of newPosts.slice(0, campaign.postsPerKeyword)) {
        if (leadGenAborted) break;

        // Check daily comment limit (from server-side DailyUsage)
        const limitCheckRes = await fetch(
          `${apiUrl}/api/lead-gen`,
          { headers: { "x-auth-token": authToken } }
        );
        if (limitCheckRes.ok) {
          const { commentsToday, commentLimit } = await limitCheckRes.json();
          // commentLimit is null when server-side daily caps are disabled
          if (commentLimit != null && commentsToday >= commentLimit) {
            emitLeadLog("warn", "system", `Daily comment limit (${commentLimit}) reached. Stopping.`);
            reportLeadProgress("leadgen:progress", {
              message: `Daily comment limit (${commentLimit}) reached. Stopping for today.`,
            });
            leadGenAborted = true;
            break;
          }
        }

        // Also respect campaign-level daily limit
        if (totalCommentedThisRun >= campaign.dailyCommentLimit) {
          emitLeadLog("info", "system", `Campaign daily limit (${campaign.dailyCommentLimit}) reached`);
          leadGenAborted = true;
          break;
        }

        emitLeadLog("info", "extension", `Processing post by ${post.authorName || "unknown"}: ${post.postUrl}`);

        // ── Generate comment ───────────────────────────────────────────────
        let comment = "";
        try {
          const genRes = await apiCall("/api/lead-gen", {
            action: "generate_comment",
            campaignId,
            postContent: post.postContent,
            authorName: post.authorName,
            authorHeadline: post.authorHeadline,
            keyword,
          });
          comment = genRes?.comment || "";
        } catch (e) {
          emitLeadLog("warn", "api", `Comment generation failed: ${e.message}. Using template fallback.`);
          // Build a minimal fallback
          const firstName = (post.authorName || "").split(" ")[0];
          const templates = campaign.commentTemplates || [];
          if (templates.length > 0) {
            comment = templates[Math.floor(Math.random() * templates.length)]
              .replace(/\{authorName\}/g, post.authorName || "")
              .replace(/\{firstName\}/g, firstName);
          } else {
            comment = `Hey${firstName ? ` ${firstName}` : ""}, I can help with that! Feel free to message me.`;
          }
        }

        if (!comment) continue;

        // ── Navigate to the individual post ───────────────────────────────
        await navigateAndWait(tab.id, post.postUrl);

        if (!await ensureSessionHealthy(tab.id)) break;

        // Simulate reading the post (5-20 seconds)
        const readTime = 5000 + Math.random() * 15000;
        emitLeadLog("info", "extension", `Reading post... (${Math.round(readTime / 1000)}s)`);
        await randomDelay(readTime * 0.9, readTime * 1.1);

        // Randomly scroll the post to simulate reading
        try {
          await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "SIMULATE_BROWSING",
            actionId: `lead-read-${Date.now()}`,
            duration: 3000 + Math.random() * 5000,
          });
        } catch { /* ignore */ }

        // ── Post the comment ───────────────────────────────────────────────
        let commented = false;
        try {
          const commentRes = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "COMMENT_ON_POST",
            actionId: `lead-comment-${Date.now()}`,
            selector: null, // We're on the post page — no need to target a specific element
            comment,
          });
          commented = commentRes?.data?.commented === true;

          if (!commented && commentRes?.data?.error) {
            emitLeadLog("warn", "content-script", `Comment failed: ${commentRes.data.error}`);
          }
        } catch (e) {
          emitLeadLog("warn", "content-script", `Comment error: ${e.message}`);
        }

        if (commented) {
          // ── Record to server ─────────────────────────────────────────────
          try {
            await apiCall("/api/lead-gen", {
              action: "record_comment",
              campaignId,
              postUrl: post.postUrl,
              postAuthor: post.authorName,
              comment,
              keyword,
            });
          } catch (e) {
            emitLeadLog("warn", "api", `Failed to record comment: ${e.message}`);
          }

          alreadyCommented.add((post.postUrl || "").split("?")[0].replace(/\/$/, ""));
          totalCommentedThisRun++;

          emitLeadLog("success", "extension", `✓ Commented on post by ${post.authorName || "unknown"}`);
          reportLeadProgress("leadgen:comment", {
            message: `Commented on post by ${post.authorName || "unknown"}`,
            postUrl: post.postUrl,
            postAuthor: post.authorName,
            comment,
            keyword,
            totalThisRun: totalCommentedThisRun,
          });
        }

        processedPosts++;

        // ── Cooldown between comments (2-5 min with Gaussian variance) ─────
        if (!leadGenAborted) {
          const cooldownMin = 2 * 60 * 1000;  // 2 min
          const cooldownMax = 5 * 60 * 1000;  // 5 min
          const cooldown = cooldownMin + Math.random() * (cooldownMax - cooldownMin);
          emitLeadLog("info", "system", `Cooldown: ${Math.round(cooldown / 1000)}s before next action...`);
          reportLeadProgress("leadgen:progress", {
            message: `Waiting ${Math.round(cooldown / 60000)} min before next comment...`,
          });
          await randomDelay(cooldown * 0.9, cooldown * 1.1);
        }

        // ── Browsing break every 3 comments ───────────────────────────────
        if (processedPosts > 0 && processedPosts % 3 === 0 && !leadGenAborted) {
          await simulateBrowsingBreak(tab.id);
        }
      }

      // Short pause between keywords (not the full cooldown)
      if (!leadGenAborted) {
        await randomDelay(5000, 15000);
      }
    }

    // ── Session complete ─────────────────────────────────────────────────────
    const summary = `Lead gen run complete: ${totalCommentedThisRun} comment(s) posted.`;
    emitLeadLog("success", "system", summary);
    reportLeadProgress("leadgen:complete", {
      message: summary,
      totalCommentedThisRun,
      campaignId,
    });
  } catch (err) {
    console.error("[WinPilot] Lead gen error:", err);
    emitLeadLog("error", "system", `Lead gen error: ${err.message}`);
    reportLeadProgress("leadgen:error", { message: err.message });
  } finally {
    leadGenRunning = false;
    leadGenAborted = false;
    chrome.storage.local.set({ leadGenRunning: false, leadGenCampaignId: null });
  }
}

// ─── Autopilot: run one server-dispatched task ──────────

/**
 * Handle a RUN_TASK dispatch from the Autopilot scheduler.
 *
 * The server sends one task at a time and waits for the result, so this refuses
 * to start a second task while one is in flight — and refuses entirely while
 * job automation or lead gen is running, since all three drive the same tab.
 */
async function handleAutopilotTask(message) {
  const { taskId, kind, payload } = message;
  if (!taskId || !kind) return;

  if (autopilotRunning) {
    console.warn("[WinPilot] Autopilot task already running — ignoring", kind);
    return;
  }
  if (automationRunning || leadGenRunning) {
    await reportTaskResult(taskId, {
      ok: false,
      error: "Another automation is using the LinkedIn tab",
    });
    return;
  }

  autopilotRunning = true;
  emitLog("info", "autopilot", `Running task: ${kind}`);

  let outcome;
  try {
    outcome = await runTask(
      { taskId, kind, payload: payload || {} },
      {
        ensureLinkedInTab,
        ensureSessionHealthy,
        navigateAndWait,
        sendToContentScript,
        randomDelay,
        emitLog,
        apiCall,
      }
    );
  } catch (err) {
    console.error("[WinPilot] Autopilot task threw:", err);
    outcome = { ok: false, error: err.message || "Task threw an unexpected error" };
  } finally {
    autopilotRunning = false;
  }

  await reportTaskResult(taskId, outcome);

  if (outcome.ok) {
    emitLog("success", "autopilot", `Completed ${kind}`);
  } else {
    emitLog("warn", "autopilot", `Task ${kind} failed: ${outcome.error}`);
  }
}

/**
 * Post the outcome back to the server. The server treats a missing result as a
 * lost task and requeues it, so a failure to report is recoverable — but noisy,
 * so it is logged rather than swallowed.
 */
async function reportTaskResult(taskId, outcome) {
  try {
    await apiCall("/api/autopilot/task-result", {
      taskId,
      ok: Boolean(outcome.ok),
      result: outcome.result || {},
      error: outcome.error,
      signal: outcome.signal,
    });
  } catch (err) {
    console.error("[WinPilot] Could not report task result:", err.message);
  }
}

function cleanup(message) {
  automationRunning = false;
  automationAborted = false;
  chrome.storage.local.set({ automationRunning: false, automationSearchId: null });
  if (message) {
    reportProgress("task:complete", { message });
  }
}

// ─── Connection Status ──────────────────────────────────

function updateConnectionStatus(connected) {
  chrome.storage.local.set({ isConnected: connected });
  chrome.runtime.sendMessage({
    type: "CONNECTION_STATUS",
    connected,
  }).catch(() => {});
}

// ─── AI Field Correction Handler ─────────────────────────

/**
 * Handle AI field correction request
 * Sends field context to AI API and returns corrected value
 */
async function handleAIFieldCorrection(context) {
  console.log("[AI Correction] Received correction request for field:", context.fieldLabel);

  try {
    // Build the AI prompt
    const prompt = buildAICorrectionPrompt(context);

    // Call AI API
    const response = await fetch(`${apiUrl}/api/ai/correct-field`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      },
      body: JSON.stringify({
        prompt,
        context,
        // Add metadata for logging/debugging
        metadata: {
          pageUrl: context.pageUrl,
          pageTitle: context.pageTitle,
          fieldLabel: context.fieldLabel,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `AI API returned ${response.status}`);
    }

    const result = await response.json();

    console.log("[AI Correction] Received corrected value:", result.correctedValue);

    return {
      correctedValue: result.correctedValue,
      reasoning: result.reasoning || "",
      success: true,
    };
  } catch (error) {
    console.error("[AI Correction] Error:", error);
    throw error;
  }
}

/**
 * Build a detailed prompt for the AI to correct the field value
 */
function buildAICorrectionPrompt(context) {
  const {
    fieldLabel,
    fieldType,
    currentValue,
    errorMessage,
    placeholder,
    hint,
    options,
    pattern,
    min,
    max,
    minLength,
    maxLength,
  } = context;

  let prompt = `You are a form-filling assistant. A form validation error occurred and you need to fix it.\n\n`;
  prompt += `**Field Information:**\n`;
  prompt += `- Label: "${fieldLabel}"\n`;
  prompt += `- Type: ${fieldType}\n`;
  prompt += `- Current Value: "${currentValue}"\n`;
  prompt += `- Error Message: "${errorMessage}"\n\n`;

  if (placeholder) prompt += `- Placeholder: "${placeholder}"\n`;
  if (hint) prompt += `- Hint: "${hint}"\n`;
  if (pattern) prompt += `- Pattern (regex): ${pattern}\n`;
  if (min) prompt += `- Min: ${min}\n`;
  if (max) prompt += `- Max: ${max}\n`;
  if (minLength) prompt += `- Min Length: ${minLength}\n`;
  if (maxLength) prompt += `- Max Length: ${maxLength}\n`;

  if (options && options.length > 0) {
    prompt += `\n**Available Options:**\n`;
    options.slice(0, 20).forEach((opt, idx) => {
      prompt += `${idx + 1}. "${opt.text}" (value: "${opt.value}")\n`;
    });
    if (options.length > 20) {
      prompt += `... and ${options.length - 20} more options\n`;
    }
  }

  prompt += `\n**Task:**\n`;
  prompt += `Based on the error message and field requirements, provide a corrected value that will pass validation.\n\n`;

  prompt += `**Examples of common fixes:**\n`;
  prompt += `- If error is "Please enter a valid number" and value is "5,00,000" → remove commas → "500000"\n`;
  prompt += `- If error is "Please select an option" → select the first valid option from the list\n`;
  prompt += `- If error is "Phone number must be 10 digits" and value has formatting → extract just digits\n`;
  prompt += `- If error is "Date format must be MM/DD/YYYY" → reformat the date\n\n`;

  prompt += `**Response Format:**\n`;
  prompt += `Return ONLY a JSON object with this structure:\n`;
  prompt += `{\n`;
  prompt += `  "correctedValue": "the fixed value as a string",\n`;
  prompt += `  "reasoning": "brief explanation of what was fixed"\n`;
  prompt += `}\n\n`;

  prompt += `Return ONLY the JSON object, no other text.`;

  return prompt;
}

// ─── Message Listener (from content script & popup) ─────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "SET_AUTH_TOKEN":
      authToken = message.token;
      console.log("[WinPilot] Auth token set:", message.token ? `${message.token.substring(0, 8)}...` : "CLEARED");
      chrome.storage.local.set({ authToken: message.token });
      if (socket && socket.connected) {
        socket.emit("AUTH", { token: authToken });
      }
      sendResponse({ success: true });
      break;

    // SET_WS_URL / SET_API_URL are debug overrides only. The build-time
    // endpoint is restored on the next service-worker start — to change the
    // backend for good, rebuild with a different WINPILOT_APP_URL.
    case "SET_WS_URL":
      wsUrl = message.url;
      console.log("[WinPilot] WS URL set to:", message.url);
      chrome.storage.local.set({ wsUrl: message.url });
      if (socket) socket.disconnect();
      reconnectAttempts = 0;
      connect();
      sendResponse({ success: true });
      break;

    case "SET_API_URL":
      apiUrl = message.url;
      console.log("[WinPilot] API URL set to:", message.url);
      chrome.storage.local.set({ apiUrl: message.url });
      sendResponse({ success: true });
      break;

    case "GET_STATUS":
      sendResponse({
        connected: socket?.connected ?? false,
        authenticated: !!authToken,
        automationRunning,
        leadGenRunning,
      });
      break;

    case "START_AUTOMATION":
      startAutomation(message.searchId, message.options || {});
      sendResponse({ success: true });
      break;

    case "APPLY_JOB_URL":
      startSingleApply(message.url, message.options || {});
      sendResponse({ success: true });
      break;

    case "APPLY_JOB_LIST":
      startListApply(message.url, message.options || {});
      sendResponse({ success: true });
      break;

    case "STOP_AUTOMATION":
      stopAutomation();
      sendResponse({ success: true });
      break;

    case "START_LEAD_GEN":
      startLeadGenAutomation(message.campaignId, message.options || {});
      sendResponse({ success: true });
      break;

    case "STOP_LEAD_GEN":
      stopLeadGen();
      sendResponse({ success: true });
      break;

    case "REPORT_STATUS":
      sendToServer(message);
      sendResponse({ success: true });
      break;

    case "CONNECT":
      connect();
      sendResponse({ success: true });
      break;

    case "AI_FIELD_CORRECTION":
      handleAIFieldCorrection(message.context)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ error: error.message }));
      return true; // Keep channel open for async response

    default:
      sendResponse({ error: "Unknown message type" });
  }
  return true;
});

// ─── Initialization ─────────────────────────────────────

chrome.storage.local.get(["authToken"], (result) => {
  if (result.authToken) authToken = result.authToken;
  // The build-time endpoint always wins: a URL written to storage by an older
  // build (or by SET_API_URL during a debug session) must not survive into a
  // build packaged for a different backend.
  apiUrl = DEFAULT_API_URL;
  wsUrl = DEFAULT_WS_URL;
  chrome.storage.local.set({ apiUrl, wsUrl, dashboardUrl: apiUrl });
  console.log("[WinPilot] Initialized — apiUrl:", apiUrl, "authToken:", authToken ? `${authToken.substring(0, 8)}...` : "NOT SET", "wsUrl:", wsUrl);
  connect();
});

// Periodic reconnect check
chrome.alarms.create("reconnect-check", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "reconnect-check") {
    if (!socket || !socket.connected) {
      connect();
    }
  }
});
