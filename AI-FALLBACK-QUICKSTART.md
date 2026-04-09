# AI Fallback System - Quick Start Guide

## For Users

### How to Enable AI Form Filling

1. **Login to your account** at `http://localhost:3000` (or your deployment URL)

2. **Navigate to Settings**
   - Click on your profile icon
   - Select "Settings" from dropdown
   - Go to "Automation" tab

3. **Enable AI Form Filling**
   - Find "Use AI Form Filling" toggle
   - Turn it **ON** (blue/enabled state)
   - Settings auto-save

4. **Install/Update Extension**
   - Extension automatically syncs settings every 5 minutes
   - Or manually refresh: Right-click extension icon → "Reload Extension"

5. **Start Automating Jobs**
   - Click "Start Automation" button
   - Extension will use naive automation first
   - If validation error occurs, AI fallback kicks in automatically

### Visual Feedback

When AI fallback activates, you'll see console logs:
```
[AI Fallback] Detected 1 validation error(s)
[AI Fallback] Requesting AI correction for: "Expected Salary"
[AI Fallback] Received corrected value: "500000"
```

To view console:
- Right-click extension popup → Inspect
- Or press F12 on LinkedIn page → Console tab

---

## For Developers

### 1. Backend Setup

**Step 1**: Update User Schema (if needed)
```typescript
// lib/db/models/user.ts
interface UserSettings {
  dailyLimits?: { applies: number; posts: number; scrapes: number };
  timezone?: string;
  notificationPrefs?: { email: boolean; inApp: boolean; extension: boolean };
  useAIFormFilling?: boolean; // ← Add this
}
```

**Step 2**: Test API Endpoint
```bash
# Get current settings
curl -X GET http://localhost:3000/api/settings/automation \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update AI preference
curl -X PATCH http://localhost:3000/api/settings/automation \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"useAIFormFilling": true}'
```

**Step 3**: Test AI Correction Endpoint
```bash
curl -X POST http://localhost:3000/api/ai/correct-field \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "fieldLabel": "Expected Salary",
      "fieldType": "number",
      "currentValue": "5,00,000",
      "errorMessage": "Please enter a valid number",
      "inputType": "number"
    }
  }'

# Expected Response:
# {
#   "correctedValue": "500000",
#   "reasoning": "Removed commas from numeric value",
#   "success": true
# }
```

### 2. Extension Setup

**Step 1**: Rebuild Extension (if using build process)
```bash
cd extension
npm run build  # or your build command
```

**Step 2**: Load Extension in Browser
1. Open Chrome/Edge → Extensions → Enable "Developer mode"
2. Click "Load unpacked"
3. Select `extension/dist` folder (or `extension` if no build)

**Step 3**: Configure Extension
1. Click extension icon
2. Set API URL: `http://localhost:3000`
3. Set Auth Token: (copy from browser cookies or login)
4. Click "Connect"

**Step 4**: Open DevTools Console
```javascript
// Check if AI Fallback is loaded
window.AIFallback
// Should return object with methods: { init, isEnabled, detectValidationErrors, ... }

// Check if AI is enabled
window.AIFallback.isEnabled()
// Returns: true or false

// Manual test detection
window.AIFallback.testDetection()
// Returns: Array of detected errors (empty if none)
```

### 3. Testing Validation Detection

**Test Case 1: LinkedIn Salary Field**

1. Go to LinkedIn Easy Apply job
2. Fill salary field with: `5,00,000`
3. Click "Next"
4. Open console, run:
   ```javascript
   window.AIFallback.testDetection()
   ```
5. Should return error object with:
   ```javascript
   [{
     errorMessage: "Please enter a valid number",
     fieldLabel: "Expected Salary",
     currentValue: "5,00,000",
     fieldType: "number"
   }]
   ```

**Test Case 2: Phone Number**

1. Fill phone field with: `(555) 123-4567`
2. If error appears: "Must be 10 digits"
3. AI should correct to: `5551234567`

**Test Case 3: Date Format**

1. Fill date field with: `2024-12-25`
2. If error: "Format must be MM/DD/YYYY"
3. AI should correct to: `12/25/2024`

### 4. Manual AI Correction Test

```javascript
// Manually trigger AI correction
const testContext = {
  fieldLabel: "Expected Salary",
  fieldType: "number",
  currentValue: "5,00,000",
  errorMessage: "Please enter a valid number",
  inputType: "number",
  pageUrl: window.location.href,
  pageTitle: document.title
};

// Send to background script
chrome.runtime.sendMessage({
  type: "AI_FIELD_CORRECTION",
  context: testContext
}, (response) => {
  console.log("AI Response:", response);
  // Expected: { correctedValue: "500000", reasoning: "...", success: true }
});
```

### 5. Integration with Existing Automation

The AI fallback is **already integrated** into `clickNextOrSubmit()` function:

```javascript
// File: extension/content/content-script.js

async function clickNextOrSubmit() {
  // ... existing code ...

  dispatchNativeClick(nextBtn);

  // AI Fallback monitors for errors after click
  if (window.AIFallback && window.AIFallback.isEnabled()) {
    window.AIFallback.monitorForValidationErrors(async (errors) => {
      await window.AIFallback.handleValidationErrorsWithAI(errors, async () => {
        // Retry after corrections
        const retryBtn = getElementByText("button", "Next");
        if (retryBtn && !retryBtn.disabled) {
          dispatchNativeClick(retryBtn);
        }
      });
    });
  }

  // ... rest of code ...
}
```

### 6. Debugging Common Issues

**Issue**: "AI Fallback is not defined"
```javascript
// Solution 1: Check manifest.json
// Ensure ai-fallback.js loads BEFORE content.js:
"content_scripts": [{
  "js": ["content/ai-fallback.js", "content.js"]  // ← ai-fallback.js first
}]

// Solution 2: Hard refresh extension
// Chrome Extensions → Reload extension → Refresh LinkedIn page
```

**Issue**: "AI correction not triggering"
```javascript
// Check if AI is enabled
chrome.storage.local.get(['useAIFormFilling'], (result) => {
  console.log('AI Enabled:', result.useAIFormFilling);
});

// Manually trigger sync
chrome.runtime.sendMessage({ type: 'SYNC_PREFERENCES' });
```

**Issue**: "AI returns incorrect correction"
```javascript
// Check the prompt being sent
// In background script, add console.log:
console.log("AI Prompt:", buildAICorrectionPrompt(context));

// Manually test with different prompts
// Update buildAICorrectionPrompt() in background/service-worker.js
```

### 7. Performance Testing

**Monitor AI Usage**:
```javascript
// Track AI corrections
let aiCorrections = 0;

// Wrap the AI call
const originalRequest = window.AIFallback.requestAICorrection;
window.AIFallback.requestAICorrection = async function(context) {
  aiCorrections++;
  console.log(`AI Correction #${aiCorrections}:`, context.fieldLabel);
  return originalRequest.call(this, context);
};
```

**Measure Success Rate**:
```javascript
// Track successes vs failures
let stats = { success: 0, failure: 0, total: 0 };

window.AIFallback.handleValidationErrorsWithAI = (async function(origFunc) {
  return async function(errors, retryCallback) {
    stats.total += errors.length;

    try {
      await origFunc.call(this, errors, retryCallback);
      stats.success += errors.length;
    } catch (err) {
      stats.failure += errors.length;
      throw err;
    }

    console.log('AI Stats:', stats);
  };
})(window.AIFallback.handleValidationErrorsWithAI);
```

---

## Troubleshooting Checklist

- [ ] Extension loaded and connected
- [ ] Auth token valid (check in extension popup)
- [ ] API URL correct (default: `http://localhost:3000`)
- [ ] AI API key configured in settings
- [ ] `useAIFormFilling` enabled in automation settings
- [ ] `ai-fallback.js` loaded in content scripts
- [ ] No console errors on page load
- [ ] Validation error visible after clicking "Next"
- [ ] MutationObserver not blocked by CSP

---

## Example: Complete Test Session

```javascript
// 1. Check setup
console.log('AI Fallback loaded:', !!window.AIFallback);
console.log('AI enabled:', window.AIFallback?.isEnabled());

// 2. Navigate to LinkedIn job application
// Go to any Easy Apply job

// 3. Fill form with intentionally invalid data
document.querySelector('input[type="number"]').value = '5,00,000';

// 4. Click Next
document.querySelector('button[aria-label="Continue to next step"]')?.click();

// 5. Wait 1.5 seconds, then check for errors
setTimeout(() => {
  const errors = window.AIFallback.testDetection();
  console.log('Detected errors:', errors);
}, 1500);

// 6. If errors detected, AI should auto-correct
// Watch console for:
// [AI Fallback] Detected 1 validation error(s)
// [AI Fallback] Requesting AI correction...
// [AI Fallback] Received corrected value: "500000"
// [AI Fallback] Retrying Next button...
```

---

## Next Steps

1. ✅ Verify all files are in place (see AI-FALLBACK-SYSTEM.md)
2. ✅ Test validation detection on LinkedIn
3. ✅ Test AI correction endpoint
4. ✅ Enable in production settings
5. 📊 Monitor AI usage and success rate
6. 🚀 Deploy to production

**Note**: AI credits are only consumed when validation errors occur and AI correction is triggered. Successful naive automation costs nothing!
