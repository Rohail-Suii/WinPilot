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
      handleServerMessage({ type: "EXECUTE_ACTION", ...message });
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
      startAutomation(message.searchId);
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
        console.error(`[LinkedBoost] <- Content script error (tab ${tabId}):`, chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
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

async function startAutomation(searchId) {
  if (automationRunning) {
    reportProgress("task:error", { message: "Automation already running" });
    return;
  }

  console.log(`[LinkedBoost] ====== STARTING AUTOMATION ======`);
  console.log(`[LinkedBoost] searchId: ${searchId}`);
  console.log(`[LinkedBoost] apiUrl: ${apiUrl}`);
  console.log(`[LinkedBoost] authToken: ${authToken ? `${authToken.substring(0, 8)}...` : "NOT SET"}`);
  console.log(`[LinkedBoost] wsUrl: ${wsUrl}`);

  automationRunning = true;
  automationAborted = false;

  chrome.storage.local.set({ automationRunning: true, automationSearchId: searchId });

  reportProgress("task:start", { label: "Starting job automation..." });

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

    // Step 2: Scrape job listings
    console.log(`[LinkedBoost] Step 2: Scraping job listings...`);
    reportProgress("task:progress", { message: "Scraping job listings..." });
    await randomDelay(1500, 2500);

    const scrapeResult = await sendToContentScript(tab.id, {
      type: "EXECUTE_ACTION",
      command: "SCRAPE_JOB_LISTINGS",
      actionId: "scrape-listings",
    });

    const scrapedJobs = scrapeResult?.data?.jobs || [];
    console.log(`[LinkedBoost] Step 2 result: ${scrapedJobs.length} jobs found`);
    if (scrapedJobs.length > 0) {
      console.log(`[LinkedBoost] First job:`, JSON.stringify(scrapedJobs[0]));
    }
    if (scrapedJobs.length === 0) {
      console.error(`[LinkedBoost] Step 2 FAILED: scrapeResult =`, JSON.stringify(scrapeResult));
      throw new Error("No jobs found on the search results page");
    }

    reportProgress("job:found", {
      message: `Found ${scrapedJobs.length} jobs, getting details...`,
      count: scrapedJobs.length,
    });

    // Step 2b: Get details for each job
    console.log(`[LinkedBoost] Step 2b: Getting details for up to ${Math.min(scrapedJobs.length, 10)} jobs...`);
    const jobsWithDetails = [];
    for (let i = 0; i < Math.min(scrapedJobs.length, 10); i++) {
      if (automationAborted) return cleanup("Automation stopped by user");

      const job = scrapedJobs[i];
      if (!job.url) {
        console.warn(`[LinkedBoost] Job ${i} has no URL, skipping: ${job.title}`);
        continue;
      }

      console.log(`[LinkedBoost] Scraping job ${i + 1}/${Math.min(scrapedJobs.length, 10)}: ${job.title} (${job.url})`);
      await navigateAndWait(tab.id, job.url);

      // Retry scraping up to 3 times with increasing delays
      let detail = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const detailResult = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "SCRAPE_JOB_DETAIL",
            actionId: `detail-${i}-${attempt}`,
          });

          detail = detailResult?.data?.detail;
          console.log(`[LinkedBoost] Job ${i} detail attempt ${attempt + 1}: description=${detail?.description ? `${detail.description.length} chars` : 'EMPTY'}, title=${detail?.title || 'EMPTY'}`);
          if (detail?.description) break;
        } catch (err) {
          console.warn(`[LinkedBoost] Scrape attempt ${attempt + 1} failed for job ${i}: ${err.message}`);
        }

        if (attempt < 2) {
          await randomDelay(2000 * (attempt + 1), 3000 * (attempt + 1));
        }
      }

      if (detail?.description) {
        jobsWithDetails.push({
          ...job,
          title: detail.title || job.title,
          company: detail.company || job.company,
          description: detail.description,
        });
        console.log(`[LinkedBoost] ✓ Job ${i} details captured: "${detail.title}" - ${detail.description.length} chars`);
      } else {
        console.warn(`[LinkedBoost] ✗ Could not get details for job ${i}: ${job.title}`);
      }

      await randomDelay(1000, 2500);
    }

    console.log(`[LinkedBoost] Step 2b complete: ${jobsWithDetails.length}/${Math.min(scrapedJobs.length, 10)} jobs with details`);

    if (jobsWithDetails.length === 0) {
      throw new Error("Could not get job details for any listings");
    }

    reportProgress("task:progress", {
      message: `Got details for ${jobsWithDetails.length} jobs, scoring with AI...`,
    });

    // Step 3: Send to server for AI scoring
    console.log(`[LinkedBoost] Step 3: Sending ${jobsWithDetails.length} jobs for AI scoring...`);
    const processResult = await apiCall(`/api/jobs/automate?step=process-jobs`, {
      jobs: jobsWithDetails,
      searchId,
    });

    const qualifyingApps = processResult.applications || [];
    console.log(`[LinkedBoost] Step 3 result: ${qualifyingApps.length} qualifying applications`);
    if (qualifyingApps.length > 0) {
      console.log(`[LinkedBoost] Qualifying apps:`, qualifyingApps.map(a => `${a.jobTitle} (${a.matchScore}%)`));
    }
    if (qualifyingApps.length === 0) {
      reportProgress("task:complete", {
        message: `Processed ${jobsWithDetails.length} jobs but none matched your profile (score >= 60%). Try broadening your search.`,
      });
      return cleanup();
    }

    reportProgress("task:progress", {
      message: `${qualifyingApps.length} jobs match your profile! Starting applications...`,
    });

    // Step 4: Apply to each qualifying job
    let appliedCount = 0;
    let failedCount = 0;

    for (const app of qualifyingApps) {
      if (automationAborted) return cleanup("Automation stopped by user");

      console.log(`[LinkedBoost] Step 4: Applying to "${app.jobTitle}" at ${app.company} (${app.matchScore}% match, appId=${app._id})`);
      reportProgress("job:applying", {
        message: `Preparing application for ${app.jobTitle} at ${app.company} (${app.matchScore}% match)...`,
        jobTitle: app.jobTitle,
        company: app.company,
      });

      try {
        // 4a: Tailor resume + generate PDF
        console.log(`[LinkedBoost] Step 4a: Tailoring resume for ${app.jobTitle}...`);
        const prepData = await apiCall(`/api/jobs/automate?step=prepare-apply`, {
          applicationId: app._id,
        });
        console.log(`[LinkedBoost] Step 4a result: resumePdf=${prepData.resumePdf ? `${prepData.resumePdf.length} chars base64` : 'NONE'}, fileName=${prepData.resumeFileName}`);

        // 4b: Navigate to job page
        console.log(`[LinkedBoost] Step 4b: Navigating to job page: ${app.jobUrl}`);
        await navigateAndWait(tab.id, app.jobUrl);
        await randomDelay(1500, 2500);

        if (automationAborted) return cleanup("Automation stopped by user");

        // 4c: Click Easy Apply
        console.log(`[LinkedBoost] Step 4c: Clicking Easy Apply...`);
        const easyApplyResult = await sendToContentScript(tab.id, {
          type: "EXECUTE_ACTION",
          command: "CLICK_EASY_APPLY",
          actionId: `apply-${app._id}`,
        });
        console.log(`[LinkedBoost] Step 4c result:`, JSON.stringify(easyApplyResult?.data));

        if (!easyApplyResult?.data?.clicked) {
          throw new Error(`Easy Apply button not found: ${easyApplyResult?.data?.error || 'unknown'}`);
        }

        // SDUI: Easy Apply navigates to a new page — wait for load and re-inject content script
        if (easyApplyResult?.data?.sdui) {
          console.log(`[LinkedBoost] Step 4c: SDUI apply page detected, waiting for navigation...`);
          await waitForTabLoad(tab.id);
          await randomDelay(2000, 3000);
          await ensureContentScriptReady(tab.id);
        }

        await randomDelay(1500, 2500);

        // 4d: Fill form pages
        console.log(`[LinkedBoost] Step 4d: Filling form pages...`);
        let formPage = 0;
        const MAX_FORM_PAGES = 8;
        let submitted = false;

        while (formPage < MAX_FORM_PAGES) {
          if (automationAborted) return cleanup("Automation stopped by user");

          console.log(`[LinkedBoost] Form page ${formPage + 1}: Getting fields...`);
          const fieldsResult = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "GET_FORM_FIELDS",
            actionId: `fields-${formPage}`,
          });

          const fields = fieldsResult?.data?.fields || [];
          console.log(`[LinkedBoost] Form page ${formPage + 1}: ${fields.length} fields found`);
          if (fields.length > 0) {
            console.log(`[LinkedBoost] Fields:`, fields.map(f => `[${f.type}] "${f.label}" = "${f.value || ''}"`));
          }

          if (fields.length > 0) {
            // Upload resume if file field exists
            const fileField = fields.find((f) => f.type === "file");
            if (fileField && prepData.resumePdf) {
              console.log(`[LinkedBoost] Uploading tailored resume PDF...`);
              const uploadResult = await sendToContentScript(tab.id, {
                type: "EXECUTE_ACTION",
                command: "UPLOAD_RESUME",
                actionId: `upload-${formPage}`,
                fileData: prepData.resumePdf,
                fileName: prepData.resumeFileName,
              });
              console.log(`[LinkedBoost] Upload result:`, JSON.stringify(uploadResult?.data));
              await randomDelay(2000, 3000);
            }

            // Get AI answers for empty fields
            const answerableFields = fields.filter(
              (f) => f.type !== "file" && f.label && !f.value
            );
            console.log(`[LinkedBoost] ${answerableFields.length} fields need answers`);

            if (answerableFields.length > 0) {
              console.log(`[LinkedBoost] Getting AI answers for:`, answerableFields.map(f => f.label));
              const answersData = await apiCall(`/api/jobs/automate?step=answer-form`, {
                questions: answerableFields,
                applicationId: app._id,
              });

              const answers = answersData.answers || [];
              console.log(`[LinkedBoost] Got ${answers.length} answers:`, answers.map(a => `"${a.question}" -> "${a.answer}" (${a.confidence}%)`));

              for (let fi = 0; fi < answers.length; fi++) {
                if (automationAborted) return cleanup("Automation stopped by user");

                const answer = answers[fi];
                if (!answer.answer) continue;

                const originalField = fields.find((f) => f.label === answer.question);
                const originalIndex = fields.indexOf(originalField);
                if (originalIndex < 0) {
                  console.warn(`[LinkedBoost] Could not find field for question: "${answer.question}"`);
                  continue;
                }

                console.log(`[LinkedBoost] Filling field ${originalIndex} "${answer.question}" with "${answer.answer}"`);
                await sendToContentScript(tab.id, {
                  type: "EXECUTE_ACTION",
                  command: "FILL_FORM_FIELD",
                  actionId: `fill-${formPage}-${fi}`,
                  fieldIndex: originalIndex,
                  value: answer.answer,
                  fieldType: originalField.type,
                });

                await randomDelay(300, 800);
              }
            }
          }

          // Click Next / Review / Submit
          console.log(`[LinkedBoost] Form page ${formPage + 1}: Clicking Next/Review/Submit...`);
          await randomDelay(500, 1000);
          const navResult = await sendToContentScript(tab.id, {
            type: "EXECUTE_ACTION",
            command: "CLICK_NEXT_OR_SUBMIT",
            actionId: `nav-${formPage}`,
          });

          const action = navResult?.data?.action;
          console.log(`[LinkedBoost] Form page ${formPage + 1} navigation result: action="${action}", error="${navResult?.data?.error || ''}"`);

          if (action === "submitted") {
            submitted = true;
            console.log(`[LinkedBoost] ✓ Application submitted! Marking complete...`);
            await apiCall(`/api/jobs/automate?step=complete`, {
              applicationId: app._id,
              success: true,
              notes: "Auto-applied via LinkedBoost",
            });

            appliedCount++;
            reportProgress("job:applied", {
              message: `Applied to ${app.jobTitle} at ${app.company}!`,
              jobTitle: app.jobTitle,
              company: app.company,
              appliedCount,
            });
            break;
          } else if (action === "next" || action === "review") {
            console.log(`[LinkedBoost] Moving to form page ${formPage + 2}...`);
            formPage++;
            await randomDelay(1000, 2000);
          } else {
            throw new Error(`Form navigation stuck on page ${formPage + 1} (action=${action})`);
          }
        }

        if (!submitted) {
          throw new Error("Too many form pages");
        }

        // Cooldown between applications (5-10 min)
        if (qualifyingApps.indexOf(app) < qualifyingApps.length - 1) {
          const cooldownMs = Math.round(300000 + Math.random() * 300000);
          const cooldownMins = Math.round(cooldownMs / 60000);

          reportProgress("task:progress", {
            message: `Waiting ${cooldownMins} min before next application (anti-detection)...`,
          });

          await new Promise((resolve) => {
            const timer = setTimeout(resolve, cooldownMs);
            const check = setInterval(() => {
              if (automationAborted) {
                clearTimeout(timer);
                clearInterval(check);
                resolve();
              }
            }, 1000);
          });
        }
      } catch (err) {
        console.error(`[LinkedBoost] ✗ Failed to apply to "${app.jobTitle}":`, err.message, err.stack);
        failedCount++;

        await apiCall(`/api/jobs/automate?step=complete`, {
          applicationId: app._id,
          success: false,
          notes: `Auto-apply failed: ${err.message}`,
        }).catch((e) => console.error(`[LinkedBoost] Could not mark app failed:`, e.message));

        reportProgress("task:error", {
          message: `Failed: ${app.jobTitle} — ${err.message}`,
          jobTitle: app.jobTitle,
        });

        await randomDelay(2000, 4000);
      }
    }

    console.log(`[LinkedBoost] ====== AUTOMATION COMPLETE ======`);
    console.log(`[LinkedBoost] Applied: ${appliedCount}, Failed: ${failedCount}`);
    reportProgress("task:complete", {
      message: `Automation complete! Applied: ${appliedCount}, Failed: ${failedCount}`,
      appliedCount,
      failedCount,
    });
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
      startAutomation(message.searchId);
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
