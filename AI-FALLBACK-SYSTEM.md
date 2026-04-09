# AI Fallback System for Form Validation Errors

## Overview

The **AI Fallback System** is a sophisticated error recovery mechanism that automatically detects when form automation gets "stuck" due to validation errors and uses AI to correct the problematic field values.

This system follows a **conservative approach** to AI usage:
1. **First**: Use naive automation (direct field mapping)
2. **Only if stuck**: Trigger AI fallback to fix validation errors
3. **User Control**: Only activates when user enables "AI Form Filling" setting

## Architecture

### 1. ERROR DETECTION (Content Script)

**File**: `extension/content/ai-fallback.js`

The system detects validation errors using multiple strategies:

```javascript
// Detection Strategies:
- MutationObserver monitoring for error elements
- CSS selectors for validation error classes
- ARIA attributes (aria-invalid='true')
- Role attributes (role='alert')
```

**Key Selectors**:
- `.artdeco-inline-feedback--error` (LinkedIn specific)
- `.fb-form-element-label--error` (LinkedIn specific)
- `[data-test-form-element-error-text]` (LinkedIn specific)
- Generic: `.error-message`, `.validation-error`, `[aria-invalid='true']`

**Timing**:
- After clicking "Next", "Review", or "Submit" button
- Waits 1500ms for errors to appear in DOM
- Checks if button is still disabled or error messages are visible

### 2. CONTEXT EXTRACTION

When validation error detected, the system extracts:

**Field Information**:
```javascript
{
  fieldLabel: "What is your expected salary?",
  fieldType: "number",
  currentValue: "5,00,000",
  errorMessage: "Please enter a valid number",
  fieldSelector: "#salary-input",

  // HTML Attributes
  inputType: "number",
  placeholder: "Enter amount",
  pattern: "[0-9]+",
  min: "0",
  max: "10000000",
  required: true,

  // For Dropdowns
  options: [
    { value: "option1", text: "Option 1" },
    { value: "option2", text: "Option 2" }
  ],

  // Additional Context
  hint: "Enter yearly salary in USD",
  pageUrl: "https://linkedin.com/...",
  pageTitle: "Apply to Job - LinkedIn"
}
```

### 3. AI CORRECTION FLOW

**Step 1**: Content script sends context to background script
```javascript
chrome.runtime.sendMessage({
  type: "AI_FIELD_CORRECTION",
  context: extractedContext
});
```

**Step 2**: Background script calls AI API
```javascript
// File: extension/background/service-worker.js
async function handleAIFieldCorrection(context) {
  const response = await fetch(`${apiUrl}/api/ai/correct-field`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ prompt, context })
  });

  return await response.json();
}
```

**Step 3**: Server processes with AI
```javascript
// File: app/api/ai/correct-field/route.ts
const result = await ai.generateJSON([
  {
    role: "system",
    content: "You are a form validation expert..."
  },
  {
    role: "user",
    content: buildAICorrectionPrompt(context)
  }
]);

// Returns:
{
  correctedValue: "500000",
  reasoning: "Removed commas from number format",
  success: true
}
```

### 4. VALUE RE-INJECTION

**File**: `extension/content/ai-fallback.js` → `reinjectCorrectedValue()`

**Process**:
1. Clear existing value: `field.value = ""`
2. Dispatch input event to clear
3. Wait 100ms for framework to register clearing
4. Set corrected value: `field.value = correctedValue`
5. Trigger ALL necessary DOM events:
   - `input` event
   - `change` event
   - `focus` event
   - `blur` event
6. **React/Angular/Vue Compatibility**:
   ```javascript
   const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
     window.HTMLInputElement.prototype,
     "value"
   )?.set;

   if (nativeInputValueSetter) {
     nativeInputValueSetter.call(field, correctedValue);
     field.dispatchEvent(new Event("input", { bubbles: true }));
   }
   ```

### 5. AUTOMATED RETRY

After AI correction applied:
1. Wait 800ms for button to re-enable
2. Re-click the "Next"/"Submit"/"Review" button
3. Monitor again for validation errors
4. Maximum 2 retry attempts per field (prevents infinite loops)

## Usage

### For End Users

**Step 1**: Enable AI Form Filling
1. Go to Settings → Automation
2. Toggle "Use AI Form Filling" to ON
3. Setting syncs to browser extension automatically

**Step 2**: Start Job Automation
1. Click "Start Automation" in extension
2. Extension will use naive automation first
3. If validation error occurs, AI fallback activates automatically
4. Visual feedback in console: `[AI Fallback] Detected validation error...`

### For Developers

**Testing Validation Detection**:
```javascript
// In browser console on LinkedIn job application page
window.AIFallback.testDetection();
// Returns array of detected errors
```

**Manual AI Correction**:
```javascript
const errors = window.AIFallback.detectValidationErrors();
window.AIFallback.handleValidationErrorsWithAI(errors, () => {
  console.log("Corrections applied!");
});
```

**Reset Retry Counts**:
```javascript
// Call when moving to new form page
window.AIFallback.resetRetryCount();
```

## Configuration

### Content Script Configuration

**File**: `extension/content/ai-fallback.js`

```javascript
const CONFIG = {
  VALIDATION_CHECK_DELAY: 1500,        // Wait 1500ms after button click
  BUTTON_DISABLED_CHECK_DELAY: 800,    // Wait 800ms before retry
  MAX_AI_RETRY_ATTEMPTS: 2,            // Max retries per field
  CONTEXT_EXTRACTION_TIMEOUT: 5000     // Timeout for context extraction
};
```

### Chrome Storage Keys

```javascript
// Stored in chrome.storage.local
{
  useAIFormFilling: true/false  // Enable/disable AI fallback
}
```

## Files Modified/Created

### Created Files:
1. ✅ `extension/content/ai-fallback.js` - Core AI fallback module (600+ lines)
2. ✅ `app/api/ai/correct-field/route.ts` - Server-side AI correction endpoint

### Modified Files:
1. ✅ `extension/manifest.json` - Added ai-fallback.js to content_scripts
2. ✅ `extension/content/content-script.js` - Integrated AI monitoring in clickNextOrSubmit()
3. ✅ `extension/background/service-worker.js` - Added AI_FIELD_CORRECTION message handler
4. ✅ `app/api/settings/automation/route.ts` - Added useAIFormFilling preference

## Error Handling

### Common Errors and Solutions

**Error**: "No AI API key configured"
- **Solution**: Add OpenAI/Anthropic API key in Settings → AI Keys

**Error**: "Too many requests"
- **Solution**: Rate limit exceeded, wait 1 minute

**Error**: "AI did not return a correctedValue"
- **Solution**: AI response malformed, check AI provider status

**Error**: "Element not found within timeout"
- **Solution**: Page loading too slow, increase timeout in CONFIG

## AI Prompt Engineering

The system uses a carefully crafted prompt that includes:

1. **Field Context**: Label, type, current value, error message
2. **Validation Rules**: Pattern, min, max, minLength, maxLength
3. **Examples**: Common fixes (remove commas, format dates, etc.)
4. **Response Format**: Strict JSON schema

Example prompt excerpt:
```
**Examples of common fixes:**
- If error is "Please enter a valid number" and value is "5,00,000"
  → remove commas → "500000"
- If error is "Phone number must be 10 digits" and value has formatting
  → extract just digits
- If error is "Date format must be MM/DD/YYYY"
  → reformat the date
```

## Performance Considerations

### AI Credits Conservation

✅ **Naive automation runs first** - No AI cost if automation succeeds
✅ **Only triggers on validation errors** - AI only called when stuck
✅ **User opt-in required** - AI disabled by default
✅ **Max retry limit** - Prevents infinite AI calls on same field (2 attempts max)
✅ **Field-specific tracking** - Each unique field tracked separately

### Estimated AI Costs

Assuming OpenAI GPT-4:
- **Per field correction**: ~500 tokens (~$0.007)
- **Per job application**: 0-3 corrections (~$0.00-$0.02)
- **User with AI disabled**: $0.00

## Security Considerations

1. **Authorization**: All AI API calls require valid auth token
2. **Rate Limiting**: API rate limit prevents abuse
3. **Input Sanitization**: CSS.escape() prevents selector injection
4. **No PII in logs**: Field values not logged in production
5. **HTTPS only**: All API calls over secure connection

## Monitoring & Debugging

### Console Logs

The system provides detailed console logging:

```javascript
[AI Fallback] Initialized. AI filling ENABLED
[AI Fallback] Detected 1 validation error(s)
[AI Fallback] Requesting AI correction for: "Expected Salary"
[AI Fallback] Received corrected value: "500000"
[AI Fallback] Re-injecting corrected value into number field
[AI Fallback] Retrying Next button click after AI corrections...
```

### Success Metrics to Track

- Validation error detection rate
- AI correction success rate
- Average corrections per application
- AI credits consumed per user
- User preference adoption rate

## Future Enhancements

### Potential Improvements:

1. **Local ML Model**: Use lightweight local model for common corrections (no API cost)
2. **Correction Caching**: Cache successful corrections for similar fields
3. **Field-Specific Strategies**: Custom correction logic for known field types (phone, salary, date)
4. **Visual Feedback**: Show toast notification when AI correction applied
5. **Learning System**: Learn from successful corrections to improve future automation

## Testing

### Unit Tests

```javascript
// Test validation detection
test('detectValidationErrors finds error elements', () => {
  // Create mock error element
  const errorEl = document.createElement('div');
  errorEl.className = 'artdeco-inline-feedback--error';
  errorEl.textContent = 'Invalid value';
  document.body.appendChild(errorEl);

  const errors = window.AIFallback.detectValidationErrors();
  expect(errors.length).toBeGreaterThan(0);
});
```

### Integration Tests

1. Create LinkedIn job application with known validation requirements
2. Inject invalid values (e.g., "5,00,000" for number field)
3. Click "Next" and verify AI fallback triggers
4. Verify correction applied and form progresses

## Support

For issues or questions:
1. Check console logs for error details
2. Verify AI API key is configured
3. Ensure useAIFormFilling is enabled in settings
4. Check browser extension permissions

## License

Part of LinkedBoost browser extension.
