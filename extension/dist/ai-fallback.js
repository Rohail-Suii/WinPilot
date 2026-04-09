/**
 * AI FALLBACK SYSTEM FOR VALIDATION ERRORS
 * ------------------------------------------------------------------------
 * This module detects form validation errors after naive automation fails,
 * extracts context, requests AI correction, and re-injects corrected values.
 * Only triggered when user has enabled AI-assisted form filling.
 */

(function () {
  "use strict";

  // ─── CONFIGURATION ───────────────────────────────────────────────

  const CONFIG = {
    VALIDATION_CHECK_DELAY: 1500, // Time to wait after button click to check for errors
    VALIDATION_ERROR_SELECTORS: [
      // LinkedIn specific selectors
      ".artdeco-inline-feedback--error",
      ".fb-form-element-label--error",
      "[data-test-form-element-error-text]",
      ".artdeco-text-input--error",
      ".jobs-easy-apply__form-error",
      ".artdeco-toast--error",

      // Generic validation error selectors
      ".error-message",
      ".field-error",
      ".validation-error",
      "[aria-invalid='true']",
      ".invalid-feedback",
      "[role='alert']",
      ".form-error"
    ],
    BUTTON_DISABLED_CHECK_DELAY: 800, // Time to wait for button to re-enable after error
    MAX_AI_RETRY_ATTEMPTS: 2, // Max retries with AI for same field
    CONTEXT_EXTRACTION_TIMEOUT: 5000
  };

  // ─── STATE MANAGEMENT ────────────────────────────────────────────

  let isAIFallbackEnabled = false;
  let aiRetryCount = new Map(); // Track retry attempts per field
  let validationObserver = null;
  let pendingValidationCheck = null;

  // ─── INITIALIZATION ──────────────────────────────────────────────

  /**
   * Initialize AI fallback system
   */
  function init() {
    // Load AI preference from storage
    chrome.storage.local.get(["useAIFormFilling"], (result) => {
      isAIFallbackEnabled = result.useAIFormFilling === true;
      console.log(`[AI Fallback] Initialized. AI filling ${isAIFallbackEnabled ? "ENABLED" : "DISABLED"}`);
    });

    // Listen for preference changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.useAIFormFilling) {
        isAIFallbackEnabled = changes.useAIFormFilling.newValue === true;
        console.log(`[AI Fallback] Preference updated. AI filling ${isAIFallbackEnabled ? "ENABLED" : "DISABLED"}`);
      }
    });
  }

  // ─── VALIDATION ERROR DETECTION ───────────────────────────────────

  /**
   * Check if validation errors are present in the DOM
   * @returns {Array<Object>} Array of error objects with element, message, and associated field
   */
  function detectValidationErrors() {
    const errors = [];

    for (const selector of CONFIG.VALIDATION_ERROR_SELECTORS) {
      const errorElements = document.querySelectorAll(selector);

      for (const errorEl of errorElements) {
        // Skip hidden errors
        if (!isElementVisible(errorEl)) continue;

        const errorMessage = extractErrorMessage(errorEl);
        if (!errorMessage) continue;

        // Find the associated input field
        const associatedField = findAssociatedInputField(errorEl);
        if (!associatedField) continue;

        errors.push({
          errorElement: errorEl,
          errorMessage,
          field: associatedField,
          fieldValue: getFieldValue(associatedField),
          fieldType: getFieldType(associatedField),
          fieldLabel: extractFieldLabel(associatedField),
          fieldSelector: generateFieldSelector(associatedField)
        });
      }
    }

    return errors;
  }

  /**
   * Check if element is visible in the viewport
   */
  function isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Extract error message text from error element
   */
  function extractErrorMessage(errorElement) {
    // Try aria-label first
    let message = errorElement.getAttribute("aria-label");
    if (message && message.trim()) return message.trim();

    // Try text content
    message = errorElement.textContent?.trim();
    if (message) return message;

    // Try title attribute
    message = errorElement.getAttribute("title");
    if (message && message.trim()) return message.trim();

    return null;
  }

  /**
   * Find the input field associated with an error element
   */
  function findAssociatedInputField(errorElement) {
    // Strategy 1: Check if error is inside a form field container
    let container = errorElement.closest(".form-field, .fb-form-element, [class*='form-element'], .artdeco-text-input");
    if (container) {
      const input = container.querySelector("input, select, textarea");
      if (input) return input;
    }

    // Strategy 2: Check for aria-describedby relationship
    const errorId = errorElement.id;
    if (errorId) {
      const field = document.querySelector(`[aria-describedby*="${errorId}"]`);
      if (field) return field;
    }

    // Strategy 3: Look for nearby input (sibling or parent-sibling)
    const parent = errorElement.parentElement;
    if (parent) {
      const input = parent.querySelector("input, select, textarea");
      if (input) return input;
    }

    // Strategy 4: Check previous sibling
    let sibling = errorElement.previousElementSibling;
    while (sibling) {
      if (sibling.matches("input, select, textarea")) return sibling;
      const input = sibling.querySelector("input, select, textarea");
      if (input) return input;
      sibling = sibling.previousElementSibling;
    }

    return null;
  }

  /**
   * Get current value from input field
   */
  function getFieldValue(field) {
    if (!field) return null;

    if (field.tagName === "SELECT") {
      return field.options[field.selectedIndex]?.text || field.value;
    }

    if (field.type === "checkbox" || field.type === "radio") {
      return field.checked;
    }

    return field.value;
  }

  /**
   * Get field type
   */
  function getFieldType(field) {
    if (!field) return "unknown";

    if (field.tagName === "SELECT") return "select";
    if (field.tagName === "TEXTAREA") return "textarea";

    return field.type || "text";
  }

  /**
   * Extract label for the field
   */
  function extractFieldLabel(field) {
    if (!field) return "Unknown field";

    // Strategy 1: Check for <label> with for attribute
    const fieldId = field.id;
    if (fieldId) {
      const label = document.querySelector(`label[for="${fieldId}"]`);
      if (label) return label.textContent.trim();
    }

    // Strategy 2: Check parent label
    const parentLabel = field.closest("label");
    if (parentLabel) {
      // Clone and remove the input to get just the label text
      const clone = parentLabel.cloneNode(true);
      const inputs = clone.querySelectorAll("input, select, textarea");
      inputs.forEach(i => i.remove());
      const text = clone.textContent.trim();
      if (text) return text;
    }

    // Strategy 3: Check aria-label or aria-labelledby
    const ariaLabel = field.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel;

    const ariaLabelledBy = field.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const labelElement = document.getElementById(ariaLabelledBy);
      if (labelElement) return labelElement.textContent.trim();
    }

    // Strategy 4: Check placeholder
    const placeholder = field.getAttribute("placeholder");
    if (placeholder) return placeholder;

    // Strategy 5: Check nearby text
    const container = field.closest(".form-field, .fb-form-element, [class*='form-element']");
    if (container) {
      const texts = container.querySelectorAll("legend, .form-label, [class*='label']");
      if (texts.length > 0) return texts[0].textContent.trim();
    }

    return field.name || field.id || "Unknown field";
  }

  /**
   * Generate a unique CSS selector for the field
   */
  function generateFieldSelector(field) {
    if (!field) return null;

    // Try ID first
    if (field.id) return `#${CSS.escape(field.id)}`;

    // Try name attribute
    if (field.name) {
      const tag = field.tagName.toLowerCase();
      return `${tag}[name="${CSS.escape(field.name)}"]`;
    }

    // Generate path-based selector
    let path = [];
    let element = field;

    while (element && element !== document.body) {
      let selector = element.tagName.toLowerCase();

      if (element.className) {
        const classes = element.className.trim().split(/\s+/).slice(0, 2);
        selector += "." + classes.map(c => CSS.escape(c)).join(".");
      }

      // Check uniqueness
      const matches = document.querySelectorAll(path.length === 0 ? selector : `${selector} ${path.join(" ")}`);
      if (matches.length === 1) {
        path.unshift(selector);
        break;
      }

      path.unshift(selector);
      element = element.parentElement;
    }

    return path.join(" > ");
  }

  /**
   * Monitor for validation errors after an action (e.g., clicking Next)
   * @param {Function} callback - Called if validation errors detected
   */
  function monitorForValidationErrors(callback) {
    if (!isAIFallbackEnabled) return;

    // Clear any pending validation check
    if (pendingValidationCheck) {
      clearTimeout(pendingValidationCheck);
    }

    pendingValidationCheck = setTimeout(() => {
      const errors = detectValidationErrors();

      if (errors.length > 0) {
        console.log(`[AI Fallback] Detected ${errors.length} validation error(s):`, errors);
        callback(errors);
      }

      pendingValidationCheck = null;
    }, CONFIG.VALIDATION_CHECK_DELAY);
  }

  // ─── CONTEXT EXTRACTION ──────────────────────────────────────────

  /**
   * Extract detailed context for AI correction
   * @param {Object} errorInfo - Error information from detectValidationErrors
   * @returns {Object} Context object
   */
  function extractFieldContext(errorInfo) {
    const { field, fieldLabel, fieldValue, fieldType, errorMessage, fieldSelector } = errorInfo;

    // Extract additional context
    const context = {
      fieldLabel,
      fieldType,
      currentValue: fieldValue,
      errorMessage,
      fieldSelector,

      // HTML attributes
      inputType: field.type,
      placeholder: field.getAttribute("placeholder") || "",
      pattern: field.getAttribute("pattern") || "",
      maxLength: field.getAttribute("maxlength") || "",
      minLength: field.getAttribute("minlength") || "",
      min: field.getAttribute("min") || "",
      max: field.getAttribute("max") || "",
      step: field.getAttribute("step") || "",
      required: field.hasAttribute("required"),

      // Select options (if applicable)
      options: null,

      // Additional hints from surrounding DOM
      hint: extractFieldHint(field),

      // Page context
      pageUrl: window.location.href,
      pageTitle: document.title
    };

    // Extract select options if it's a dropdown
    if (fieldType === "select") {
      const options = Array.from(field.options || [])
        .filter(opt => !opt.disabled)
        .map(opt => ({
          value: opt.value,
          text: opt.text.trim()
        }));
      context.options = options;
    }

    return context;
  }

  /**
   * Extract hint text near the field
   */
  function extractFieldHint(field) {
    const container = field.closest(".form-field, .fb-form-element, [class*='form-element']");
    if (!container) return "";

    // Look for hint/help text elements
    const hintSelectors = [
      ".form-hint",
      ".help-text",
      "[class*='hint']",
      "[class*='help']",
      ".description",
      "small"
    ];

    for (const selector of hintSelectors) {
      const hintEl = container.querySelector(selector);
      if (hintEl && !hintEl.classList.contains("error")) {
        return hintEl.textContent.trim();
      }
    }

    return "";
  }

  // ─── AI CORRECTION REQUEST ───────────────────────────────────────

  /**
   * Request AI correction for a failed field
   * @param {Object} context - Field context from extractFieldContext
   * @returns {Promise<Object>} AI response with corrected value
   */
  async function requestAICorrection(context) {
    console.log("[AI Fallback] Requesting AI correction for:", context.fieldLabel);

    // Send to background script
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "AI_FIELD_CORRECTION",
          context
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (response.error) {
            reject(new Error(response.error));
            return;
          }

          resolve(response);
        }
      );
    });
  }

  // ─── VALUE RE-INJECTION ──────────────────────────────────────────

  /**
   * Re-inject corrected value into the field
   * @param {HTMLElement} field - The input field
   * @param {any} correctedValue - The AI-corrected value
   * @param {string} fieldType - Field type
   */
  function reinjectCorrectedValue(field, correctedValue, fieldType) {
    if (!field) return;

    console.log(`[AI Fallback] Re-injecting corrected value: "${correctedValue}" into ${fieldType} field`);

    // Clear existing value first
    field.value = "";
    field.dispatchEvent(new Event("input", { bubbles: true }));

    // Small delay to ensure clearing is registered
    setTimeout(() => {
      if (fieldType === "select") {
        // For select, try to match by value or text
        const options = Array.from(field.options || []);
        const matchedOption = options.find(
          opt => opt.value === correctedValue || opt.text.trim() === correctedValue
        );

        if (matchedOption) {
          field.value = matchedOption.value;
          field.selectedIndex = options.indexOf(matchedOption);
        } else {
          field.value = correctedValue;
        }
      } else if (fieldType === "checkbox" || fieldType === "radio") {
        const shouldCheck = String(correctedValue).toLowerCase() === "true" || correctedValue === true;
        field.checked = shouldCheck;
      } else {
        // Text input, number, etc.
        field.value = correctedValue;
      }

      // Trigger all necessary events for React/Angular/Vue
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      field.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      field.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

      // For React specifically, try to trigger onChange via native setter
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(field, correctedValue);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }

      console.log(`[AI Fallback] Value re-injected successfully`);
    }, 100);
  }

  // ─── AUTOMATED RETRY WITH AI ─────────────────────────────────────

  /**
   * Handle validation errors with AI fallback
   * @param {Array<Object>} errors - Detected validation errors
   * @param {Function} retryCallback - Function to retry clicking Next/Submit
   */
  async function handleValidationErrorsWithAI(errors, retryCallback) {
    if (!isAIFallbackEnabled) {
      console.log("[AI Fallback] AI form filling is disabled. Skipping AI correction.");
      return;
    }

    console.log(`[AI Fallback] Processing ${errors.length} validation error(s) with AI...`);

    for (const error of errors) {
      const fieldKey = error.fieldSelector;
      const retryCount = aiRetryCount.get(fieldKey) || 0;

      // Check if we've exceeded retry limit
      if (retryCount >= CONFIG.MAX_AI_RETRY_ATTEMPTS) {
        console.warn(`[AI Fallback] Max retry attempts reached for field: ${error.fieldLabel}`);
        continue;
      }

      try {
        // Extract context
        const context = extractFieldContext(error);

        // Request AI correction
        const aiResponse = await requestAICorrection(context);

        if (aiResponse.correctedValue !== undefined && aiResponse.correctedValue !== null) {
          // Re-inject corrected value
          reinjectCorrectedValue(error.field, aiResponse.correctedValue, error.fieldType);

          // Increment retry count
          aiRetryCount.set(fieldKey, retryCount + 1);

          // Wait for DOM to update
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error(`[AI Fallback] Error processing field "${error.fieldLabel}":`, err);
      }
    }

    // After all corrections, retry the button click
    if (retryCallback && typeof retryCallback === "function") {
      console.log("[AI Fallback] Retrying Next/Submit button click after AI corrections...");
      await new Promise(resolve => setTimeout(resolve, CONFIG.BUTTON_DISABLED_CHECK_DELAY));
      retryCallback();
    }
  }

  /**
   * Reset retry counts (call this when moving to a new form page)
   */
  function resetRetryCount() {
    aiRetryCount.clear();
    console.log("[AI Fallback] Retry count reset");
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────

  window.AIFallback = {
    init,
    isEnabled: () => isAIFallbackEnabled,
    detectValidationErrors,
    monitorForValidationErrors,
    handleValidationErrorsWithAI,
    resetRetryCount,

    // For manual testing
    testDetection: () => {
      const errors = detectValidationErrors();
      console.log("Detected errors:", errors);
      return errors;
    }
  };

  // Auto-initialize
  init();
})();
