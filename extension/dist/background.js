// LinkedBoost Background Service Worker
// Handles WebSocket connection to the web app, relays commands to content scripts,
// and drives the full job automation loop.

import { io } from "./socket.io.esm.min.js";

const DEFAULT_WS_URL = "ws://localhost:3001";
const DEFAULT_API_URL = "http://localhost:3000";
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
      console.log("[LinkedBoost] WebSocket connected to", normalizeWsUrl(wsUrl));
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      updateConnectionStatus(true);
      startHeartbeat();

      if (authToken) {
        console.log("[LinkedBoost] Authenticating with token:", authToken.substring(0, 8) + "...");
        socket.emit("AUTH", { token: authToken });
      } else {
        console.warn("[LinkedBoost] No authToken set — cannot authenticate");
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
      console.log("[LinkedBoost] WebSocket disconnected");
      updateConnectionStatus(false);
      stopHeartbeat();
      scheduleReconnect();
    });

    socket.on("connect_error", (error) => {
      console.error("[LinkedBoost] WebSocket error:", error);
      updateConnectionStatus(false);
      stopHeartbeat();
      scheduleReconnect();
    });
  } catch (e) {
    console.error("[LinkedBoost] Failed to create WebSocket:", e);
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
  console.log("[LinkedBoost] Server message received:", message.type, message.searchId ? `searchId=${message.searchId}` : "");
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
    case "SYNC_CONFIG":
      chrome.storage.local.set({ config: message.data });
      break;
    case "AUTH_SUCCESS":
      console.log("[LinkedBoost] Authenticated successfully");
      break;
    case "AUTH_FAILURE":
      console.error("[LinkedBoost] Authentication failed");
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
    console.log(`[LinkedBoost] -> Content script (tab ${tabId}):`, message.command || message.type);
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
            `[LinkedBoost] <- Content script channel closed during ${message.command}; treating as navigation success`
          );

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

        console.error(`[LinkedBoost] <- Content script error (tab ${tabId}):`, errMessage);
        reject(new Error(errMessage));
      } else {
        console.log(`[LinkedBoost] <- Content script (tab ${tabId}): status=${response?.status}`);
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
    console.error("[LinkedBoost] Failed to forward to content script:", e);
  }
}

function sendToServer(message) {
  if (socket && socket.connected) {
    if (message.type === "REPORT_STATUS") {
      socket.emit("REPORT_STATUS", {
        event: "task:progress",
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
  console.log(`[LinkedBoost API] >> ${url}`, { authToken: authToken ? `${authToken.substring(0, 8)}...` : "NONE", body });

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
    console.error(`[LinkedBoost API] Network error calling ${url}:`, fetchErr.message);
    console.error(`[LinkedBoost API] Check: Is the server running at ${apiUrl}? Is the extension authorized for this host?`);
    throw new Error(`Network error: ${fetchErr.message} (URL: ${url})`);
  }

  console.log(`[LinkedBoost API] << ${url} status=${res.status}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error(`[LinkedBoost API] Error response from ${url}:`, err);

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
  console.log(`[LinkedBoost API] << ${url} response:`, JSON.stringify(data).substring(0, 200));
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
  if (field.type === "select") {
    if (!value) return true;
    const normalized = value.toLowerCase();
    return normalized === "select" || normalized === "choose" || normalized === "none";
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

  const pickFirstValidSelect = (options = []) => {
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
    return field.options?.[0]?.value || "Yes";
  }
  if (field.type === "select") {
    return pickFirstValidSelect(field.options || []);
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
    return options[0]?.value || "Yes";
  }

  if (field.type === "select") {
    const options = field.options || [];
    const valid = options.find((o) => {
      const value = (o?.value || "").toString().trim().toLowerCase();
      const text = (o?.text || "").toString().trim().toLowerCase();
      const joined = `${value} ${text}`;
      return !!value && !/select|choose|please|option|pick one|--/.test(joined);
    });

    if (label.includes("comfortable") || label.includes("success fee") || label.includes("without a fixed salary")) {
      const yesOption = options.find((o) => (o?.value || "").toString().toLowerCase() === "yes" || (o?.text || "").toString().toLowerCase() === "yes");
      return yesOption?.value || valid?.value || options[0]?.value || "";
    }

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
      console.warn(`[LinkedBoost] Content script not ready (attempt ${attempt + 1}): ${err.message}`);
      if (attempt < maxRetries - 1) {
        // Try to inject the content script manually
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content.js"],
          });
        } catch (injectErr) {
          console.warn(`[LinkedBoost] Could not inject content script: ${injectErr.message}`);
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
  // SDUI content loads asynchronously after page load; wait longer
  await randomDelay(3000, 5000);
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

async function startAutomation(searchId, options = {}) {
  if (automationRunning) {
    reportProgress("task:error", { message: "Automation already running" });
    return;
  }

  let targetApp = null;
  const normalizedOptions = normalizeAutomationOptions(options);
  let useAI = normalizedOptions.useAI;

  console.log(`[LinkedBoost] ====== STARTING AUTOMATION ======`);
  console.log(`[LinkedBoost] searchId: ${searchId}`);
  console.log(`[LinkedBoost] apiUrl: ${apiUrl}`);
  console.log(`[LinkedBoost] authToken: ${authToken ? `${authToken.substring(0, 8)}...` : "NOT SET"}`);
  console.log(`[LinkedBoost] wsUrl: ${wsUrl}`);
  console.log(`[LinkedBoost] useAI: ${useAI}`);

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
    console.log(`[LinkedBoost] Step 1: Fetching search configuration...`);
    reportProgress("task:progress", { message: "Fetching search configuration..." });
    const startData = await apiCall(`/api/jobs/automate?step=start`, { searchId });
    console.log(`[LinkedBoost] Step 1 result:`, JSON.stringify(startData).substring(0, 300));

    if (!startData.url) {
      throw new Error("No search URL returned");
    }

    reportProgress("task:progress", {
      message: `Navigating to LinkedIn Jobs (${startData.remaining} applications remaining today)...`,
    });

    // Navigate to search URL
    console.log(`[LinkedBoost] Step 1b: Navigating to ${startData.url}`);
    const tab = await ensureLinkedInTab();
    console.log(`[LinkedBoost] Got LinkedIn tab: id=${tab.id}, url=${tab.url}`);
    await chrome.tabs.update(tab.id, { url: startData.url, active: true });
    await waitForTabLoad(tab.id);
    await randomDelay(3000, 5000);
    const csReady = await ensureContentScriptReady(tab.id);
    console.log(`[LinkedBoost] Content script ready: ${csReady}`);

    if (automationAborted) return cleanup("Automation stopped by user");

    // Configuration for multi-page processing
    const MAX_PAGES = 5; // Maximum pages to process
    const MAX_JOBS_PER_RUN = 50; // Maximum total jobs to process across all pages
    let totalAppliedCount = 0;
    let totalFailedCount = 0;
    let totalSkippedQualificationCount = 0;
    let currentPage = 1;
    const processedJobIds = new Set(); // Track processed jobs to avoid duplicates across pages

    // Multi-page loop
    pageLoop: for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      if (automationAborted) return cleanup("Automation stopped by user");
      
      currentPage = pageNum;
      console.log(`[LinkedBoost] ====== Processing Page ${pageNum}/${MAX_PAGES} ======`);
      reportProgress("task:progress", { message: `Processing page ${pageNum}...` });

      // Step 2: Scrape job listings for current page
      console.log(`[LinkedBoost] Step 2: Scraping job listings on page ${pageNum}...`);
      reportProgress("task:progress", { message: `Scraping job listings on page ${pageNum}...` });
      await randomDelay(1500, 2500);

      const scrapeResult = await sendToContentScript(tab.id, {
        type: "EXECUTE_ACTION",
        command: "SCRAPE_JOB_LISTINGS",
        actionId: `scrape-listings-p${pageNum}`,
      });

      const scrapedJobs = scrapeResult?.data?.jobs || [];
      console.log(`[LinkedBoost] Page ${pageNum}: ${scrapedJobs.length} jobs found`);
      if (scrapedJobs.length > 0) {
        console.log(`[LinkedBoost] First job:`, JSON.stringify(scrapedJobs[0]));
      }
      
      if (scrapedJobs.length === 0) {
        if (pageNum === 1) {
          console.error(`[LinkedBoost] Step 2 FAILED: scrapeResult =`, JSON.stringify(scrapeResult));
          throw new Error("No jobs found on the search results page");
        } else {
          console.log(`[LinkedBoost] No more jobs found on page ${pageNum}, finishing pagination`);
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
        `[LinkedBoost] Page ${pageNum} eligibility: total=${scrapedJobs.length}, easyApply=${easyApplyDetectedCount}, alreadyApplied=${skippedAppliedCount}, eligible=${dedupedEligibleJobs.length}`
      );

      if (dedupedEligibleJobs.length === 0) {
        console.log(`[LinkedBoost] No new eligible jobs on page ${pageNum}, trying next page...`);
        // Try to go to next page
        const paginationResult = await sendToContentScript(tab.id, {
          type: "EXECUTE_ACTION",
          command: "CLICK_PAGINATION_NEXT",
          actionId: `pagination-${pageNum}`,
        });
        
        if (!paginationResult?.data?.clicked) {
          console.log(`[LinkedBoost] No more pages available after page ${pageNum}`);
          break pageLoop;
        }
        
        // Wait for page to load after pagination
        await randomDelay(2000, 3000);
        continue;
      }

      reportProgress("job:found", {
        message: `Page ${pageNum}: Found ${scrapedJobs.length} jobs (${skippedAppliedCount} already applied). Processing ${dedupedEligibleJobs.length} eligible jobs.`,
        count: scrapedJobs.length,
        page: pageNum,
      });

      const storedRules = await getStoredFormRules();
      // Limit jobs per page, but also check total limit
      const remainingQuota = MAX_JOBS_PER_RUN - totalAppliedCount - totalFailedCount;
      const jobsToProcessOnThisPage = Math.min(dedupedEligibleJobs.length, remainingQuota, 25);
      
      if (jobsToProcessOnThisPage <= 0) {
        console.log(`[LinkedBoost] Reached max jobs limit (${MAX_JOBS_PER_RUN}), stopping`);
        break pageLoop;
      }

      let pageAppliedCount = 0;
      let pageFailedCount = 0;
      let pageSkippedQualificationCount = 0;

      for (let jobIndex = 0; jobIndex < jobsToProcessOnThisPage; jobIndex++) {
        const candidateJob = dedupedEligibleJobs[jobIndex];
        targetApp = null;
        
        // Mark as processed to avoid reprocessing
        processedJobIds.add(candidateJob.jobId || candidateJob.url);

        if (automationAborted) return cleanup("Automation stopped by user");

        try {
          console.log(`[LinkedBoost] Processing job ${jobIndex + 1}/${jobsToProcessOnThisPage} (page ${pageNum}): ${candidateJob.title}`);
          await navigateAndWait(tab.id, startData.url);
          await randomDelay(900, 1500);

          const selectResult = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "SELECT_JOB_FROM_LIST",
            actionId: `select-${jobIndex}`,
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

          const qualResult = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "CHECK_JOB_QUALIFICATION",
            actionId: `qual-${jobIndex}`,
            maxAttempts: 12,
            delayMs: 350,
          });
          const qualification = qualResult?.data?.qualification || {
            status: "unknown",
            matched: false,
            text: "",
          };
          
          // Determine if we should proceed with application:
          // - If status is "unknown" (LinkedIn didn't show qualification info), proceed anyway
          // - If matched is true (matches_some, matches_several, etc.), proceed
          // - If status explicitly indicates missing/no match, skip
          const shouldSkipJob = 
            qualification.status === "missing_required" || 
            qualification.status === "no_match" ||
            (qualification.matched === false && qualification.status !== "unknown");
          
          const qualificationLabel =
            qualification.text ||
            String(qualification.status || "unknown").replace(/_/g, " ");

          console.log(
            `[LinkedBoost] Qualification check: status="${qualification.status}", matched=${qualification.matched}, shouldSkip=${shouldSkipJob}, text="${qualification.text || ""}"`
          );

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

          console.log(`[LinkedBoost] Proceeding with application for ${candidateJob.title}...`);

          let detail = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            const detailResult = await sendToContentScript(tab.id, {
              type: "EXECUTE_ACTION",
              command: "SCRAPE_JOB_DETAIL",
              actionId: `detail-${jobIndex}-${attempt}`,
            });
            detail = detailResult?.data?.detail;
            if (detail?.description) break;
            await randomDelay(1000, 1800);
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

          await navigateAndWait(tab.id, targetApp.jobUrl);
          await randomDelay(1000, 1600);

          const easyApplyResult = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "CLICK_EASY_APPLY",
            actionId: `apply-${targetApp._id}`,
          });
          if (!easyApplyResult?.data?.clicked) {
            throw new Error(`Easy Apply button not found: ${easyApplyResult?.data?.error || "unknown"}`);
          }

          if (easyApplyResult?.data?.sdui) {
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
              await randomDelay(250, 700);
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
              break;
            }

            if (navAction === "next" || navAction === "review") {
              await randomDelay(1000, 1600);
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

          if (targetApp?._id) {
            await apiCall(`/api/jobs/automate?step=complete`, {
              applicationId: targetApp._id,
              success: true,
              notes: "Auto-applied via LinkedBoost",
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
        }
      }

      // Update total skipped count
      totalSkippedQualificationCount += pageSkippedQualificationCount;

      console.log(`[LinkedBoost] Page ${pageNum} complete: Applied=${pageAppliedCount}, Failed=${pageFailedCount}, Skipped=${pageSkippedQualificationCount}`);

      // Check if we should continue to the next page
      if (totalAppliedCount + totalFailedCount >= MAX_JOBS_PER_RUN) {
        console.log(`[LinkedBoost] Reached max jobs limit (${MAX_JOBS_PER_RUN}), stopping pagination`);
        break pageLoop;
      }

      // Try to go to the next page
      if (pageNum < MAX_PAGES) {
        console.log(`[LinkedBoost] Attempting to navigate to page ${pageNum + 1}...`);
        reportProgress("task:progress", { message: `Navigating to page ${pageNum + 1}...` });

        // First, navigate back to the search results page
        await navigateAndWait(tab.id, startData.url);
        await randomDelay(1500, 2500);

        const paginationResult = await sendToContentScript(tab.id, {
          type: "EXECUTE_ACTION",
          command: "CLICK_PAGINATION_NEXT",
          actionId: `pagination-${pageNum}`,
        });

        if (!paginationResult?.data?.clicked) {
          console.log(`[LinkedBoost] No more pages available after page ${pageNum}`);
          break pageLoop;
        }

        console.log(`[LinkedBoost] Successfully navigated to page ${pageNum + 1}`);

        // Wait for the new page to fully load
        await randomDelay(2500, 3500);
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
    console.error("[LinkedBoost] ====== AUTOMATION FAILED ======");
    console.error("[LinkedBoost] Error:", err.message);
    console.error("[LinkedBoost] Stack:", err.stack);
    console.error("[LinkedBoost] apiUrl:", apiUrl, "authToken:", authToken ? `${authToken.substring(0, 8)}...` : "NOT SET");
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
      console.log("[LinkedBoost] Auth token set:", message.token ? `${message.token.substring(0, 8)}...` : "CLEARED");
      chrome.storage.local.set({ authToken: message.token });
      if (socket && socket.connected) {
        socket.emit("AUTH", { token: authToken });
      }
      sendResponse({ success: true });
      break;

    case "SET_WS_URL":
      wsUrl = message.url;
      console.log("[LinkedBoost] WS URL set to:", message.url);
      chrome.storage.local.set({ wsUrl: message.url });
      if (socket) socket.disconnect();
      reconnectAttempts = 0;
      connect();
      sendResponse({ success: true });
      break;

    case "SET_API_URL":
      apiUrl = message.url;
      console.log("[LinkedBoost] API URL set to:", message.url);
      chrome.storage.local.set({ apiUrl: message.url });
      sendResponse({ success: true });
      break;

    case "GET_STATUS":
      sendResponse({
        connected: socket?.connected ?? false,
        authenticated: !!authToken,
        automationRunning,
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

chrome.storage.local.get(["authToken", "apiUrl"], (result) => {
  if (result.authToken) authToken = result.authToken;
  if (result.apiUrl) apiUrl = result.apiUrl;
  console.log("[LinkedBoost] Initialized — apiUrl:", apiUrl, "authToken:", authToken ? `${authToken.substring(0, 8)}...` : "NOT SET", "wsUrl:", wsUrl);
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
