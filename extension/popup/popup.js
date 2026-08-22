// WinPilot Popup Script

const DEFAULT_DASHBOARD_BASE_URL = "https://winpilot.onrender.com";

const app = document.getElementById("app");

async function init() {
  const status = await getBackgroundStatus();
  const authToken = await getStoredToken();
  const dashboardBaseUrl = await getDashboardBaseUrl();

  if (!authToken) {
    renderLoginPrompt(dashboardBaseUrl);
    return;
  }

  renderDashboard(status, dashboardBaseUrl);
}

function normalizeBaseUrl(url) {
  return (url || "").replace(/\/$/, "");
}

function getDashboardBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["dashboardUrl", "apiUrl"], (result) => {
      const stale = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
      const stored = normalizeBaseUrl(result.dashboardUrl || result.apiUrl);

      // Ignore localhost values left over from a dev build.
      resolve(stored && !stale.test(stored) ? stored : DEFAULT_DASHBOARD_BASE_URL);
    });
  });
}

function getBackgroundStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
      resolve(response || { connected: false, authenticated: false });
    });
  });
}

function getStoredToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get("authToken", (result) => {
      resolve(result.authToken || null);
    });
  });
}

function saveToken(token) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ authToken: token }, () => {
      chrome.runtime.sendMessage({ type: "SET_AUTH_TOKEN", token }, () => {
        resolve(true);
      });
    });
  });
}

function clearToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove("authToken", () => {
      chrome.runtime.sendMessage({ type: "SET_AUTH_TOKEN", token: null }, () => {
        resolve(true);
      });
    });
  });
}

function renderLoginPrompt(dashboardBaseUrl) {
  app.innerHTML = `
    <div class="login-prompt">
      <p>Connect to your WinPilot account</p>
      <div style="margin-bottom: 12px;">
        <input type="text" id="token-input" placeholder="Paste connection token here"
          style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); color: #F8FAFC; font-size: 12px; font-family: monospace; outline: none;" />
      </div>
      <button class="btn btn-primary" id="connect-token">
        Connect
      </button>
      <button class="btn btn-outline" id="open-dashboard">
        Get Token from Dashboard
      </button>
    </div>
  `;

  document.getElementById("connect-token").addEventListener("click", () => {
    const token = document.getElementById("token-input").value.trim();
    if (!token) return;
    chrome.runtime.sendMessage({ type: "SET_AUTH_TOKEN", token }, () => {
      setTimeout(init, 500);
    });
  });

  document.getElementById("open-dashboard").addEventListener("click", () => {
    chrome.tabs.create({ url: `${dashboardBaseUrl}/dashboard/settings` });
  });
}

function renderDashboard(status, dashboardBaseUrl) {
  app.innerHTML = `
    <div class="status-card">
      <div class="status-row">
        <span class="status-label">Server Connection</span>
        <span class="status-value">
          <span class="dot ${status.connected ? "green" : "red"}"></span>
          ${status.connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div class="status-row">
        <span class="status-label">Authentication</span>
        <span class="status-value">
          <span class="dot ${status.authenticated ? "green" : "yellow"}"></span>
          ${status.authenticated ? "Verified" : "Pending"}
        </span>
      </div>
      <div class="status-row">
        <span class="status-label">Job Automation</span>
        <span class="status-value">
          <span class="dot ${status.automationRunning ? "green" : "red"}"></span>
          ${status.automationRunning ? "Running" : "Idle"}
        </span>
      </div>
      <div class="status-row">
        <span class="status-label">Lead Generation</span>
        <span class="status-value">
          <span class="dot ${status.leadGenRunning ? "green" : "red"}"></span>
          ${status.leadGenRunning ? "Running" : "Idle"}
        </span>
      </div>
    </div>

    <div class="task-info" id="current-task" style="display: none;">
      <div class="label">Current Task</div>
      <div id="task-text">Idle</div>
    </div>

    ${status.leadGenRunning ? `
      <button class="btn btn-outline" id="stop-lead-gen" style="color: rgba(239,68,68,0.7); margin-bottom: 4px;">
        ⏹ Stop Lead Generation
      </button>
    ` : ""}

    <button class="btn btn-primary" id="open-dashboard">
      Open Dashboard
    </button>

    ${!status.connected ? `
      <button class="btn btn-outline" id="reconnect">
        Reconnect
      </button>
    ` : ""}

    <button class="btn btn-outline" id="disconnect" style="color: rgba(239,68,68,0.7);">
      Disconnect
    </button>
  `;

  document.getElementById("open-dashboard").addEventListener("click", () => {
    chrome.tabs.create({ url: `${dashboardBaseUrl}/dashboard` });
  });

  const reconnectBtn = document.getElementById("reconnect");
  if (reconnectBtn) {
    reconnectBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "CONNECT" });
      setTimeout(init, 1000);
    });
  }

  const stopLeadGenBtn = document.getElementById("stop-lead-gen");
  if (stopLeadGenBtn) {
    stopLeadGenBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "STOP_LEAD_GEN" });
      setTimeout(init, 500);
    });
  }

  document.getElementById("disconnect").addEventListener("click", () => {
    chrome.storage.local.remove("authToken");
    chrome.runtime.sendMessage({ type: "SET_AUTH_TOKEN", token: null });
    init();
  });
}

// Listen for status changes from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CONNECTION_STATUS") {
    init();
  }
});

init();
