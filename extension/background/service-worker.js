// WinPilot Background Service Worker
// Handles WebSocket connection to the web app, relays commands to content scripts,
// and drives the full job automation loop.

import { io } from "./socket.io.esm.min.js";

const DEFAULT_WS_URL = "wss://winpilot.tech";
const DEFAULT_API_URL = "https://winpilot.tech";
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

// Load settings from storage
chrome.storage.local.get(["wsUrl", "apiUrl"], (result) => {
  if (result.wsUrl) wsUrl = result.wsUrl;
  if (result.apiUrl) apiUrl = result.apiUrl;
});

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
      forwardToContentScript(message);
      break;
    case "START_AUTOMATION":
      startAutomation(message.searchId, message.options || message.config || {});
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

function sendToContentScript(tabId, message) {
  return new Promise((resolve, reject) => {
    const cmd = message.command || message.type;
    console.log(`[WinPilot] -> Content script (tab ${tabId}):`, cmd);
    emitLog("info", "content-script", `-> ${cmd}`, `tab ${tabId}`);
    chrome.tabs.sendMessage(tabId, message, (response) => {
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
    });
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

function normalizeAutomationOptions(options) {
  const source = options && typeof options === "object" ? options : {};
  return {
    useAI: source.useAI !== false,
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

    const digitsOnly = text.replace(/\D+/g, "");
    if (digitsOnly) return digitsOnly;
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
      const txt = (o?.text || "").toString().trim().toLowerCase();
      return val === "yes" || txt === "yes";
    });
    if (yesOpt) return yesOpt.value;
    const valid = options.find((o) => {
      const value = (o?.value || "").toString().trim().toLowerCase();
      const text = (o?.text || "").toString().trim().toLowerCase();
      const joined = `${value} ${text}`;
      return !!value && !/select|choose|please|option|pick one|--/.test(joined);
    });
    return valid?.value || options[0]?.value || "";
  };

  if (field.type === "checkbox") return "true";
  if (field.type === "radio") {
    // Prefer "Yes" for radio buttons too
    const yesRadio = (field.options || []).find((o) => (o.label || "").toLowerCase() === "yes" || (o.value || "").toLowerCase() === "yes");
    return yesRadio?.value || field.options?.[0]?.value || "Yes";
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
        // Try to inject the content script manually
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content.js"],
          });
        } catch (injectErr) {
          console.warn(`[WinPilot] Could not inject content script: ${injectErr.message}`);
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

async function startAutomation(searchId, options = {}) {
  if (automationRunning) {
    reportProgress("task:error", { message: "Automation already running" });
    return;
  }

  let targetApp = null;
  const normalizedOptions = normalizeAutomationOptions(options);
  let useAI = normalizedOptions.useAI;

  console.log(`[WinPilot] ====== STARTING AUTOMATION ======`);
  console.log(`[WinPilot] searchId: ${searchId}`);
  console.log(`[WinPilot] apiUrl: ${apiUrl}`);
  console.log(`[WinPilot] authToken: ${authToken ? `${authToken.substring(0, 8)}...` : "NOT SET"}`);
  console.log(`[WinPilot] wsUrl: ${wsUrl}`);
  console.log(`[WinPilot] useAI: ${useAI}`);
  emitLog("info", "system", "====== STARTING AUTOMATION ======", `searchId=${searchId}, useAI=${useAI}`);

  automationRunning = true;
  automationAborted = false;

  chrome.storage.local.set({ automationRunning: true, automationSearchId: searchId });

  reportProgress("task:start", { label: "Starting job automation..." });
  reportProgress("task:progress", {
    message: useAI
      ? "AI Mode ON: matching and tailored resume generation enabled"
      : "AI Mode OFF: applying with existing LinkedIn resume (no AI usage)",
  });

  try {
    // Step 1: Get search config and navigate to LinkedIn Jobs
    console.log(`[WinPilot] Step 1: Fetching search configuration...`);
    reportProgress("task:progress", { message: "Fetching search configuration..." });
    const startData = await apiCall(`/api/jobs/automate?step=start`, { searchId });
    console.log(`[WinPilot] Step 1 result:`, JSON.stringify(startData).substring(0, 300));
    emitLog("info", "extension", "Search configuration received", `URL: ${startData.url || "none"}, remaining: ${startData.remaining || "?"}`);

    if (!startData.url) {
      throw new Error("No search URL returned");
    }

    reportProgress("task:progress", {
      message: `Navigating to LinkedIn Jobs (${startData.remaining} applications remaining today)...`,
    });

    // Navigate to search URL
    console.log(`[WinPilot] Step 1b: Navigating to ${startData.url}`);
    const tab = await ensureLinkedInTab();
    console.log(`[WinPilot] Got LinkedIn tab: id=${tab.id}, url=${tab.url}`);
    await chrome.tabs.update(tab.id, { url: startData.url, active: true });
    await waitForTabLoad(tab.id);
    await randomDelay(4000, 7000); // Longer initial load wait
    const csReady = await ensureContentScriptReady(tab.id);
    console.log(`[WinPilot] Content script ready: ${csReady}`);

    // Session health check before starting
    if (!(await ensureSessionHealthy(tab.id))) {
      return cleanup("Automation stopped: LinkedIn session could not be restored");
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

    // Configuration for multi-page processing
    const MAX_PAGES = 5;
    const MAX_JOBS_PER_RUN = 50;
    let totalAppliedCount = 0;
    let totalFailedCount = 0;
    let totalSkippedQualificationCount = 0;
    let currentPage = 1;
    const processedJobIds = new Set();

    // Multi-page loop
    pageLoop: for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      if (automationAborted) return cleanup("Automation stopped by user");

      currentPage = pageNum;
      const currentPageUrl = getSearchUrlForPage(startData.url, pageNum);

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

      const scrapeResult = await sendToContentScript(tab.id, {
        type: "EXECUTE_ACTION",
        command: "SCRAPE_JOB_LISTINGS",
        actionId: `scrape-listings-p${pageNum}`,
      });

      const scrapedJobs = scrapeResult?.data?.jobs || [];
      console.log(`[WinPilot] Page ${pageNum}: ${scrapedJobs.length} jobs found`);
      emitLog("info", "extension", `Page ${pageNum}: ${scrapedJobs.length} jobs found`);
      if (scrapedJobs.length > 0) {
        console.log(`[WinPilot] First job:`, JSON.stringify(scrapedJobs[0]));
      }

      if (scrapedJobs.length === 0) {
        if (pageNum === 1) {
          console.error(`[WinPilot] Step 2 FAILED: scrapeResult =`, JSON.stringify(scrapeResult));
          throw new Error("No jobs found on the search results page");
        } else {
          console.log(`[WinPilot] No more jobs found on page ${pageNum}, finishing pagination`);
          break pageLoop;
        }
      }

      // Filter eligible jobs, excluding already processed ones
      const eligibleJobs = scrapedJobs.filter(
        (job) => job?.url && !job.applied && job.easyApply !== false && !processedJobIds.has(job.jobId || job.url)
      );
      const dedupedEligibleJobs = [];
      const seenJobKeys = new Set();
      for (const job of eligibleJobs) {
        const key = (job.jobId || job.url || "").trim();
        if (!key || seenJobKeys.has(key) || processedJobIds.has(key)) continue;
        seenJobKeys.add(key);
        dedupedEligibleJobs.push(job);
      }
      const skippedAppliedCount = scrapedJobs.filter((job) => job?.applied).length;
      const easyApplyDetectedCount = scrapedJobs.filter((job) => job?.easyApply !== false).length;

      console.log(
        `[WinPilot] Page ${pageNum} eligibility: total=${scrapedJobs.length}, easyApply=${easyApplyDetectedCount}, alreadyApplied=${skippedAppliedCount}, eligible=${dedupedEligibleJobs.length}`
      );
      emitLog("info", "extension", `Page ${pageNum} eligibility: total=${scrapedJobs.length}, easyApply=${easyApplyDetectedCount}, alreadyApplied=${skippedAppliedCount}, eligible=${dedupedEligibleJobs.length}`);

      if (dedupedEligibleJobs.length === 0) {
        console.log(`[WinPilot] No new eligible jobs on page ${pageNum}, trying next page...`);
        continue;
      }

      reportProgress("job:found", {
        message: `Page ${pageNum}: Found ${scrapedJobs.length} jobs (${skippedAppliedCount} already applied). Processing ${dedupedEligibleJobs.length} eligible jobs.`,
        count: scrapedJobs.length,
        page: pageNum,
      });

      const storedRules = await getStoredFormRules();
      const remainingQuota = MAX_JOBS_PER_RUN - totalAppliedCount - totalFailedCount;
      const jobsToProcessOnThisPage = Math.min(dedupedEligibleJobs.length, remainingQuota, 25);

      if (jobsToProcessOnThisPage <= 0) {
        console.log(`[WinPilot] Reached max jobs limit (${MAX_JOBS_PER_RUN}), stopping`);
        break pageLoop;
      }

      let pageAppliedCount = 0;
      let pageFailedCount = 0;
      let pageSkippedQualificationCount = 0;
      let needsReturnToSearchPage = false;

      for (let jobIndex = 0; jobIndex < jobsToProcessOnThisPage; jobIndex++) {
        const candidateJob = dedupedEligibleJobs[jobIndex];
        targetApp = null;

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

          // Navigate back to the CORRECT page if we navigated away (e.g., after applying)
          if (needsReturnToSearchPage) {
            console.log(`[WinPilot] Returning to search results page ${pageNum}...`);
            await navigateAndWait(tab.id, currentPageUrl);
            await randomDelay(900, 1500);
            needsReturnToSearchPage = false;
          }

          // Verify we're on the right page before selecting
          const pageInfoCheck = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "GET_PAGE_INFO",
            actionId: `pagecheck-${pageNum}-${jobIndex}`,
          });
          const currentTabUrl = pageInfoCheck?.data?.url || "";
          if (!currentTabUrl.includes("/jobs/search") && !currentTabUrl.includes("/jobs/collection")) {
            console.log(`[WinPilot] Not on search results page (url=${currentTabUrl}), navigating back...`);
            await navigateAndWait(tab.id, currentPageUrl);
            await randomDelay(900, 1500);
          }

          const selectResult = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "SELECT_JOB_FROM_LIST",
            actionId: `select-p${pageNum}-${jobIndex}`,
            jobId: candidateJob.jobId,
            jobUrl: candidateJob.url,
          });

          if (!selectResult?.data?.selected) {
            pageFailedCount++;
            totalFailedCount++;
            reportProgress("task:progress", {
              message: `Skipping ${candidateJob.title}: could not select job card in results list (${selectResult?.data?.error || "unknown"}).`,
              jobTitle: candidateJob.title,
            });
            continue;
          }

          // Simulate time spent reading the job card (like a human would)
          await randomDelay(1500, 3500);

          const qualResult = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "CHECK_JOB_QUALIFICATION",
            actionId: `qual-p${pageNum}-${jobIndex}`,
            maxAttempts: 12,
            delayMs: 350,
          });
          const qualification = qualResult?.data?.qualification || {
            status: "unknown",
            matched: false,
            text: "",
          };

          // Proceed if matched OR if status is unknown (LinkedIn didn't show qualification info)
          const shouldSkipJob =
            qualification.status === "missing_required" ||
            qualification.status === "no_match" ||
            (qualification.matched === false && qualification.status !== "unknown");
          const qualificationLabel =
            qualification.text ||
            String(qualification.status || "unknown").replace(/_/g, " ");

          console.log(`[WinPilot] Qualification check: status="${qualification.status}", matched=${qualification.matched}, shouldSkip=${shouldSkipJob}, text="${qualification.text || ""}"`);
          emitLog("info", "extension", `Qualification check: status="${qualification.status}", matched=${qualification.matched}, shouldSkip=${shouldSkipJob}`, qualification.text || "");

          if (shouldSkipJob) {
            pageSkippedQualificationCount++;
            pageFailedCount++;
            totalFailedCount++;
            reportProgress("task:progress", {
              message: `Skipping ${candidateJob.title}: LinkedIn qualification signal is "${qualificationLabel}".`,
              jobTitle: candidateJob.title,
            });
            continue;
          }

          console.log(`[WinPilot] Proceeding with application for ${candidateJob.title}...`);
          emitLog("info", "extension", `Proceeding with application for ${candidateJob.title}`);

          // Simulate reading the job description (human-like pause before scraping)
          await randomDelay(2000, 5000);

          let detail = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            const detailResult = await sendToContentScript(tab.id, {
              type: "EXECUTE_ACTION",
              command: "SCRAPE_JOB_DETAIL",
              actionId: `detail-p${pageNum}-${jobIndex}-${attempt}`,
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
            title: detail.title || candidateJob.title,
            company: detail.company || candidateJob.company,
            description: detail.description,
          };

          let prepData = null;

          const registerResult = await apiCall(`/api/jobs/automate?step=register-job`, {
            searchId,
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

          if (!targetApp?._id) {
            throw new Error("Could not register application record for job");
          }

          reportProgress("job:applying", {
            message: useAI
              ? `Applying to ${targetApp.jobTitle || jobWithDetail.title} at ${targetApp.company || jobWithDetail.company}...`
              : `Applying (AI OFF) to ${targetApp.jobTitle || jobWithDetail.title} at ${targetApp.company || jobWithDetail.company}...`,
            jobTitle: targetApp.jobTitle || jobWithDetail.title,
            company: targetApp.company || jobWithDetail.company,
          });

          if (useAI) {
            try {
              prepData = await apiCall(`/api/jobs/automate?step=prepare-apply`, {
                applicationId: targetApp._id,
              });
            } catch (prepErr) {
              const prepMessage = prepErr?.message || "";
              if (isGeminiQuotaErrorMessage(prepMessage)) {
                useAI = false;
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

            if (useAI && !prepData?.resumePdf) {
              throw new Error("Tailored resume PDF was not generated");
            }
          }

          // Try clicking Easy Apply from the search results side panel first
          // (avoids navigating away from the search page)
          let easyApplyResult = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "CLICK_EASY_APPLY",
            actionId: `apply-${targetApp._id}`,
          });

          if (!easyApplyResult?.data?.clicked) {
            // If Easy Apply button wasn't found on side panel, navigate to the job page
            console.log(`[WinPilot] Easy Apply not found on side panel, navigating to job page...`);
            await navigateAndWait(tab.id, targetApp.jobUrl);
            needsReturnToSearchPage = true;

            // Check session after navigation (LinkedIn may redirect to login)
            if (!(await ensureSessionHealthy(tab.id))) {
              return cleanup("Automation stopped: LinkedIn session could not be restored");
            }

            await randomDelay(1500, 3000);

            easyApplyResult = await sendToContentScript(tab.id, {
              type: "EXECUTE_ACTION",
              command: "CLICK_EASY_APPLY",
              actionId: `apply-${targetApp._id}-retry`,
            });
            if (!easyApplyResult?.data?.clicked) {
              throw new Error(`Easy Apply button not found: ${easyApplyResult?.data?.error || "unknown"}`);
            }
          }

          if (easyApplyResult?.data?.sdui) {
            needsReturnToSearchPage = true;
            await waitForTabLoad(tab.id);
            await randomDelay(1400, 2200);
            await ensureContentScriptReady(tab.id);
          }

          const MAX_FORM_STEPS = 15;
          let uploaded = false;
          let submitted = false;
          let lastFieldsSignature = "";
          let repeatedSignatureCount = 0;

          for (let step = 0; step < MAX_FORM_STEPS; step++) {
            if (automationAborted) return cleanup("Automation stopped by user");

            const fieldsResult = await sendToContentScript(tab.id, {
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

            if (useAI && !uploaded && fields.some((f) => f.type === "file")) {
              const uploadResult = await sendToContentScript(tab.id, {
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
            for (let i = 0; i < requiredMissing.length; i++) {
              const field = requiredMissing[i];
              const raw = getRuleBasedAnswer(field, storedRules);
              const chosen = normalizeAnswerForField(field, raw) || fallbackAnswerForField(field);

              if (!chosen) {
                await recordUnknownFieldSituation(field, targetApp.jobTitle);
                continue;
              }

              await sendToContentScript(tab.id, {
                type: "EXECUTE_ACTION",
                command: "FILL_FORM_FIELD",
                actionId: `fill-${targetApp._id}-${step}-${i}`,
                fieldIndex: i,
                selector: field.selector,
                value: chosen,
                fieldType: field.type,
              });
              // Human-like pause between form fields
              await randomDelay(800, 2000);
            }

            const dropdownResult = await sendToContentScript(tab.id, {
              type: "EXECUTE_ACTION",
              command: "AUTO_SELECT_DROPDOWNS",
              actionId: `auto-dropdown-${targetApp._id}-${step}`,
            });
            if ((dropdownResult?.data?.selectedCount || 0) > 0) {
              await randomDelay(300, 700);
            }

            const navResult = await sendToContentScript(tab.id, {
              type: "EXECUTE_ACTION",
              command: "CLICK_NEXT_OR_SUBMIT",
              actionId: `nav-${targetApp._id}-${step}`,
            });

            const navAction = navResult?.data?.action;
            if (navAction === "submitted") {
              submitted = true;
              // After submission, dismiss the confirmation dialog if present
              await randomDelay(1000, 1500);
              try {
                await sendToContentScript(tab.id, {
                  type: "EXECUTE_ACTION",
                  command: "GET_PAGE_INFO",
                  actionId: `post-submit-check-${targetApp._id}`,
                });
              } catch { /* ignore - page may have navigated */ }
              break;
            }

            if (navAction === "next" || navAction === "review") {
              // Wait for next page to load, then simulate reading
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
              needsReturnToSearchPage = true;
              await waitForTabLoad(tab.id);
              await randomDelay(1400, 2200);
              await ensureContentScriptReady(tab.id);
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
          needsReturnToSearchPage = true;

          // Post-submission pause — humans don't immediately move on
          await randomDelay(2000, 5000);

          if (targetApp?._id) {
            await apiCall(`/api/jobs/automate?step=complete`, {
              applicationId: targetApp._id,
              success: true,
              notes: "Auto-applied via WinPilot",
            });
          }

          pageAppliedCount++;
          totalAppliedCount++;
          reportProgress("job:applied", {
            message: `Applied to ${targetApp.jobTitle} at ${targetApp.company}`,
            jobTitle: targetApp.jobTitle,
            company: targetApp.company,
            appliedCount: totalAppliedCount,
            page: currentPage,
          });
        } catch (jobErr) {
          pageFailedCount++;
          totalFailedCount++;
          if (targetApp?._id) {
            await apiCall(`/api/jobs/automate?step=complete`, {
              applicationId: targetApp._id,
              success: false,
              notes: `Auto-apply failed: ${jobErr.message}`,
            }).catch(() => {});
          }
          reportProgress("task:error", {
            message: `Skipped ${candidateJob.title}: ${jobErr.message}`,
            jobTitle: candidateJob.title,
          });
          // If the error might have caused navigation, flag for return
          needsReturnToSearchPage = true;
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

    reportProgress("task:complete", {
      message: `Automation complete. Pages processed: ${currentPage}. Applied: ${totalAppliedCount}, Failed/Skipped: ${totalFailedCount} (${totalSkippedQualificationCount} skipped by LinkedIn qualification signal).`,
      appliedCount: totalAppliedCount,
      failedCount: totalFailedCount,
      skippedQualificationCount: totalSkippedQualificationCount,
      pagesProcessed: currentPage,
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
          if (commentsToday >= commentLimit) {
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

chrome.storage.local.get(["authToken", "apiUrl", "wsUrl"], (result) => {
  if (result.authToken) authToken = result.authToken;
  if (result.apiUrl) apiUrl = result.apiUrl;
  if (result.wsUrl) wsUrl = result.wsUrl;
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
