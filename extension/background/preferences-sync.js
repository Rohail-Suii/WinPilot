/**
 * USER PREFERENCES SYNC UTILITY
 * Syncs AI form filling preference from server to chrome.storage.local
 */

/**
 * Fetch and sync user automation preferences from server
 * Call this when extension connects or user updates settings
 */
async function syncUserPreferences() {
  try {
    const { authToken, apiUrl } = await chrome.storage.local.get(["authToken", "apiUrl"]);

    if (!authToken) {
      console.log("[Preferences Sync] No auth token, skipping sync");
      return;
    }

    const url = apiUrl || "http://localhost:3000";
    const response = await fetch(`${url}/api/settings/automation`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      console.error("[Preferences Sync] Failed to fetch settings:", response.status);
      return;
    }

    const data = await response.json();
    const settings = data.settings || {};

    // Sync AI form filling preference
    const useAIFormFilling = settings.useAIFormFilling ?? false;

    await chrome.storage.local.set({ useAIFormFilling });

    console.log(`[Preferences Sync] AI Form Filling: ${useAIFormFilling ? "ENABLED" : "DISABLED"}`);

    // Notify content scripts of preference change
    broadcastPreferenceChange({ useAIFormFilling });

    return settings;
  } catch (error) {
    console.error("[Preferences Sync] Error syncing preferences:", error);
  }
}

/**
 * Broadcast preference change to all content scripts
 */
function broadcastPreferenceChange(preferences) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: "PREFERENCES_UPDATED",
          preferences,
        }).catch(() => {
          // Tab might not have content script loaded, ignore error
        });
      }
    });
  });
}

/**
 * Listen for preference updates from popup or web app
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SYNC_PREFERENCES") {
    syncUserPreferences()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === "UPDATE_AI_PREFERENCE") {
    // Direct update from popup/web app
    chrome.storage.local.set({ useAIFormFilling: message.enabled });
    broadcastPreferenceChange({ useAIFormFilling: message.enabled });
    sendResponse({ success: true });
  }

  return false;
});

/**
 * Sync preferences on extension startup and periodically
 */
chrome.runtime.onStartup.addListener(() => {
  syncUserPreferences();
});

chrome.runtime.onInstalled.addListener(() => {
  syncUserPreferences();
});

// Sync every 5 minutes
chrome.alarms.create("sync-preferences", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "sync-preferences") {
    syncUserPreferences();
  }
});

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = { syncUserPreferences };
}
