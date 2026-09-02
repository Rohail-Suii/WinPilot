// WinPilot Content Script
// Runs on LinkedIn pages — handles DOM interaction, page detection, and action execution

(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════
  // HUMAN BEHAVIOR SIMULATION MODULE
  // Makes all interactions appear natural to LinkedIn's bot detection
  // ═══════════════════════════════════════════════════════════

  const HumanBehavior = (() => {
    // --- Gaussian random using Box-Muller ---
    function gaussianRandom(mean, stdDev) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + z * stdDev;
    }

    function clampedGaussian(min, max) {
      const mean = (min + max) / 2;
      const stdDev = (max - min) / 6;
      return Math.max(min, Math.min(max, Math.round(gaussianRandom(mean, stdDev))));
    }

    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    // --- Bezier curve point for smooth mouse paths ---
    function bezierPoint(t, p0, p1, p2, p3) {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    }

    // --- Simulate mouse movement along a Bezier curve to a target ---
    async function moveMouseTo(targetX, targetY, steps) {
      const numSteps = steps || clampedGaussian(15, 35);
      // Start from a random-ish position (simulate where cursor "was")
      const startX = targetX + clampedGaussian(-300, 300);
      const startY = targetY + clampedGaussian(-200, 200);

      // Random control points for natural curve (not a straight line)
      const cp1x = startX + (targetX - startX) * 0.3 + clampedGaussian(-50, 50);
      const cp1y = startY + (targetY - startY) * 0.1 + clampedGaussian(-40, 40);
      const cp2x = startX + (targetX - startX) * 0.7 + clampedGaussian(-30, 30);
      const cp2y = startY + (targetY - startY) * 0.9 + clampedGaussian(-20, 20);

      for (let i = 0; i <= numSteps; i++) {
        const t = i / numSteps;
        // Ease-out timing (faster start, slower approach to target)
        const easedT = 1 - Math.pow(1 - t, 2.5);
        const x = bezierPoint(easedT, startX, cp1x, cp2x, targetX);
        const y = bezierPoint(easedT, startY, cp1y, cp2y, targetY);

        document.dispatchEvent(
          new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            clientX: x + clampedGaussian(-2, 2), // tiny jitter
            clientY: y + clampedGaussian(-1, 1),
            view: window,
          })
        );

        // Variable speed: slower near target (human deceleration)
        const baseDelay = t > 0.8 ? clampedGaussian(8, 20) : clampedGaussian(3, 10);
        await sleep(baseDelay);
      }
    }

    // --- Hover over an element before clicking ---
    async function hoverElement(element) {
      const rect = element.getBoundingClientRect();
      // Aim slightly off-center (humans don't click dead center)
      const offsetX = clampedGaussian(-rect.width * 0.2, rect.width * 0.2);
      const offsetY = clampedGaussian(-rect.height * 0.15, rect.height * 0.15);
      const x = rect.left + rect.width / 2 + offsetX;
      const y = rect.top + rect.height / 2 + offsetY;

      await moveMouseTo(x, y);

      // Dispatch mouseenter and mouseover
      element.dispatchEvent(
        new MouseEvent("mouseenter", { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window })
      );
      element.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window })
      );

      // Brief hover pause (humans don't click instantly after arriving)
      await sleep(clampedGaussian(80, 250));

      return { x, y };
    }

    // --- Human-like click with full event sequence ---
    async function humanClick(element) {
      // Scroll element into view with natural behavior
      if (element.getBoundingClientRect) {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!isVisible) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(clampedGaussian(300, 700));
        }
      }

      // Move mouse to element with Bezier curve
      const { x, y } = await hoverElement(element);

      // Full mouse event sequence: mousedown -> (small delay) -> mouseup -> click
      element.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0,
        })
      );

      // Humans hold mouse button for 50-150ms
      await sleep(clampedGaussian(50, 150));

      element.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0,
        })
      );

      // Tiny gap before click event fires
      await sleep(clampedGaussian(5, 20));

      element.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0,
        })
      );
    }

    // --- Human-like typing: character by character ---
    /**
     * Put the caret inside a rich-text editor, at the end of what is there.
     *
     * execCommand edits at the selection, so without this the insertion has
     * nowhere to land and silently does nothing.
     */
    function placeCaretAtEnd(element) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    /**
     * Type into a contenteditable editor, one character at a time.
     *
     * LinkedIn's comment box is TipTap/ProseMirror: a contenteditable div with
     * no `value` and no reaction to synthetic KeyboardEvents. Setting `.value`
     * on it — which is all the plain-input path does — inserts nothing at all,
     * so the box stayed empty, its submit button stayed disabled, and every
     * comment came back as "submit button not found".
     *
     * execCommand("insertText") is the one approach that works, because the
     * browser performs a real edit: it mutates the DOM and fires the native
     * beforeinput/input pair that ProseMirror listens for. It is deprecated and
     * still the only thing that does this.
     */
    async function typeIntoRichEditor(element, text) {
      element.focus();
      element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      await sleep(clampedGaussian(100, 300));
      placeCaretAtEnd(element);

      // Clear anything already in the box — a retry must not append to a draft.
      if ((element.textContent || "").trim()) {
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);
        await sleep(clampedGaussian(50, 150));
      }

      for (const char of text) {
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key: char, bubbles: true, cancelable: true })
        );

        const inserted = document.execCommand("insertText", false, char);
        if (!inserted) {
          // execCommand refused. Write the character in and announce it the way
          // the browser would, so the editor still syncs.
          const selection = window.getSelection();
          if (selection?.rangeCount) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const node = document.createTextNode(char);
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          } else {
            element.textContent += char;
          }
          element.dispatchEvent(
            new InputEvent("input", { bubbles: true, inputType: "insertText", data: char })
          );
        }

        element.dispatchEvent(
          new KeyboardEvent("keyup", { key: char, bubbles: true, cancelable: true })
        );

        let delay;
        if (char === " " || char === "." || char === ",") {
          delay = clampedGaussian(100, 250);
        } else if (char === char.toUpperCase() && char !== char.toLowerCase()) {
          delay = clampedGaussian(80, 200);
        } else {
          delay = clampedGaussian(40, 130);
        }
        if (Math.random() < 0.05) delay += clampedGaussian(200, 600);
        await sleep(delay);
      }

      await sleep(clampedGaussian(100, 300));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async function humanType(element, text) {
      // A contenteditable editor has no `value` to set, so the input path below
      // would type nothing into it at all.
      if (element?.isContentEditable || element?.getAttribute?.("contenteditable") === "true") {
        return typeIntoRichEditor(element, text);
      }

      // Focus the element naturally
      element.focus();
      element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      await sleep(clampedGaussian(100, 300));

      // Clear existing value first if present
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set;

      const setter = element.tagName === "TEXTAREA" ? nativeTextAreaValueSetter : nativeInputValueSetter;
      if (setter && element.value) {
        setter.call(element, "");
        element.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(clampedGaussian(50, 150));
      }

      // Type each character with realistic delays
      const chars = text.split("");
      let typed = "";

      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        typed += char;

        // Dispatch keydown
        element.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: char, code: `Key${char.toUpperCase()}`, bubbles: true, cancelable: true,
          })
        );

        // Set value using native setter to trigger React/LinkedIn's state updates
        if (setter) {
          setter.call(element, typed);
        }

        // Dispatch keypress (deprecated but LinkedIn may still listen)
        element.dispatchEvent(
          new KeyboardEvent("keypress", {
            key: char, code: `Key${char.toUpperCase()}`, bubbles: true, cancelable: true,
          })
        );

        // Dispatch input event
        element.dispatchEvent(new Event("input", { bubbles: true }));

        // Dispatch keyup
        element.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: char, code: `Key${char.toUpperCase()}`, bubbles: true, cancelable: true,
          })
        );

        // Variable keystroke delay:
        // - Faster for common letters in the middle of words
        // - Slower at word boundaries, after capitals, or punctuation
        let delay;
        if (char === " " || char === "." || char === ",") {
          delay = clampedGaussian(100, 250); // Pause at word/sentence boundaries
        } else if (char === char.toUpperCase() && char !== char.toLowerCase()) {
          delay = clampedGaussian(80, 200); // Slight pause for capitals (Shift key)
        } else {
          delay = clampedGaussian(40, 130); // Normal typing speed ~70-130ms per char
        }

        // Occasional longer pause (simulating thinking mid-word) ~5% chance
        if (Math.random() < 0.05) {
          delay += clampedGaussian(200, 600);
        }

        await sleep(delay);
      }

      // Brief pause before blur
      await sleep(clampedGaussian(100, 300));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // --- For short values (numbers, dropdown triggers), use fast input ---
    function fastInput(element, value) {
      element.focus();
      element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set;

      if (element.tagName === "TEXTAREA" && nativeTextAreaValueSetter) {
        nativeTextAreaValueSetter.call(element, value);
      } else if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
      }

      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // --- Natural scrolling with variable speed ---
    async function naturalScroll(targetY, duration) {
      // requestAnimationFrame is suspended in background/inactive tabs, which causes
      // an infinite hang. If the tab is not visible, skip animation and scroll instantly.
      if (document.hidden) {
        window.scrollTo(0, targetY);
        return;
      }

      const startY = window.scrollY;
      const distance = targetY - startY;
      const totalDuration = duration || clampedGaussian(600, 1400);
      const startTime = performance.now();

      return new Promise((resolve) => {
        function step(currentTime) {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / totalDuration, 1);
          // Ease-in-out cubic for natural scroll feel
          const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

          window.scrollTo(0, startY + distance * eased);

          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            resolve();
          }
        }
        requestAnimationFrame(step);
      });
    }

    // --- Random small scrolls (simulates reading) ---
    async function idleScroll() {
      const scrollAmount = clampedGaussian(50, 300);
      const direction = Math.random() > 0.3 ? 1 : -1; // Usually scroll down
      const targetY = Math.max(0, window.scrollY + scrollAmount * direction);
      await naturalScroll(targetY, clampedGaussian(400, 800));
    }

    // --- Random micro mouse movements (background activity) ---
    async function microMovements() {
      const count = clampedGaussian(2, 6);
      for (let i = 0; i < count; i++) {
        const x = clampedGaussian(100, window.innerWidth - 100);
        const y = clampedGaussian(100, window.innerHeight - 100);
        document.dispatchEvent(
          new MouseEvent("mousemove", {
            bubbles: true, cancelable: true, clientX: x, clientY: y, view: window,
          })
        );
        await sleep(clampedGaussian(50, 200));
      }
    }

    // --- Simulate brief idle activity (between actions) ---
    async function simulateIdleActivity() {
      const action = Math.random();
      if (action < 0.4) {
        await idleScroll();
      } else if (action < 0.7) {
        await microMovements();
      } else {
        // Just wait (simulates reading)
        await sleep(clampedGaussian(500, 2000));
      }
    }

    // --- Check if LinkedIn has signed the user out ---
    function isSignedOut() {
      const url = window.location.href;
      // LinkedIn sign-out redirects to login or authwall
      if (url.includes("/login") || url.includes("/authwall") || url.includes("/uas/login")) {
        return true;
      }
      // Check for sign-in button prominence (logged-out state)
      const signInBtn = document.querySelector(
        'a[href*="/login"], a[data-tracking-control-name="auth_wall_desktop_profile_sign-in"], ' +
        '.nav__button-secondary[href*="login"], .authwall-join-form'
      );
      if (signInBtn && signInBtn.offsetParent !== null) {
        return true;
      }
      // Check for "Join now" / "Sign in" as main page CTA
      const bodyText = (document.body?.textContent || "").substring(0, 2000).toLowerCase();
      if (
        (bodyText.includes("join now") || bodyText.includes("sign in to linkedin")) &&
        !document.querySelector('.global-nav__me, .feed-identity-module, [data-control-name="identity_welcome_message"]')
      ) {
        return true;
      }
      return false;
    }

    // --- Check for LinkedIn security challenge ---
    function isSecurityChallenge() {
      const url = window.location.href;
      if (url.includes("/checkpoint") || url.includes("/challenge")) {
        return true;
      }
      const bodyText = (document.body?.textContent || "").substring(0, 3000).toLowerCase();
      return (
        bodyText.includes("security verification") ||
        bodyText.includes("let's do a quick security check") ||
        bodyText.includes("verify your identity")
      );
    }

    return {
      humanClick,
      humanType,
      fastInput,
      hoverElement,
      moveMouseTo,
      naturalScroll,
      idleScroll,
      microMovements,
      simulateIdleActivity,
      isSignedOut,
      isSecurityChallenge,
      clampedGaussian,
      sleep,
    };
  })();

  // --- Page Detection ---

  function detectPage() {
    const url = window.location.href;
    if (url.includes("/feed")) return "feed";
    if (url.includes("/jobs")) return "jobs";
    if (url.includes("/in/")) return "profile";
    if (url.includes("/messaging")) return "messaging";
    if (url.includes("/mynetwork")) return "network";
    if (url.includes("/notifications")) return "notifications";
    if (url.includes("/company")) return "company";
    if (url.includes("/groups")) return "groups";
    return "unknown";
  }

  // --- DOM Utilities ---

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  function getElementByText(tag, text) {
    const elements = document.querySelectorAll(tag);
    for (const el of elements) {
      if (el.textContent?.trim().includes(text)) {
        return el;
      }
    }
    return null;
  }

  // --- Action Executors ---
  // All actions use human-like behavior simulation for anti-detection

  // Async human-like click (used in async contexts like handleAction)
  async function dispatchNativeClickAsync(element) {
    await HumanBehavior.humanClick(element);
  }

  // Sync-compatible click fallback (for places that can't await)
  function dispatchNativeClick(element) {
    const rect = element.getBoundingClientRect();
    const offsetX = HumanBehavior.clampedGaussian(-rect.width * 0.15, rect.width * 0.15);
    const offsetY = HumanBehavior.clampedGaussian(-rect.height * 0.1, rect.height * 0.1);
    const x = rect.left + rect.width / 2 + offsetX;
    const y = rect.top + rect.height / 2 + offsetY;

    // Dispatch mouseover first (humans hover before clicking)
    element.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y })
    );

    element.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 })
    );

    element.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 })
    );

    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 })
    );
  }

  async function dispatchNativeInput(element, value) {
    // For short values (numbers, URLs, single words), use fast input
    // For longer text, use human-like typing
    const isShortValue = !value || value.length <= 8 || /^\d+$/.test(value) || value.includes("://");

    if (isShortValue) {
      HumanBehavior.fastInput(element, value);
    } else {
      await HumanBehavior.humanType(element, value);
    }
  }

  function scrollTo(y) {
    HumanBehavior.naturalScroll(y);
  }

  // --- Action Handler ---

  async function handleAction(action) {
    try {
      // Check for sign-out or security challenge BEFORE every action
      if (HumanBehavior.isSignedOut()) {
        return {
          status: "error",
          actionId: action.actionId,
          error: "LINKEDIN_SIGNED_OUT",
          message: "LinkedIn has signed you out. Please sign in again.",
        };
      }
      if (HumanBehavior.isSecurityChallenge()) {
        return {
          status: "error",
          actionId: action.actionId,
          error: "LINKEDIN_SECURITY_CHALLENGE",
          message: "LinkedIn security challenge detected. Please complete it manually.",
        };
      }

      // Inject small random idle activity between actions (30% chance)
      if (Math.random() < 0.3) {
        await HumanBehavior.simulateIdleActivity();
      }

      switch (action.command) {
        case "CLICK": {
          const el = await waitForElement(action.selector);
          await dispatchNativeClickAsync(el);
          return { status: "success", actionId: action.actionId };
        }

        case "TYPE": {
          const el = await waitForElement(action.selector);
          await dispatchNativeInput(el, action.value);
          return { status: "success", actionId: action.actionId };
        }

        case "SCROLL": {
          scrollTo(action.y || 0);
          return { status: "success", actionId: action.actionId };
        }

        case "GET_PAGE_INFO": {
          return {
            status: "success",
            actionId: action.actionId,
            data: {
              page: detectPage(),
              url: window.location.href,
              title: document.title,
            },
          };
        }

        case "EXTRACT_TEXT": {
          const el = await waitForElement(action.selector);
          return {
            status: "success",
            actionId: action.actionId,
            data: { text: el.textContent?.trim() },
          };
        }

        case "CHECK_ELEMENT": {
          const el = document.querySelector(action.selector);
          return {
            status: "success",
            actionId: action.actionId,
            data: { exists: !!el },
          };
        }

        // --- Phase 2: Job Scraping ---
        case "SCRAPE_JOB_LISTINGS": {
          // Wait for job listings to load
          console.log("[WinPilot CS] SCRAPE_JOB_LISTINGS: Waiting for listing elements...");
          try {
            await waitForElement(
              ".jobs-search-results__list-item, .job-card-container, .scaffold-layout__list-item, " +
              "[data-occludable-job-id], .job-card-list, a[href*='/jobs/view/']",
              12000
            );
            console.log("[WinPilot CS] SCRAPE_JOB_LISTINGS: Found listing container");
          } catch (e) {
            console.warn("[WinPilot CS] SCRAPE_JOB_LISTINGS: No listing elements found within timeout");
          }
          await new Promise((r) => setTimeout(r, 500));
          const jobs = scrapeJobListings();
          const noResultsConfirmed = jobs.length === 0 && detectNoResultsState();
          console.log(
            `[WinPilot CS] SCRAPE_JOB_LISTINGS: Scraped ${jobs.length} jobs` +
            (noResultsConfirmed ? " (no-results page confirmed)" : "")
          );
          if (jobs.length > 0) console.log("[WinPilot CS] First job:", JSON.stringify(jobs[0]));
          return {
            status: "success",
            actionId: action.actionId,
            data: { jobs, noResultsConfirmed },
          };
        }

        case "SCRAPE_JOB_DETAIL": {
          // Wait for the job description container to load
          console.log("[WinPilot CS] SCRAPE_JOB_DETAIL: Waiting for description element...");
          try {
            await waitForElement(
              "#job-details, .jobs-description__content, .jobs-box__html-content, " +
              ".jobs-description-content, [class*='jobs-description'], .show-more-less-html__markup, " +
              "[data-testid='expandable-text-box'], [componentkey^='JobDetails_AboutTheJob'], " +
              "[data-sdui-component*='aboutTheJob']",
              15000
            );
            console.log("[WinPilot CS] SCRAPE_JOB_DETAIL: Found description container");
          } catch (e) {
            console.warn("[WinPilot CS] SCRAPE_JOB_DETAIL: No description element found within timeout");
            console.warn("[WinPilot CS] Page URL:", window.location.href);
            console.warn("[WinPilot CS] Page title:", document.title);
            // Debug: log what elements ARE on the page
            const debugSelectors = [
              "#job-details", "[class*='jobs-description']", ".show-more-less-html__markup",
              "[data-testid='expandable-text-box']", "[componentkey^='JobDetails']",
              "[data-sdui-component]", "article", "section", "h2",
            ];
            for (const sel of debugSelectors) {
              const found = document.querySelectorAll(sel);
              if (found.length > 0) {
                console.log(`[WinPilot CS] DEBUG: Found ${found.length} element(s) matching "${sel}"`);
              }
            }
          }
          // Scroll the about-the-job section into view to trigger lazy SDUI rendering
          const aboutJobEl = document.querySelector("[componentkey^='JobDetails_AboutTheJob']");
          if (aboutJobEl) {
            aboutJobEl.scrollIntoView({ behavior: 'instant', block: 'center' });
            // Poll for content to appear (LinkedIn lazy-loads SDUI sections)
            for (let i = 0; i < 20; i++) {
              await new Promise((r) => setTimeout(r, 500));
              if ((aboutJobEl.textContent?.trim() || "").length > 50) {
                console.log(`[WinPilot CS] SCRAPE_JOB_DETAIL: Content loaded after ${(i + 1) * 500}ms`);
                break;
              }
            }
          } else {
            // Legacy layout — wait for content to settle
            await new Promise((r) => setTimeout(r, 2000));
          }
          const detail = scrapeJobDetail();
          console.log(`[WinPilot CS] SCRAPE_JOB_DETAIL: title="${detail.title}", company="${detail.company}", description=${detail.description ? `${detail.description.length} chars` : 'EMPTY'}`);
          return {
            status: "success",
            actionId: action.actionId,
            data: { detail },
          };
        }

        case "CHECK_JOB_QUALIFICATION": {
          const qualification = await detectQualificationStatusWithRetry(
            action.maxAttempts || 12,
            action.delayMs || 350
          );
          console.log(
            `[WinPilot CS] CHECK_JOB_QUALIFICATION: status="${qualification.status}", matched=${qualification.matched}, text="${qualification.text || ""}"`
          );
          return {
            status: "success",
            actionId: action.actionId,
            data: { qualification },
          };
        }

        case "SELECT_JOB_FROM_LIST": {
          const result = await selectJobFromList(action.jobId, action.jobUrl);
          return {
            status: "success",
            actionId: action.actionId,
            data: result,
          };
        }

        case "CLICK_PAGINATION_NEXT": {
          const result = await clickPaginationNext();
          return {
            status: "success",
            actionId: action.actionId,
            data: result,
          };
        }

        // --- Phase 2: Easy Apply Form Filling ---
        case "CLICK_EASY_APPLY": {
          const result = await clickEasyApply();
          return { status: "success", actionId: action.actionId, data: result };
        }

        case "GET_FORM_FIELDS": {
          const fields = getFormFields();
          return {
            status: "success",
            actionId: action.actionId,
            data: { fields },
          };
        }

        case "FILL_FORM_FIELD": {
          await fillFormField(action.fieldIndex, action.value, action.fieldType, action.selector);
          return { status: "success", actionId: action.actionId };
        }

        case "AUTO_SELECT_DROPDOWNS": {
          const result = await autoSelectDropdowns();
          return {
            status: "success",
            actionId: action.actionId,
            data: result,
          };
        }

        case "CLICK_NEXT_OR_SUBMIT": {
          const nextResult = await clickNextOrSubmit();
          return {
            status: "success",
            actionId: action.actionId,
            data: nextResult,
          };
        }

        case "UPLOAD_RESUME": {
          const uploadResult = await uploadResume(action.fileData, action.fileName);
          return {
            status: "success",
            actionId: action.actionId,
            data: uploadResult,
          };
        }

        // --- Phase 4: Post-Application Outreach ---
        case "GET_OUTREACH_TARGETS": {
          return {
            status: "success",
            actionId: action.actionId,
            data: {
              company: getCompanyFromJob(),
              hiringTeam: getHiringTeamTargets(),
            },
          };
        }

        case "OPEN_MESSAGE_COMPOSER": {
          const openResult = await openMessageComposer(action.selector);
          return {
            status: "success",
            actionId: action.actionId,
            data: openResult,
          };
        }

        case "SELECT_MESSAGE_TOPIC": {
          const topicResult = await selectMessageTopic(action.preferred);
          return {
            status: "success",
            actionId: action.actionId,
            data: topicResult,
          };
        }

        case "SEND_MESSAGE": {
          const sendResult = await sendComposedMessage(action.text || "");
          return {
            status: "success",
            actionId: action.actionId,
            data: sendResult,
          };
        }

        case "CLOSE_MESSAGE_OVERLAY": {
          const closeResult = await closeMessageOverlay();
          return {
            status: "success",
            actionId: action.actionId,
            data: closeResult,
          };
        }

        case "SCRAPE_COMPANY_PEOPLE": {
          return {
            status: "success",
            actionId: action.actionId,
            data: { people: scrapeCompanyPeople() },
          };
        }

        // --- Phase 2: Post Creation ---
        case "CREATE_POST": {
          const postResult = await createLinkedInPost(action.content, action.hashtags);
          return {
            status: "success",
            actionId: action.actionId,
            data: postResult,
          };
        }

        // --- Phase 2: Engagement ---
        case "LIKE_POST": {
          const likeResult = await likePost(action.selector);
          return {
            status: "success",
            actionId: action.actionId,
            data: likeResult,
          };
        }

        case "COMMENT_ON_POST": {
          // `commentText` is the autopilot task runner's name for it, `comment`
          // the lead-gen loop's. Accept both rather than silently typing
          // undefined into the box.
          const commentResult = await commentOnPost(
            action.selector,
            action.comment ?? action.commentText
          );
          return {
            status: "success",
            actionId: action.actionId,
            data: commentResult,
          };
        }

        case "NAVIGATE": {
          window.location.href = action.url;
          return { status: "success", actionId: action.actionId };
        }

        case "CHECK_SESSION": {
          // Dedicated session-check command for the service worker
          return {
            status: "success",
            actionId: action.actionId,
            data: {
              signedOut: HumanBehavior.isSignedOut(),
              securityChallenge: HumanBehavior.isSecurityChallenge(),
              url: window.location.href,
            },
          };
        }

        case "SIMULATE_BROWSING": {
          // Simulate natural browsing activity (scrolling, mouse movement)
          const duration = action.duration || HumanBehavior.clampedGaussian(3000, 8000);
          const iterations = Math.floor(duration / 1000);
          for (let i = 0; i < iterations; i++) {
            await HumanBehavior.simulateIdleActivity();
            await HumanBehavior.sleep(HumanBehavior.clampedGaussian(400, 1200));
          }
          return { status: "success", actionId: action.actionId };
        }

        // ─── Autopilot: read down the LinkedIn home feed ─────────────────
        case "SCRAPE_FEED_POSTS": {
          const feedPosts = await scrapeFeedPosts(action.maxPosts || 25);
          return {
            status: "success",
            actionId: action.actionId,
            data: { posts: feedPosts },
          };
        }

        // ─── Autopilot: act on one card of the feed, without leaving it ───
        case "ENGAGE_FEED_POST": {
          const engaged = await engageFeedPost({
            postKey: action.postKey,
            selector: action.selector,
            comment: action.comment ?? action.commentText,
            alsoLike: action.alsoLike,
          });
          return {
            status: "success",
            actionId: action.actionId,
            data: engaged,
          };
        }

        // ─── Lead Generation: scrape posts from LinkedIn search results ───
        case "SCRAPE_KEYWORD_POSTS": {
          const posts = await scrapeKeywordPosts(action.keyword || "");
          return {
            status: "success",
            actionId: action.actionId,
            data: { posts },
          };
        }

        // ─── Lead Generation: increment stat for found posts ─────────────
        case "INCREMENT_LEAD_FOUND": {
          // No-op in content script — reported via API from service worker
          return { status: "success", actionId: action.actionId };
        }

        // ─── Profile Optimizer: scrape user's own LinkedIn profile ────────
        case "SCRAPE_USER_PROFILE": {
          console.log("[WinPilot CS] SCRAPE_USER_PROFILE: Starting user profile scrape");

          // Navigate to the user's own profile if not already there
          if (!window.location.pathname.startsWith("/in/")) {
            console.log("[WinPilot CS] SCRAPE_USER_PROFILE: Not on a profile page, navigating...");
            return {
              status: "error",
              actionId: action.actionId,
              error: "Please navigate to your LinkedIn profile page (/in/your-name) first.",
            };
          }

          try {
            // Wait for the main profile content to load
            await waitForElement(
              ".text-heading-xlarge, h1.text-heading-xlarge, [data-generated-suggestion-target]",
              10000
            );
          } catch (e) {
            console.warn("[WinPilot CS] SCRAPE_USER_PROFILE: Profile header not found within timeout");
          }

          await new Promise((r) => setTimeout(r, 1000));

          const profileData = scrapeUserProfile();
          console.log("[WinPilot CS] SCRAPE_USER_PROFILE: Scraped profile:", JSON.stringify({
            headline: profileData.headline,
            skillsCount: profileData.skills.length,
            experienceCount: profileData.experience.length,
          }));

          return {
            status: "success",
            actionId: action.actionId,
            data: { profileData },
          };
        }

        default:
          return {
            status: "error",
            actionId: action.actionId,
            error: `Unknown command: ${action.command}`,
          };
      }
    } catch (e) {
      return {
        status: "error",
        actionId: action.actionId,
        error: e.message,
      };
    }
  }

  // --- Profile Optimizer: Scrape the user's own LinkedIn profile ---

  function scrapeUserProfile() {
    // Headline
    const headlineEl = document.querySelector(
      ".text-heading-xlarge, h1.text-heading-xlarge"
    );
    const headline = headlineEl?.textContent?.trim() || "";

    // About / Summary
    const aboutEl = document.querySelector(
      "#about ~ .pvs-list__outer-container .visually-hidden, " +
      "section[data-member-id] .pv-about-section .pv-about__summary-text, " +
      ".pv-about-section span[aria-hidden='false'], " +
      "[data-field='summary'] .pvs-multiline-text, " +
      ".inline-show-more-text--is-collapsed, .inline-show-more-text"
    );
    const about = aboutEl?.textContent?.trim() || "";

    // Skills
    const skillEls = document.querySelectorAll(
      ".pvs-list__item--line-separated .t-bold span[aria-hidden='true'], " +
      "[data-field='skill_card_skill_topic'] .t-bold span[aria-hidden='true'], " +
      "li.pvs-list__paged-list-item .display-flex .t-bold span[aria-hidden='true']"
    );
    const skillsSet = new Set();
    skillEls.forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length < 60) skillsSet.add(text);
    });
    const skills = [...skillsSet].slice(0, 30);

    // Experience
    const experience = [];
    const expSection = document.querySelector(
      "#experience ~ .pvs-list__outer-container, section[id='experience-section']"
    );
    if (expSection) {
      const expItems = expSection.querySelectorAll("li.pvs-list__paged-list-item");
      for (const item of Array.from(expItems).slice(0, 10)) {
        const spans = item.querySelectorAll("span[aria-hidden='true']");
        const texts = Array.from(spans)
          .map((s) => s.textContent?.trim())
          .filter(Boolean);
        if (texts.length >= 2) {
          experience.push({
            title: texts[0] || "",
            company: texts[1] || "",
            duration: texts[2] || "",
            description: texts.slice(4).join(" ").substring(0, 300),
          });
        }
      }
    }

    // Education
    const education = [];
    const eduSection = document.querySelector(
      "#education ~ .pvs-list__outer-container, section[id='education-section']"
    );
    if (eduSection) {
      const eduItems = eduSection.querySelectorAll("li.pvs-list__paged-list-item");
      for (const item of Array.from(eduItems).slice(0, 5)) {
        const spans = item.querySelectorAll("span[aria-hidden='true']");
        const texts = Array.from(spans)
          .map((s) => s.textContent?.trim())
          .filter(Boolean);
        if (texts.length >= 1) {
          education.push({
            school: texts[0] || "",
            degree: texts[1] || "",
            field: texts[2] || "",
          });
        }
      }
    }

    // Certifications / Licenses
    const certifications = [];
    const certSection = document.querySelector(
      "#licenses_and_certifications ~ .pvs-list__outer-container, " +
      "#certifications ~ .pvs-list__outer-container"
    );
    if (certSection) {
      const certItems = certSection.querySelectorAll("li.pvs-list__paged-list-item");
      for (const item of Array.from(certItems).slice(0, 10)) {
        const spans = item.querySelectorAll("span[aria-hidden='true']");
        const texts = Array.from(spans)
          .map((s) => s.textContent?.trim())
          .filter(Boolean);
        if (texts.length >= 1) {
          certifications.push({
            name: texts[0] || "",
            issuingOrg: texts[1] || "",
          });
        }
      }
    }

    // Featured
    const featured = [];
    const featuredSection = document.querySelector(
      "#featured ~ .pvs-list__outer-container"
    );
    if (featuredSection) {
      const featuredItems = featuredSection.querySelectorAll("li.pvs-list__paged-list-item");
      for (const item of Array.from(featuredItems).slice(0, 6)) {
        const titleEl = item.querySelector(".t-bold span[aria-hidden='true']");
        const typeEl = item.querySelector(".t-14 span[aria-hidden='true']");
        const title = titleEl?.textContent?.trim() || "";
        if (title) {
          featured.push({
            type: typeEl?.textContent?.trim() || "item",
            title,
          });
        }
      }
    }

    return { headline, about, skills, experience, education, certifications, featured };
  }

  // --- Phase 2: Job Scraping Helpers ---

  /**
   * Detect Easy Apply on a search-result card.
   * Returns true / false / null (unknown). Never default unknown → false or all jobs get filtered out
   * when Easy Apply-only mode is on (LinkedIn often hides the badge until hover / uses new SDUI markup).
   */
  function detectCardEasyApply(card) {
    if (!card) return null;

    const rawText = `${card.innerText || ""} ${card.textContent || ""}`;
    const text = rawText.replace(/\u00a0/g, " ").replace(/\s+/g, " ").toLowerCase();

    // Explicit Easy Apply signals (text, aria, icons, LinkedIn apply-method row)
    if (/\beasy\s*apply\b/.test(text)) return true;

    const easySelectors = [
      "[data-test-job-card-easy-apply]",
      "[aria-label*='Easy Apply']",
      "[aria-label*='easy apply']",
      "[data-control-name*='easy_apply']",
      "li-icon[type='linkedin-bug']",
      "svg[data-test-icon*='linkedin-bug']",
      "use[*|href*='linkedin-bug']",
      ".job-card-container__apply-method",
      ".job-card-list__footer-wrapper .job-card-container__footer-item",
      "[class*='job-card-container__apply-method']",
      "[class*='easy-apply']",
    ];
    for (const sel of easySelectors) {
      try {
        if (card.querySelector(sel)) {
          // Footer items can be non-Easy-Apply (promoted, etc.) — verify text when present
          if (sel.includes("footer-item")) {
            const items = card.querySelectorAll(sel);
            for (const item of items) {
              const t = (item.textContent || "").replace(/\s+/g, " ").toLowerCase();
              if (/\beasy\s*apply\b/.test(t) || item.querySelector("li-icon[type='linkedin-bug']")) {
                return true;
              }
            }
            continue;
          }
          return true;
        }
      } catch {
        /* ignore invalid sel */
      }
    }

    // Footer highlighted apply row is almost always Easy Apply on classic layout
    if (card.querySelector(".job-card-container__footer-item--highlighted")) {
      const hl = card.querySelector(".job-card-container__footer-item--highlighted");
      const ht = (hl?.textContent || "").toLowerCase();
      if (!ht || /\beasy\s*apply\b/.test(ht) || ht.includes("apply")) return true;
    }

    // Clear external / company-site signals only
    if (
      /\bapply\s+on\s+company\b/.test(text) ||
      text.includes("external apply") ||
      text.includes("apply on company website") ||
      text.includes("company website") && text.includes("apply")
    ) {
      return false;
    }

    // Unknown — keep eligible; detail pane + CLICK_EASY_APPLY will save true external jobs
    return null;
  }

  function extractJobIdFromCard(card, url) {
    const fromAttrs =
      card.getAttribute("data-occludable-job-id") ||
      card.getAttribute("data-job-id") ||
      card.getAttribute("data-entity-urn")?.match(/jobPosting:(\d+)/)?.[1] ||
      card.querySelector("[data-occludable-job-id]")?.getAttribute("data-occludable-job-id") ||
      card.querySelector("[data-job-id]")?.getAttribute("data-job-id") ||
      card.querySelector("[data-entity-urn*='jobPosting']")?.getAttribute("data-entity-urn")?.match(/jobPosting:(\d+)/)?.[1];
    if (fromAttrs) return String(fromAttrs);

    if (url) {
      const fromUrl =
        url.match(/\/view\/(\d+)/)?.[1] ||
        url.match(/currentJobId=(\d+)/)?.[1] ||
        url.match(/jobPosting[:/](\d+)/)?.[1];
      if (fromUrl) return String(fromUrl);
    }

    // Any nested anchor carrying a job id
    const anchors = card.querySelectorAll("a[href]");
    for (const a of anchors) {
      const href = a.href || a.getAttribute("href") || "";
      const id =
        href.match(/\/jobs\/view\/(\d+)/)?.[1] ||
        href.match(/currentJobId=(\d+)/)?.[1];
      if (id) return String(id);
    }
    return "";
  }

  function scrapeJobListings() {
    const jobCards = document.querySelectorAll(
      ".jobs-search-results__list-item, .job-card-container, .scaffold-layout__list-item, " +
      ".jobs-search-results-list__list-item, [data-occludable-job-id], " +
      "li.jobs-search-results__list-item, .job-card-list, " +
      "li[data-occludable-job-id], div[data-job-id], li.scaffold-layout__list-item"
    );
    const jobs = [];
    const seenIds = new Set();

    for (const card of jobCards) {
      // Prefer the outer list item so we don't double-count nested containers
      const root =
        card.closest?.("[data-occludable-job-id], li.jobs-search-results__list-item, li.scaffold-layout__list-item") ||
        card;

      const titleEl =
        root.querySelector(
          "a.job-card-list__title--link, a.job-card-container__link, a.job-card-list__title, " +
          ".job-card-list__title a, .artdeco-entity-lockup__title a, " +
          "a[href*='/jobs/view/'], a[href*='currentJobId=']"
        ) ||
        root.querySelector(".job-card-list__title, .job-card-container__link, strong a, h3 a");

      const companyEl = root.querySelector(
        ".job-card-container__primary-description, .artdeco-entity-lockup__subtitle, " +
        ".job-card-container__company-name, .artdeco-entity-lockup__subtitle span"
      );
      const locationEl = root.querySelector(
        ".job-card-container__metadata-item, .artdeco-entity-lockup__caption, " +
        ".job-card-container__metadata-wrapper span"
      );
      const cardText = (root.innerText || root.textContent || "").toLowerCase();
      const easyApplyFlag = detectCardEasyApply(root);
      const appliedBadge = root.querySelector(
        ".job-card-container__footer-item--success, [data-test-job-card-applied], .artdeco-inline-feedback--success"
      );
      const alreadyApplied =
        !!appliedBadge ||
        /\bapplied\b/.test(cardText) ||
        cardText.includes("application submitted");

      const title = (titleEl?.textContent || "").replace(/\s+/g, " ").trim();
      if (!title) continue;

      let url = "";
      if (titleEl?.href && /jobs|currentJobId/i.test(titleEl.href)) {
        url = titleEl.href;
      } else if (titleEl?.closest?.("a")?.href) {
        url = titleEl.closest("a").href;
      } else {
        const anyJobLink =
          root.querySelector("a[href*='/jobs/view/']") ||
          root.querySelector("a[href*='currentJobId=']");
        url = anyJobLink?.href || "";
      }

      let jobId = extractJobIdFromCard(root, url);
      if (!url && jobId) {
        url = `https://www.linkedin.com/jobs/view/${jobId}/`;
      }
      if (!jobId && url) {
        jobId = extractJobIdFromCard(root, url);
      }

      // Need at least a job id or url to process later
      if (!url && !jobId) continue;

      const dedupeKey = jobId || url || title;
      if (seenIds.has(dedupeKey)) continue;
      seenIds.add(dedupeKey);

      jobs.push({
        title,
        company: (companyEl?.textContent || "").replace(/\s+/g, " ").trim(),
        location: (locationEl?.textContent || "").replace(/\s+/g, " ").trim(),
        // true | false | null (unknown). Background never gates eligibility on this alone.
        easyApply: easyApplyFlag,
        applied: alreadyApplied,
        url,
        jobId: String(jobId || ""),
      });
    }

    // LinkedIn periodically redesigns the results page (e.g. the "AI job search"
    // rollout) and renames the card wrapper classes above out from under us. The
    // /jobs/view/{id} link pattern is far more stable than any CSS class, so when
    // the card-based pass finds nothing, fall back to scanning those links directly
    // instead of reporting a false "no jobs" failure.
    if (jobs.length === 0) {
      return scrapeJobListingsFallback();
    }

    return jobs;
  }

  function scrapeJobListingsFallback() {
    const anchors = document.querySelectorAll("a[href*='/jobs/view/'], a[href*='currentJobId=']");
    const jobs = [];
    const seenIds = new Set();

    for (const a of anchors) {
      const href = a.href || a.getAttribute("href") || "";
      const jobId = href.match(/\/jobs\/view\/(\d+)/)?.[1] || href.match(/currentJobId=(\d+)/)?.[1];
      if (!jobId || seenIds.has(jobId)) continue;

      const title = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!title) continue;

      const root =
        a.closest("li") || a.closest("[role='listitem']") || a.parentElement?.parentElement || a.parentElement || a;
      const lines = (root.innerText || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const otherLines = lines.filter((l) => l !== title);
      const cardText = (root.innerText || "").toLowerCase();

      seenIds.add(jobId);
      jobs.push({
        title,
        company: otherLines[0] || "",
        location: otherLines[1] || "",
        easyApply: detectCardEasyApply(root),
        applied: /\bapplied\b/.test(cardText) || cardText.includes("application submitted"),
        url: href.startsWith("http") ? href : `https://www.linkedin.com/jobs/view/${jobId}/`,
        jobId: String(jobId),
      });
    }

    return jobs;
  }

  // Distinguish a genuinely empty result set from a page we simply failed to parse,
  // so the background script knows whether to retry or trust the "0 jobs" result.
  function detectNoResultsState() {
    const text = (document.body?.innerText || "").toLowerCase();
    return (
      /no matching jobs found/.test(text) ||
      /no results found/.test(text) ||
      /we couldn.?t find any (jobs|matches)/.test(text) ||
      (/\bno jobs\b/.test(text) && /try (broadening|adjusting)/.test(text))
    );
  }

  function normalizeTextForMatch(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function detectQualificationStatus() {
    const candidates = [];
    const headingNodes = document.querySelectorAll(
      "h1, h2, h3, strong, [class*='text-heading'], [data-test-id*='qualification'], [class*='qualification']"
    );

    for (const node of headingNodes) {
      const text = normalizeTextForMatch(node.textContent || "");
      if (!text) continue;
      const lower = text.toLowerCase();
      if (lower.includes("your profile") || lower.includes("required qualification")) {
        candidates.push(text);
      }
    }

    const pageText = normalizeTextForMatch(document.body?.innerText || "");
    if (pageText && pageText.toLowerCase().includes("required qualification")) {
      candidates.push(pageText);
    }

    const checks = [
      {
        status: "missing_required",
        matched: false,
        regex: /your profile[^.!?\n]{0,140}missing[^.!?\n]{0,120}required qualifications?/i,
      },
      {
        status: "matches_several",
        matched: true,
        regex: /your profile[^.!?\n]{0,140}matches several[^.!?\n]{0,120}required qualifications?/i,
      },
      {
        status: "matches_all",
        matched: true,
        regex: /your profile[^.!?\n]{0,140}matches all[^.!?\n]{0,120}required qualifications?/i,
      },
      {
        status: "matches_some",
        matched: true,
        regex: /your profile[^.!?\n]{0,140}matches some[^.!?\n]{0,120}required qualifications?/i,
      },
      {
        status: "matches_required",
        matched: true,
        regex: /your profile[^.!?\n]{0,140}matches[^.!?\n]{0,120}required qualifications?/i,
      },
    ];

    for (const check of checks) {
      for (const candidate of candidates) {
        const found = candidate.match(check.regex);
        if (found) {
          return {
            status: check.status,
            matched: check.matched,
            text: normalizeTextForMatch(found[0]),
          };
        }
      }
    }

    return {
      status: "unknown",
      matched: false,
      text: "",
    };
  }

  async function detectQualificationStatusWithRetry(maxAttempts = 12, delayMs = 350) {
    let latest = detectQualificationStatus();

    for (let i = 0; i < maxAttempts; i++) {
      if (latest.status !== "unknown") {
        return latest;
      }
      await new Promise((r) => setTimeout(r, delayMs));
      latest = detectQualificationStatus();
    }

    return latest;
  }

  function normalizeJobUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
    } catch {
      return String(url || "").split("?")[0].replace(/\/+$/, "");
    }
  }

  async function selectJobFromList(jobId, jobUrl) {
    const cards = document.querySelectorAll(
      ".jobs-search-results__list-item, .job-card-container, .scaffold-layout__list-item, " +
      ".jobs-search-results-list__list-item, [data-occludable-job-id], li.jobs-search-results__list-item"
    );
    if (!cards.length) {
      return { selected: false, error: "No job cards found in results list" };
    }

    const normalizedTargetUrl = normalizeJobUrl(jobUrl || "");
    let selectedAnchor = null;

    for (const card of cards) {
      const anchor =
        card.querySelector("a[href*='/jobs/view/']") ||
        card.querySelector(".job-card-list__title, .job-card-container__link, .job-card-list__title--link")?.closest("a");
      if (!anchor) continue;

      const href = anchor.getAttribute("href") || anchor.href || "";
      const normalizedHref = normalizeJobUrl(href);

      if (jobId && href.includes(`/jobs/view/${jobId}`)) {
        selectedAnchor = anchor;
        break;
      }

      if (normalizedTargetUrl && normalizedHref && normalizedTargetUrl === normalizedHref) {
        selectedAnchor = anchor;
        break;
      }
    }

    if (!selectedAnchor && jobId) {
      const row = document.querySelector(`[data-occludable-job-id*='${CSS.escape(String(jobId))}']`);
      if (row) {
        selectedAnchor = row.querySelector("a[href*='/jobs/view/']");
      }
    }

    if (!selectedAnchor) {
      return {
        selected: false,
        error: `Could not locate job card in list for jobId=${jobId || "n/a"}`,
      };
    }

    const clickable =
      selectedAnchor.closest(".job-card-container, .jobs-search-results__list-item, li") ||
      selectedAnchor;

    if (clickable instanceof HTMLElement) {
      clickable.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Use human-like click
    await dispatchNativeClickAsync(selectedAnchor);
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(300, 600));
    if (clickable && clickable !== selectedAnchor) {
      dispatchNativeClick(clickable);
    }

    // Simulate reading the job card briefly
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(800, 2000));
    return {
      selected: true,
      href: selectedAnchor.getAttribute("href") || selectedAnchor.href || "",
    };
  }

  /**
   * Click the "Next" pagination button to go to the next page of job results.
   * Returns { clicked: boolean, hasNextPage: boolean, currentPage: number }
   */
  async function clickPaginationNext() {
    // LinkedIn pagination selectors for current active page
    const paginationSelectors = [
      'button[aria-current="true"]',
      'li.artdeco-pagination__indicator--number.active button',
      '.artdeco-pagination__indicator--number.selected button',
    ];

    const nextButtonSelectors = [
      'button[aria-label="View next page"]',
      'button[aria-label="Next"]',
      '.artdeco-pagination__button--next',
    ];

    let currentPage = 1;

    // Try to find current page number
    for (const sel of paginationSelectors) {
      const activeBtn = document.querySelector(sel);
      if (activeBtn) {
        const pageNum = parseInt(activeBtn.textContent?.trim() || "1", 10);
        if (!isNaN(pageNum)) {
          currentPage = pageNum;
          break;
        }
      }
    }

    console.log(`[WinPilot CS] clickPaginationNext: Current page appears to be ${currentPage}`);

    // Try to find and click the "Next" button
    for (const sel of nextButtonSelectors) {
      const nextBtn = document.querySelector(sel);
      if (nextBtn && !nextBtn.disabled && nextBtn.offsetParent !== null) {
        console.log(`[WinPilot CS] clickPaginationNext: Found next button with selector: ${sel}`);
        nextBtn.click();
        await new Promise((r) => setTimeout(r, 2000));
        return { clicked: true, hasNextPage: true, currentPage, nextPage: currentPage + 1 };
      }
    }

    // Alternative: try to find the next page number button directly
    const allPageBtns = document.querySelectorAll(
      '.artdeco-pagination__indicator--number button, ' +
      'li[data-test-pagination-page-btn] button'
    );

    for (const btn of allPageBtns) {
      const pageNum = parseInt(btn.textContent?.trim() || "0", 10);
      if (pageNum === currentPage + 1) {
        console.log(`[WinPilot CS] clickPaginationNext: Clicking page ${pageNum} button`);
        btn.click();
        await new Promise((r) => setTimeout(r, 2000));
        return { clicked: true, hasNextPage: true, currentPage, nextPage: pageNum };
      }
    }

    console.log(`[WinPilot CS] clickPaginationNext: No next page found`);
    return { clicked: false, hasNextPage: false, currentPage, nextPage: null };
  }

  function scrapeJobDetail() {
    // Click "Show more" to expand truncated description
    let showMoreBtn =
      document.querySelector("button[aria-label*='show more']") ||
      document.querySelector("button[aria-label*='Show more']") ||
      document.querySelector(".jobs-description__footer-button") ||
      document.querySelector(".show-more-less-html__button--more") ||
      null;
    // SDUI: look for a "...more" or "Show more" button inside the about-the-job section
    if (!showMoreBtn) {
      const aboutJob = document.querySelector("[componentkey^='JobDetails_AboutTheJob']");
      if (aboutJob) {
        for (const btn of aboutJob.querySelectorAll("button")) {
          const text = (btn.textContent || "").trim().toLowerCase();
          if (text.includes("more") || text.includes("show")) {
            showMoreBtn = btn;
            break;
          }
        }
      }
    }
    if (showMoreBtn) {
      showMoreBtn.click();
    }

    let title = "";
    let company = "";
    let location = "";
    let description = "";
    let salary = "";

    // --- Description extraction ---

    // Strategy 1: SDUI componentkey-based (new LinkedIn layout)
    const aboutJobEl = document.querySelector("[componentkey^='JobDetails_AboutTheJob']");
    if (aboutJobEl) {
      const expandable = aboutJobEl.querySelector("[data-testid='expandable-text-box']");
      if (expandable) {
        // Clone to remove hidden "…more" button text before extracting
        const clone = expandable.cloneNode(true);
        for (const btn of clone.querySelectorAll("[data-testid='expandable-text-button'], button[aria-hidden='true']")) {
          btn.remove();
        }
        description = clone.textContent?.trim() || clone.innerText?.trim() || "";
      }
      if (!description) {
        let text = aboutJobEl.textContent?.trim() || aboutJobEl.innerText?.trim() || "";
        if (text.startsWith("About the job")) {
          text = text.substring("About the job".length).trim();
        }
        // Remove trailing "…more" / "… more" from button text
        text = text.replace(/\u2026\s*more\s*$/i, "").trim();
        if (text.length > 50) {
          description = text;
        }
      }
    }

    // Strategy 2: data-testid expandable text box anywhere on page
    if (!description) {
      const expandable = document.querySelector("[data-testid='expandable-text-box']");
      if (expandable) {
        const clone = expandable.cloneNode(true);
        for (const btn of clone.querySelectorAll("[data-testid='expandable-text-button'], button[aria-hidden='true']")) {
          btn.remove();
        }
        description = clone.textContent?.trim() || clone.innerText?.trim() || "";
        description = description.replace(/\u2026\s*more\s*$/i, "").trim();
      }
    }

    // Strategy 3: Legacy selectors (pre-SDUI LinkedIn)
    if (!description) {
      const descriptionEl = document.querySelector(
        "#job-details, .jobs-description__content, .jobs-box__html-content, " +
        ".jobs-description-content, .show-more-less-html__markup, " +
        "[class*='jobs-description']"
      );
      if (descriptionEl) {
        description = descriptionEl.textContent?.trim() || descriptionEl.innerText?.trim() || "";
      }
    }

    // Strategy 4: "About the job" heading ancestor
    if (!description) {
      const headings = document.querySelectorAll("h2, h3");
      for (const heading of headings) {
        if (heading.textContent?.trim() === "About the job") {
          let container = heading.parentElement;
          for (let depth = 0; depth < 6 && container; depth++) {
            const text = container.textContent?.trim() || "";
            if (text.length > 200) {
              description = text;
              if (description.startsWith("About the job")) {
                description = description.substring("About the job".length).trim();
              }
              break;
            }
            container = container.parentElement;
          }
          break;
        }
      }
    }

    // Strategy 5: Largest text block heuristic
    if (!description) {
      let bestText = "";
      const candidates = document.querySelectorAll("p, article, [role='article']");
      for (const el of candidates) {
        const text = el.textContent?.trim() || "";
        if (text.length > bestText.length && text.length > 200) {
          const nav = el.closest("nav, header, footer, [role='navigation'], [role='banner']");
          if (!nav) bestText = text;
        }
      }
      if (bestText) description = bestText;
    }

    // --- Title extraction ---

    // Strategy 1: Legacy selectors
    const titleEl = document.querySelector(
      ".jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title, " +
      "h1[class*='job-title'], .jobs-unified-top-card h1, h1.t-24, " +
      ".top-card-layout__title"
    );
    title = titleEl?.textContent?.trim() || "";

    // Strategy 2: Find a prominent h1 in the job detail area
    if (!title) {
      for (const h1 of document.querySelectorAll("h1")) {
        const text = h1.textContent?.trim() || "";
        if (text.length > 3 && text.length < 200) {
          title = text;
          break;
        }
      }
    }

    // Strategy 3: Parse from page title
    if (!title) {
      const pageTitle = (document.title || "").replace(/^\(\d+\)\s*/, "");
      const parts = pageTitle.split(/[|\u2013\u2014]/).map((p) => p.trim());
      if (parts.length >= 2) title = parts[0];
    }

    // --- Company extraction ---

    // Strategy 1: Legacy selectors
    const companyEl = document.querySelector(
      ".jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name, " +
      ".jobs-unified-top-card__subtitle-primary-grouping a"
    );
    company = companyEl?.textContent?.trim() || "";

    // Strategy 2: SDUI — find a link to the company page
    if (!company) {
      for (const link of document.querySelectorAll('a[href*="/company/"]')) {
        const text = link.textContent?.trim() || "";
        if (text.length > 1 && text.length < 100) {
          company = text;
          break;
        }
      }
    }

    // Strategy 3: Parse from page title ("Title | Company | LinkedIn")
    if (!company) {
      const pageTitle = (document.title || "").replace(/^\(\d+\)\s*/, "");
      const parts = pageTitle.split(/[|\u2013\u2014]/).map((p) => p.trim());
      if (parts.length >= 3 && parts[parts.length - 1] === "LinkedIn") {
        company = parts[1] || "";
      }
    }

    // --- Location extraction ---
    const locationEl = document.querySelector(
      ".jobs-unified-top-card__bullet, .job-details-jobs-unified-top-card__bullet, " +
      ".jobs-unified-top-card__workplace-type"
    );
    location = locationEl?.textContent?.trim() || "";

    // --- Salary extraction ---
    const salaryEl = document.querySelector(
      ".jobs-unified-top-card__job-insight--highlight, .salary-main-rail__data-amount, " +
      "[class*='salary'], [class*='compensation']"
    );
    salary = salaryEl?.textContent?.trim() || "";

    const qualification = detectQualificationStatus();
    const isEasyApply = detectIsEasyApply();

    return {
      title,
      company,
      location,
      description,
      salary,
      url: window.location.href,
      qualificationStatus: qualification.status,
      qualificationMatched: qualification.matched,
      qualificationText: qualification.text,
      isEasyApply,
    };
  }

  // --- Phase 2: Easy Apply Helpers ---
  // User filters Easy Apply on LinkedIn; always attempt the apply button / modal flow.

  function getJobDetailRoot() {
    return (
      document.querySelector(".jobs-details") ||
      document.querySelector(".jobs-search__job-details") ||
      document.querySelector(".jobs-details__main-content") ||
      document.querySelector(".job-view-layout") ||
      document.querySelector(".scaffold-layout__detail") ||
      document.querySelector(".jobs-unified-top-card")?.closest(
        ".scaffold-layout__detail, .jobs-search__job-details, main, .jobs-details"
      ) ||
      document
    );
  }

  function findEasyApplyButton(root = getJobDetailRoot()) {
    if (!root) root = document;

    // Prefer explicit Easy Apply controls inside the detail pane
    const candidates = [
      root.querySelector("a[aria-label*='Easy Apply']"),
      root.querySelector("button[aria-label*='Easy Apply']"),
      root.querySelector("[aria-label='Easy Apply to this job']"),
      root.querySelector("[data-control-name*='easy_apply']"),
      root.querySelector("button.jobs-apply-button--top-card"),
      root.querySelector("a.jobs-apply-button--top-card"),
      root.querySelector("button.jobs-apply-button"),
      root.querySelector("a.jobs-apply-button"),
      root.querySelector(".jobs-apply-button"),
      root.querySelector("[data-control-name='jobdetails_topcard_inapply']"),
      root.querySelector(".jobs-s-apply button"),
      root.querySelector(".jobs-s-apply a"),
    ].filter(Boolean);

    for (const el of candidates) {
      if (el.offsetParent === null && el.getClientRects?.().length === 0) continue;
      return el;
    }

    // Text match within detail root, then document
    for (const scope of [root, document]) {
      for (const tag of ["button", "a"]) {
        const nodes = scope.querySelectorAll(tag);
        for (const el of nodes) {
          const t = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
          const aria = (el.getAttribute("aria-label") || "").toLowerCase();
          if (t.includes("easy apply") || aria.includes("easy apply")) return el;
        }
      }
    }

    // Last resort: any visible "Apply" in the detail top card (user guarantees Easy Apply filter)
    for (const tag of ["button", "a"]) {
      const nodes = root.querySelectorAll(tag);
      for (const el of nodes) {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (t === "apply" || t.startsWith("apply ")) return el;
      }
    }

    return null;
  }

  function detectIsEasyApply(root = getJobDetailRoot()) {
    // Always treat as Easy Apply when user filters LinkedIn results; still report button presence.
    return !!findEasyApplyButton(root);
  }

  async function clickEasyApply() {
    const root = getJobDetailRoot();
    const btn = findEasyApplyButton(root);

    if (!btn) {
      return { clicked: false, error: "Easy Apply button not found" };
    }

    await HumanBehavior.idleScroll();
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(500, 1500));

    const href = btn.tagName === "A" ? (btn.href || btn.getAttribute("href") || "") : "";
    const isLink = btn.tagName === "A" && href && href.includes("/apply/");

    if (isLink) {
      const urlBefore = window.location.href;
      const targetUrl = href;
      await dispatchNativeClickAsync(btn);

      setTimeout(() => {
        if (window.location.href === urlBefore && targetUrl) {
          window.location.href = targetUrl;
        }
      }, 200);

      return { clicked: true, sdui: true };
    }

    await dispatchNativeClickAsync(btn);

    try {
      await waitForElement(
        ".jobs-easy-apply-modal, [class*='jobs-easy-apply'], [data-test-modal], .artdeco-modal",
        5000
      );
    } catch (e) {
      // Modal might already be open or take longer
    }
    await new Promise((r) => setTimeout(r, 1000));
    return { clicked: true, sdui: false };
  }

  function getFormFields() {
    const modal =
      document.querySelector(".jobs-easy-apply-modal") ||
      document.querySelector("[data-test-modal]") ||
      document.querySelector(".artdeco-modal") ||
      document.querySelector("[class*='jobs-easy-apply']") ||
      (window.location.href.includes("/apply/") ? document.body : null);

    if (!modal) return [];

    const fields = [];

    function cleanLabelText(text) {
      return (text || "")
        .replace(/\s+/g, " ")
        .replace(/\*$/, "")
        .trim();
    }

    function extractMaxLength(input) {
      if (input.maxLength && input.maxLength > 0 && input.maxLength < 100000) {
        return input.maxLength;
      }
      const describedBy = input.getAttribute("aria-describedby");
      if (describedBy) {
        for (const id of describedBy.split(/\s+/)) {
          const helper = document.getElementById(id);
          const helperText = helper?.textContent || "";
          // LinkedIn helper: "0/20" or "0 of 20 characters"
          const m = helperText.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i);
          if (m) return Number(m[2]);
        }
      }
      const parent = input.closest("div");
      const nearby = parent?.parentElement?.textContent || "";
      const nearbyMatch = nearby.match(/(\d+)\s*(?:\/|of)\s*(\d+)\s*character/i) || nearby.match(/\b0\/(\d+)\b/);
      if (nearbyMatch) {
        return Number(nearbyMatch[2] || nearbyMatch[1]);
      }
      return undefined;
    }

    function findQuestionLabelNear(el) {
      // Classic LinkedIn form label
      const classic =
        el.closest(".fb-dash-form-element")?.querySelector("label, .fb-dash-form-element__label")?.textContent ||
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        "";
      if (classic && classic.trim()) return cleanLabelText(classic);

      // SDUI / new Easy Apply: question text is often a preceding <p>
      let node = el.parentElement;
      for (let depth = 0; depth < 6 && node; depth++) {
        let prev = node.previousElementSibling;
        while (prev) {
          if (prev.tagName === "P" || prev.getAttribute("role") === "heading") {
            const t = cleanLabelText(prev.textContent);
            if (t && t.length > 2 && t.length < 300) return t;
          }
          // Sometimes question is nested inside previous sibling
          const nestedP = prev.querySelector?.("p, legend, label, [role='heading']");
          if (nestedP) {
            const t = cleanLabelText(nestedP.textContent);
            if (t && t.length > 2 && t.length < 300) return t;
          }
          prev = prev.previousElementSibling;
        }
        node = node.parentElement;
      }
      return cleanLabelText(el.getAttribute("aria-label") || "");
    }

    function radioOptionLabel(radio) {
      // Classic: label[for=id] or wrapping label
      if (radio.id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
        if (forLabel) {
          const t = cleanLabelText(forLabel.textContent);
          if (t) return t;
        }
      }
      const wrap = radio.closest("label");
      if (wrap) {
        const t = cleanLabelText(wrap.textContent);
        if (t) return t;
      }

      // LinkedIn SDUI: role="radio" container with sibling <p>Yes</p>
      const roleRadio = radio.closest("[role='radio']");
      if (roleRadio) {
        const p = roleRadio.querySelector("p");
        if (p) {
          const t = cleanLabelText(p.textContent);
          if (t) return t;
        }
        const t = cleanLabelText(roleRadio.textContent);
        // Strip empty/placeholder chars
        if (t) return t;
      }

      return cleanLabelText(radio.nextElementSibling?.textContent || radio.value || "");
    }

    // Text inputs
    const inputs = modal.querySelectorAll("input[type='text'], input[type='number'], input[type='tel'], input[type='email'], input[type='url']");
    for (const input of inputs) {
      // Skip radio-like hidden helpers
      if (input.offsetParent === null && !input.required) continue;
      const label = findQuestionLabelNear(input);
      const maxLength = extractMaxLength(input);
      fields.push({
        type: "text",
        inputType: input.type || "text",
        label,
        value: input.value,
        selector: buildSelector(input),
        required: input.required || input.getAttribute("aria-required") === "true" || /\*$/.test(label + (input.getAttribute("aria-label") || "")),
        maxLength,
      });
    }

    // Textareas
    const textareas = modal.querySelectorAll("textarea");
    for (const ta of textareas) {
      const label = findQuestionLabelNear(ta);
      const maxLength = extractMaxLength(ta);
      fields.push({
        type: "textarea",
        label,
        value: ta.value,
        selector: buildSelector(ta),
        required: ta.required || ta.getAttribute("aria-required") === "true",
        maxLength,
      });
    }

    // Selects (dropdowns)
    const selects = modal.querySelectorAll("select");
    for (const sel of selects) {
      const label = findQuestionLabelNear(sel);
      const options = Array.from(sel.options).map((o) => ({
        value: o.value,
        text: o.textContent?.trim() || "",
        label: o.textContent?.trim() || "",
      }));
      fields.push({
        type: "select",
        label,
        value: sel.value,
        options,
        selector: buildSelector(sel),
        required: sel.required || sel.getAttribute("aria-required") === "true",
      });
    }

    // Custom dropdowns/comboboxes (LinkedIn's typeahead selects)
    const customDropdowns = modal.querySelectorAll("[role='combobox'], [data-test-text-selectable-option], button[aria-haspopup='listbox']");
    for (const control of customDropdowns) {
      if (!(control instanceof HTMLElement)) continue;
      if (control.tagName.toLowerCase() === "select") continue; // Skip native selects
      if (control.tagName.toLowerCase() === "input" && (control.type === "text" || control.type === "search")) continue; // Skip text inputs with combobox role (they're typeaheads, handled by text)
      if (control.getAttribute("aria-disabled") === "true") continue;
      if (control.offsetParent === null) continue;

      const label = findQuestionLabelNear(control);
      const currentText = (control.textContent || "").trim();
      const isPlaceholder = /select|choose|please|pick|--|option/i.test(currentText);

      fields.push({
        type: "custom-dropdown",
        label,
        value: isPlaceholder ? "" : currentText,
        selector: buildSelector(control),
        required: control.getAttribute("aria-required") === "true" ||
          control.closest("[data-required='true']") !== null,
      });
    }

    // Radio buttons (classic fieldset + SDUI role=radiogroup)
    const radioGroups = modal.querySelectorAll("fieldset, [role='radiogroup']");
    for (const group of radioGroups) {
      let legend =
        group.querySelector("legend, .fb-dash-form-element__label")?.textContent?.trim() || "";
      if (!legend) {
        // SDUI: question text is a sibling <p> before the fieldset/radiogroup
        const prev = group.previousElementSibling;
        if (prev && (prev.tagName === "P" || prev.querySelector?.("p"))) {
          legend = (prev.tagName === "P" ? prev.textContent : prev.querySelector("p")?.textContent) || "";
        }
        if (!legend) {
          const parent = group.parentElement;
          const parentP = parent?.querySelector(":scope > p");
          legend = parentP?.textContent || "";
        }
        // aria-labelledby
        const labelledBy = group.getAttribute("aria-labelledby");
        if (!legend && labelledBy) {
          legend = document.getElementById(labelledBy)?.textContent || "";
        }
      }
      legend = cleanLabelText(legend);

      const radios = group.querySelectorAll("input[type='radio']");
      const options = Array.from(radios).map((r) => {
        const optLabel = radioOptionLabel(r);
        return {
          value: r.value || optLabel,
          label: optLabel,
          text: optLabel,
          selector: buildSelector(r),
        };
      });
      if (options.length > 0) {
        const checked = group.querySelector("input[type='radio']:checked");
        const checkedLabel = checked ? radioOptionLabel(checked) : "";
        // Question with * in surrounding text is required; SDUI often omits required attrs
        const rawTitle =
          group.previousElementSibling?.textContent ||
          group.parentElement?.querySelector(":scope > p")?.textContent ||
          legend;
        const titleHasRequired = /\*/.test(rawTitle || "");
        fields.push({
          type: "radio",
          label: legend,
          options,
          value: checked?.value || checkedLabel || "",
          required:
            group.querySelector("input[type='radio'][required]") !== null ||
            group.getAttribute("aria-required") === "true" ||
            titleHasRequired ||
            // Additional Questions screening groups always need an answer to proceed
            !!(legend && options.length >= 2),
        });
      }
    }

    // Checkboxes
    const checkboxes = modal.querySelectorAll("input[type='checkbox']");
    for (const cb of checkboxes) {
      const label =
        cleanLabelText(
          cb.closest("label")?.textContent ||
          cb.closest(".fb-dash-form-element")?.querySelector("label")?.textContent ||
          cb.getAttribute("aria-label") ||
          "Consent checkbox"
        );
      fields.push({
        type: "checkbox",
        label,
        value: cb.checked ? "true" : "",
        selector: buildSelector(cb),
        required: cb.required || cb.getAttribute("aria-required") === "true",
      });
    }

    // File inputs
    const fileInputs = modal.querySelectorAll("input[type='file']");
    for (const fi of fileInputs) {
      const label = findQuestionLabelNear(fi) || "Resume/CV Upload";
      fields.push({
        type: "file",
        label,
        selector: buildSelector(fi),
      });
    }

    return fields;
  }

  function buildSelector(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    if (element.name) return `[name="${CSS.escape(element.name)}"]`;
    // Build a path selector
    const path = [];
    let current = element;
    while (current && current !== document.body) {
      let sel = current.tagName.toLowerCase();
      if (current.id) {
        sel = `#${CSS.escape(current.id)}`;
        path.unshift(sel);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          sel += `:nth-of-type(${idx})`;
        }
      }
      path.unshift(sel);
      current = parent;
    }
    return path.join(" > ");
  }

  function findContinueApplyingControl(root = document) {
    const container = root || document;
    const directSelector =
      "a[href*='/apply/'][href*='openSDUIApplyFlow=true'], button[aria-label*='Continue applying'], a[aria-label*='Continue applying']";
    const direct = container.querySelector(directSelector);
    if (direct) return direct;

    const candidates = container.querySelectorAll("a, button");
    for (const el of candidates) {
      const text = (el.textContent || "").trim().toLowerCase();
      if (!text) continue;
      if (text.includes("continue applying")) return el;
    }

    return null;
  }

  function isSafetyInterstitialVisible(root = document) {
    const container = root || document;
    const bodyText = (container.textContent || "").toLowerCase();
    return (
      bodyText.includes("job search safety reminder") ||
      bodyText.includes("report suspicious jobs") ||
      bodyText.includes("review job post")
    );
  }

  function isPlaceholderSelectOption(option) {
    if (!option) return true;
    const value = (option.value || "").toString().trim().toLowerCase();
    const text = (option.textContent || "").toString().trim().toLowerCase();
    const joined = `${value} ${text}`;
    return /select|choose|please|option|pick one|--/.test(joined);
  }

  function pickFirstValidSelectOption(options) {
    const list = Array.from(options || []);
    // Always prefer "Yes" option — answering Yes keeps doors open
    const yesOption = list.find((o) => {
      if (o.disabled) return false;
      const val = (o.value || "").toString().trim().toLowerCase();
      const txt = (o.textContent || "").toString().trim().toLowerCase();
      return val === "yes" || txt === "yes";
    });
    if (yesOption) return yesOption;
    const valid = list.find((o) => !o.disabled && !isPlaceholderSelectOption(o));
    return valid || list.find((o) => !o.disabled) || list[0] || null;
  }

  async function fillFormField(fieldIndex, value, fieldType, selector) {
    const modal =
      document.querySelector(".jobs-easy-apply-modal") ||
      document.querySelector("[data-test-modal]") ||
      document.querySelector(".artdeco-modal") ||
      document.querySelector("[class*='jobs-easy-apply']") ||
      (window.location.href.includes("/apply/") ? document.body : null);
    if (!modal) throw new Error("Application modal not found");

    const resolveFromSelector = () => {
      if (!selector || typeof selector !== "string") return null;
      try {
        return modal.querySelector(selector);
      } catch {
        return null;
      }
    };

    if (fieldType === "select") {
      const bySelector = resolveFromSelector();
      const selects = modal.querySelectorAll("select");
      const sel = bySelector || selects[fieldIndex];
      if (sel) {
        // Prefer "Yes" from available options unless a specific value is given
        const bestOption = pickFirstValidSelectOption(sel.options);
        let selectedValue = value;
        if (!selectedValue || isPlaceholderSelectOption({ value: selectedValue, textContent: selectedValue })) {
          selectedValue = bestOption?.value || "";
        } else {
          // Check if the given value matches any option; if not, prefer Yes/first valid
          const matchingOpt = Array.from(sel.options).find(
            (o) => o.value.toLowerCase() === selectedValue.toLowerCase() || (o.textContent || "").trim().toLowerCase() === selectedValue.toLowerCase()
          );
          if (!matchingOpt) {
            selectedValue = bestOption?.value || "";
          } else {
            selectedValue = matchingOpt.value;
          }
        }

        // Human-like: focus first, pause, then change
        sel.focus();
        sel.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
        await HumanBehavior.sleep(HumanBehavior.clampedGaussian(80, 200));

        // Use native setter for React/LinkedIn controlled inputs
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(sel, selectedValue);
        } else {
          sel.value = selectedValue;
        }
        if (sel.value !== selectedValue) {
          const targetIdx = Array.from(sel.options || []).findIndex((o) => o.value === selectedValue);
          if (targetIdx >= 0) sel.selectedIndex = targetIdx;
        }

        sel.dispatchEvent(new Event("input", { bubbles: true }));
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        sel.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        await HumanBehavior.sleep(HumanBehavior.clampedGaussian(100, 300));
      }
    } else if (fieldType === "radio") {
      const bySelector = resolveFromSelector();
      if (bySelector) {
        // Prefer clicking the visible role=radio container or the input
        const clickTarget =
          bySelector.closest?.("[role='radio']") ||
          bySelector.closest?.("label") ||
          bySelector;
        dispatchNativeClick(clickTarget);
        if (bySelector instanceof HTMLInputElement && !bySelector.checked) {
          dispatchNativeClick(bySelector);
        }
        return;
      }

      // Match radio by value or visible option label (LinkedIn often uses empty value attrs)
      const target = String(value || "").trim().toLowerCase();
      const allRadios = modal.querySelectorAll("input[type='radio']");
      let matched = null;
      for (const r of allRadios) {
        const val = (r.value || "").toString().trim().toLowerCase();
        if (val && val === target) {
          matched = r;
          break;
        }
        const roleRadio = r.closest("[role='radio']");
        const labelText = (
          roleRadio?.querySelector("p")?.textContent ||
          r.closest("label")?.textContent ||
          (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.textContent : "") ||
          r.nextElementSibling?.textContent ||
          ""
        )
          .toString()
          .trim()
          .toLowerCase();
        if (labelText === target || labelText.includes(target) || target.includes(labelText)) {
          matched = r;
          break;
        }
      }
      if (matched) {
        const clickTarget = matched.closest("[role='radio']") || matched.closest("label") || matched;
        dispatchNativeClick(clickTarget);
        if (!matched.checked) dispatchNativeClick(matched);
      }
    } else if (fieldType === "checkbox") {
      const bySelector = resolveFromSelector();
      const checkboxes = modal.querySelectorAll("input[type='checkbox']");
      const cb = bySelector || checkboxes[fieldIndex];
      if (cb) {
        const shouldCheck = String(value).toLowerCase() !== "false";
        if (shouldCheck && !cb.checked) {
          dispatchNativeClick(cb);
        }
      }
    } else if (fieldType === "custom-dropdown") {
      // Handle LinkedIn's custom dropdown/combobox controls
      const control = resolveFromSelector();
      if (control) {
        // Click to open the dropdown
        if (typeof HumanBehavior.humanClick === "function") {
          await HumanBehavior.humanClick(control);
        } else {
          dispatchNativeClick(control);
        }

        // Wait for dropdown to render with retry
        let optionsList = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          await HumanBehavior.sleep(200 + attempt * 150);
          optionsList = document.querySelectorAll([
            "[role='listbox'] [role='option']:not([aria-disabled='true'])",
            "li[role='option']:not([aria-disabled='true'])",
            ".artdeco-dropdown__content li",
            "[role='listbox'] li",
            ".artdeco-typeahead__results-list li",
            "ul[role='listbox'] > li",
          ].join(", "));
          if (optionsList && optionsList.length > 0) break;
        }

        if (optionsList && optionsList.length > 0) {
          // Find matching option by value, or prefer "Yes", or pick first valid
          let targetOpt = null;

          if (value) {
            for (const opt of optionsList) {
              if (!(opt instanceof HTMLElement) || opt.offsetParent === null) continue;
              const optText = (opt.textContent || "").trim().toLowerCase();
              if (optText === value.toLowerCase()) { targetOpt = opt; break; }
            }
          }

          if (!targetOpt) {
            // Prefer "Yes"
            for (const opt of optionsList) {
              if (!(opt instanceof HTMLElement) || opt.offsetParent === null) continue;
              const optText = (opt.textContent || "").trim().toLowerCase();
              if (optText === "yes") { targetOpt = opt; break; }
            }
          }

          if (!targetOpt) {
            // Pick first visible valid option
            for (const opt of optionsList) {
              if (!(opt instanceof HTMLElement) || opt.offsetParent === null) continue;
              const optText = (opt.textContent || "").trim().toLowerCase();
              if (optText && !/select|choose|please|pick|--|option/.test(optText)) {
                targetOpt = opt;
                break;
              }
            }
          }

          if (targetOpt) {
            targetOpt.scrollIntoView({ block: "nearest", behavior: "smooth" });
            await HumanBehavior.sleep(HumanBehavior.clampedGaussian(100, 250));
            if (typeof HumanBehavior.humanClick === "function") {
              await HumanBehavior.humanClick(targetOpt);
            } else {
              dispatchNativeClick(targetOpt);
            }
          }
        } else {
          // Close dropdown if nothing found
          control.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        }

        await HumanBehavior.sleep(HumanBehavior.clampedGaussian(200, 400));
      }
    } else {
      // Text input or textarea
      const bySelector = resolveFromSelector();
      const inputs = modal.querySelectorAll("input[type='text'], input[type='number'], input[type='tel'], input[type='email'], input[type='url'], textarea");
      const input = bySelector || inputs[fieldIndex];
      if (input) {
        dispatchNativeInput(input, value);
      }
    }
  }

  async function autoSelectDropdowns() {
    const modal =
      document.querySelector(".jobs-easy-apply-modal") ||
      document.querySelector("[data-test-modal]") ||
      document.querySelector(".artdeco-modal") ||
      document.querySelector("[class*='jobs-easy-apply']") ||
      (window.location.href.includes("/apply/") ? document.body : null);
    if (!modal) return { selectedCount: 0 };

    let selectedCount = 0;

    // --- Native <select> elements ---
    const selects = modal.querySelectorAll("select");
    for (const sel of selects) {
      if (sel.disabled) continue;
      const options = Array.from(sel.options || []);
      if (options.length === 0) continue;

      const bestOption = pickFirstValidSelectOption(sel.options);
      if (!bestOption) continue;

      const current = (sel.value || "").trim();
      const currentOption = options.find((o) => o.value === current);
      // Skip if already has a valid non-placeholder value that isn't our preferred "Yes"
      // BUT if our best option is "Yes" and current is NOT "Yes", switch to "Yes"
      const bestIsYes = (bestOption.value || "").toLowerCase() === "yes" || (bestOption.textContent || "").trim().toLowerCase() === "yes";
      if (current && currentOption && !isPlaceholderSelectOption(currentOption)) {
        // If "Yes" is available and we don't already have it, switch to it
        if (!bestIsYes || current === bestOption.value) {
          continue;
        }
      }

      // Use human-like interaction: focus, wait, then change
      sel.focus();
      sel.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      await HumanBehavior.sleep(HumanBehavior.clampedGaussian(100, 300));

      sel.value = bestOption.value;
      if (sel.value !== bestOption.value) {
        sel.selectedIndex = options.indexOf(bestOption);
      }
      // Fire the full event sequence that LinkedIn/React listens for
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      sel.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

      // Also set via nativeInputValueSetter for React-controlled selects
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(sel, bestOption.value);
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }

      selectedCount++;
      await HumanBehavior.sleep(HumanBehavior.clampedGaussian(200, 500));
    }

    // --- Custom dropdown/combobox controls (LinkedIn uses these heavily) ---
    const customSelectors = [
      "[role='combobox']",
      "button[aria-haspopup='listbox']",
      "[data-test-text-selectable-option]",
      ".artdeco-dropdown__trigger",
      "button[aria-haspopup='true']",
      ".fb-dash-form-element select",
    ];
    const customControls = modal.querySelectorAll(customSelectors.join(", "));

    for (const control of customControls) {
      if (!(control instanceof HTMLElement)) continue;
      if (control.getAttribute("aria-disabled") === "true") continue;
      if (control.offsetParent === null) continue;
      // Skip if it's a native <select> (already handled above)
      if (control.tagName.toLowerCase() === "select") continue;

      const controlText = (control.textContent || "").trim().toLowerCase();
      // Skip if already has a meaningful selected value (unless it's a placeholder)
      if (controlText && !/select|choose|please|pick|--|option/.test(controlText)) {
        continue;
      }

      // Human-like: hover then click the dropdown trigger
      if (typeof HumanBehavior.humanClick === "function") {
        await HumanBehavior.humanClick(control);
      } else {
        dispatchNativeClick(control);
      }

      // Wait for dropdown to open with retry — LinkedIn dropdowns can be slow
      let optionsList = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        await HumanBehavior.sleep(200 + attempt * 150);
        // Try multiple selectors for the dropdown options
        optionsList = document.querySelectorAll([
          "[role='listbox'] [role='option']:not([aria-disabled='true'])",
          "li[role='option']:not([aria-disabled='true'])",
          ".artdeco-dropdown__content li",
          "[role='listbox'] li",
          ".artdeco-typeahead__results-list li",
          "ul[role='listbox'] > li",
          ".ember-power-select-options li",
        ].join(", "));
        if (optionsList && optionsList.length > 0) break;
      }

      if (!optionsList || optionsList.length === 0) {
        // Close by pressing Escape and move on
        control.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await HumanBehavior.sleep(150);
        continue;
      }

      // Find "Yes" option first, otherwise pick first visible valid option
      let picked = false;
      let yesOpt = null;
      let firstValidOpt = null;

      for (const opt of optionsList) {
        if (!(opt instanceof HTMLElement)) continue;
        if (opt.offsetParent === null) continue;
        const optText = (opt.textContent || "").trim().toLowerCase();
        if (optText === "yes" && !yesOpt) yesOpt = opt;
        if (!firstValidOpt && optText && !/select|choose|please|pick|--|option/.test(optText)) {
          firstValidOpt = opt;
        }
      }

      const targetOpt = yesOpt || firstValidOpt;
      if (targetOpt) {
        // Scroll the option into view if needed
        targetOpt.scrollIntoView({ block: "nearest", behavior: "smooth" });
        await HumanBehavior.sleep(HumanBehavior.clampedGaussian(100, 250));

        if (typeof HumanBehavior.humanClick === "function") {
          await HumanBehavior.humanClick(targetOpt);
        } else {
          dispatchNativeClick(targetOpt);
        }
        selectedCount++;
        picked = true;
      }

      if (!picked) {
        // Nothing valid found, close the dropdown
        control.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }

      await HumanBehavior.sleep(HumanBehavior.clampedGaussian(300, 600));
    }

    return { selectedCount };
  }

  async function clickNextOrSubmit() {
    const modal =
      document.querySelector(".jobs-easy-apply-modal") ||
      document.querySelector("[data-test-modal]") ||
      document.querySelector(".artdeco-modal") ||
      document.querySelector("[class*='jobs-easy-apply']") ||
      (window.location.href.includes("/apply/") ? document.body : null);
    if (!modal) {
      const continueControl = findContinueApplyingControl(document);
      if (continueControl) {
        const href = continueControl.tagName === "A" ? continueControl.getAttribute("href") || "" : "";
        dispatchNativeClick(continueControl);
        await new Promise((r) => setTimeout(r, 1300));
        return {
          action: "continue_applying",
          interstitial: true,
          href,
          safety: isSafetyInterstitialVisible(document),
        };
      }

      return { action: "none", error: "Modal not found" };
    }

    // Look for Submit button first
    const submitBtn =
      getElementByText("button", "Submit application") ||
      modal.querySelector("[aria-label='Submit application']");
    if (submitBtn) {
      if (submitBtn.disabled || submitBtn.getAttribute("aria-disabled") === "true") {
        return { action: "blocked", error: "Submit button is disabled" };
      }
      dispatchNativeClick(submitBtn);

      // Monitor for validation errors after submit click (AI Fallback)
      if (window.AIFallback && window.AIFallback.isEnabled()) {
        window.AIFallback.monitorForValidationErrors(async (errors) => {
          await window.AIFallback.handleValidationErrorsWithAI(errors, async () => {
            // Retry submit after AI corrections
            const retrySubmitBtn =
              getElementByText("button", "Submit application") ||
              modal.querySelector("[aria-label='Submit application']");
            if (retrySubmitBtn && !retrySubmitBtn.disabled) {
              dispatchNativeClick(retrySubmitBtn);
            }
          });
        });
      }

      await new Promise((r) => setTimeout(r, 2000));
      return { action: "submitted" };
    }

    // Look for Review button
    const reviewBtn = getElementByText("button", "Review");
    if (reviewBtn) {
      if (reviewBtn.disabled || reviewBtn.getAttribute("aria-disabled") === "true") {
        return { action: "blocked", error: "Review button is disabled" };
      }
      dispatchNativeClick(reviewBtn);

      // Monitor for validation errors after review click (AI Fallback)
      if (window.AIFallback && window.AIFallback.isEnabled()) {
        window.AIFallback.monitorForValidationErrors(async (errors) => {
          await window.AIFallback.handleValidationErrorsWithAI(errors, async () => {
            // Retry review after AI corrections
            const retryReviewBtn = getElementByText("button", "Review");
            if (retryReviewBtn && !retryReviewBtn.disabled) {
              dispatchNativeClick(retryReviewBtn);
            }
          });
        });
      }

      await new Promise((r) => setTimeout(r, 1000));
      return { action: "review" };
    }

    // Look for Next button
    const nextBtn =
      getElementByText("button", "Next") ||
      modal.querySelector("[aria-label='Continue to next step']");
    if (nextBtn) {
      if (nextBtn.disabled || nextBtn.getAttribute("aria-disabled") === "true") {
        return { action: "blocked", error: "Next button is disabled" };
      }
      dispatchNativeClick(nextBtn);

      // Monitor for validation errors after next click (AI Fallback)
      if (window.AIFallback && window.AIFallback.isEnabled()) {
        window.AIFallback.monitorForValidationErrors(async (errors) => {
          await window.AIFallback.handleValidationErrorsWithAI(errors, async () => {
            // Retry next after AI corrections
            const retryNextBtn =
              getElementByText("button", "Next") ||
              modal.querySelector("[aria-label='Continue to next step']");
            if (retryNextBtn && !retryNextBtn.disabled) {
              dispatchNativeClick(retryNextBtn);
            }
          });
        });
      }

      await new Promise((r) => setTimeout(r, 1000));
      return { action: "next" };
    }

    const continueControl = findContinueApplyingControl(modal) || findContinueApplyingControl(document);
    if (continueControl) {
      const href = continueControl.tagName === "A" ? continueControl.getAttribute("href") || "" : "";
      dispatchNativeClick(continueControl);
      await new Promise((r) => setTimeout(r, 1300));
      return {
        action: "continue_applying",
        interstitial: true,
        href,
        safety: isSafetyInterstitialVisible(document),
      };
    }

    return { action: "none", error: "No next/submit button found" };
  }

  async function uploadResume(fileDataB64, fileName) {
    const modal =
      document.querySelector(".jobs-easy-apply-modal") ||
      document.querySelector("[data-test-modal]") ||
      document.querySelector(".artdeco-modal") ||
      document.querySelector("[class*='jobs-easy-apply']") ||
      (window.location.href.includes("/apply/") ? document.body : null);
    if (!modal) return { uploaded: false, error: "Modal not found" };

    const fileInputs = Array.from(modal.querySelectorAll("input[type='file']"));
    if (fileInputs.length === 0) return { uploaded: false, error: "File input not found" };

    const findResumeInput = () => {
      for (const input of fileInputs) {
        const hint = [
          input.id || "",
          input.name || "",
          input.getAttribute("aria-label") || "",
          input.closest("label")?.textContent || "",
          input.closest(".jobs-document-upload__upload-button")?.textContent || "",
          input.closest(".js-jobs-document-upload__container")?.textContent || "",
        ]
          .join(" ")
          .toLowerCase();

        if (hint.includes("resume") || hint.includes("cv")) {
          return input;
        }
      }
      return fileInputs[0];
    };

    const fileInput = findResumeInput();
    if (!fileInput) return { uploaded: false, error: "File input not found" };

    // Convert base64 to File
    const byteChars = atob(fileDataB64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArr[i] = byteChars.charCodeAt(i);
    }
    const file = new File([byteArr], fileName || "resume.pdf", {
      type: "application/pdf",
    });

    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 2000));
    return { uploaded: true, fileName: file.name };
  }

  // --- Phase 4: Post-Application Outreach (Auto Messaging) ---
  // Everything below drives LinkedIn's messaging UI: the hiring-team card on a
  // job post, a company page's "Message" action (which asks for a topic first),
  // and a connection's profile. Each helper reports what it found so the
  // service worker can fall through to the next channel instead of guessing.

  const MSG_EDITOR_SELECTORS = [
    ".msg-form__contenteditable",
    ".msg-overlay-conversation-bubble div[contenteditable='true']",
    "div[role='textbox'][contenteditable='true'][aria-label*='message' i]",
    "div[role='textbox'][contenteditable='true'][aria-label*='Message' i]",
    "[role='dialog'] div[role='textbox'][contenteditable='true']",
    "[role='dialog'] textarea",
    ".org-page-message-modal textarea",
    "textarea[name='message']",
  ];

  const MSG_SEND_SELECTORS = [
    ".msg-form__send-button",
    "button.msg-form__send-btn",
    ".msg-form__right-actions button[type='submit']",
    ".artdeco-modal__actionbar button.artdeco-button--primary",
    "[role='dialog'] button[type='submit']",
  ];

  const TOPIC_CONTROL_WORDS = [
    "cancel",
    "close",
    "send",
    "next",
    "back",
    "continue",
    "dismiss",
    "skip",
    "done",
    "discard",
  ];

  function isVisible(el) {
    if (!el) return false;
    if (el.getAttribute?.("aria-hidden") === "true") return false;
    return el.offsetParent !== null || (el.getClientRects?.().length || 0) > 0;
  }

  /** A control we may actually click. LinkedIn disables Send until the form validates. */
  function isEnabled(el) {
    if (!el) return false;
    if (el.disabled) return false;
    if (el.getAttribute?.("aria-disabled") === "true") return false;
    if (el.classList?.contains("artdeco-button--disabled")) return false;
    return true;
  }

  function normalizeLabel(el) {
    return `${el.getAttribute?.("aria-label") || ""} ${el.textContent || ""}`
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function findVisibleBySelectors(selectors, root = document) {
    for (const selector of selectors) {
      for (const el of root.querySelectorAll(selector)) {
        if (isVisible(el)) return el;
      }
    }
    return null;
  }

  function findClickableByLabel(root, matches, { requireEnabled = true } = {}) {
    const nodes = root.querySelectorAll("button, a, [role='button']");
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      if (requireEnabled && !isEnabled(el)) continue;
      if (matches(normalizeLabel(el))) return el;
    }
    return null;
  }

  /** "Message" / "Message Jane Doe" — but never the left-nav "Messaging" entry. */
  function isMessageActionLabel(label) {
    if (!label) return false;
    if (label.includes("messaging")) return false;
    if (label.includes("message request")) return false;
    if (label.includes("unread")) return false;
    return /^message\b/.test(label) && label.length < 60;
  }

  function findMessageButton(root = document) {
    return findClickableByLabel(root, isMessageActionLabel);
  }

  /** The topmost open modal/dialog, which is where LinkedIn puts message flows. */
  function getOpenDialog() {
    const dialogs = Array.from(
      document.querySelectorAll("[role='dialog'], .artdeco-modal, .org-page-message-modal")
    ).filter(isVisible);
    return dialogs.length ? dialogs[dialogs.length - 1] : null;
  }

  function getMessageComposer() {
    const dialog = getOpenDialog();
    const editor =
      (dialog && findVisibleBySelectors(MSG_EDITOR_SELECTORS, dialog)) ||
      findVisibleBySelectors(MSG_EDITOR_SELECTORS);
    if (!editor) return null;

    const scope = editor.closest("form, [role='dialog'], .msg-form, .msg-overlay-conversation-bubble") || document;
    const sendButton =
      findVisibleBySelectors(MSG_SEND_SELECTORS, scope) ||
      findClickableByLabel(scope, (label) => /^send\b/.test(label), { requireEnabled: false }) ||
      findVisibleBySelectors(MSG_SEND_SELECTORS);

    return { editor, sendButton: sendButton || null, scope };
  }

  async function waitForMessageComposer(timeout = 8000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const composer = getMessageComposer();
      if (composer) return composer;
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  }

  const TOPIC_KEYWORDS = ["career", "job", "hiring", "recruit", "opportunit", "work with"];
  const TOPIC_FALLBACK_PATTERN = /something else|other|general/i;

  /** The topic control on a company-page message modal: a required <select>. */
  function getTopicSelect(dialog = getOpenDialog()) {
    if (!dialog) return null;
    const select =
      dialog.querySelector("select#msg-shared-modals-msg-page-modal-presenter-conversation-topic") ||
      dialog.querySelector("select[id*='conversation-topic']") ||
      dialog.querySelector("select");
    return isVisible(select) ? select : null;
  }

  function setSelectValue(select, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(select, value);
    else select.value = value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pickByTopicPreference(items, preferred, getText) {
    const keywords = preferred?.length ? preferred : TOPIC_KEYWORDS;

    for (const keyword of keywords) {
      const hit = items.find((item) => getText(item).toLowerCase().includes(keyword));
      if (hit) return hit;
    }

    // No careers-style topic on this page — "Other" still reaches a human
    return items.find((item) => TOPIC_FALLBACK_PATTERN.test(getText(item))) || items[0] || null;
  }

  /** Choose the topic from a <select>, which is what company pages actually use. */
  function selectTopicFromSelect(select, preferred) {
    const options = Array.from(select.options).filter(
      (option) => !option.disabled && (option.value || "").trim()
    );
    if (!options.length) return { selected: false, needed: true, topics: [] };

    const optionText = (option) => (option.textContent || "").replace(/\s+/g, " ").trim();
    const choice = pickByTopicPreference(options, preferred, optionText);
    if (!choice) return { selected: false, needed: true, topics: options.map(optionText) };

    setSelectValue(select, choice.value);

    return {
      selected: select.value === choice.value,
      needed: true,
      topic: optionText(choice),
      topics: options.map(optionText),
    };
  }

  /**
   * Button/pill style topic choices, used by the variants that do not render a
   * <select>. Field labels and the modal's own controls are filtered out.
   */
  function getMessageTopicOptions(dialog = getOpenDialog()) {
    if (!dialog) return [];

    const options = [];
    const seen = new Set();
    const nodes = dialog.querySelectorAll(
      "button, [role='radio'], [role='option'], [role='menuitem'], li"
    );

    for (const el of nodes) {
      if (!isVisible(el) || !isEnabled(el)) continue;
      if (el.querySelector("button, [role='radio'], [role='option'], [role='menuitem']")) continue;
      // Skip anything that labels a form field rather than being a choice
      if (el.tagName === "LABEL" || el.querySelector("label, input, select, textarea")) continue;

      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 60) continue;

      const lower = text.toLowerCase();
      if (TOPIC_CONTROL_WORDS.includes(lower)) continue;
      if (seen.has(lower)) continue;

      seen.add(lower);
      options.push({ el, text });
    }

    return options;
  }

  async function selectMessageTopic(preferred) {
    const dialog = getOpenDialog();

    // Company pages: a required <select> that keeps Send disabled until it is set
    const topicSelect = getTopicSelect(dialog);
    if (topicSelect) {
      const result = selectTopicFromSelect(topicSelect, preferred);
      await new Promise((r) => setTimeout(r, 600));
      return result;
    }

    const options = getMessageTopicOptions(dialog);
    if (!options.length) {
      // No chooser — most message overlays drop you straight into the composer
      return { selected: false, needed: false, topics: [] };
    }

    const choice = pickByTopicPreference(options, preferred, (option) => option.text);
    if (!choice) {
      return { selected: false, needed: true, topics: options.map((o) => o.text) };
    }

    await dispatchNativeClickAsync(choice.el);
    await new Promise((r) => setTimeout(r, 900));

    // Some variants need a Next/Continue press after picking the topic
    const nextBtn = findClickableByLabel(
      getOpenDialog() || document,
      (label) => label === "next" || label === "continue"
    );
    if (nextBtn) {
      await dispatchNativeClickAsync(nextBtn);
      await new Promise((r) => setTimeout(r, 900));
    }

    return {
      selected: true,
      needed: true,
      topic: choice.text,
      topics: options.map((o) => o.text),
    };
  }

  /** Open the message composer from whatever Message control this page offers. */
  async function openMessageComposer(selector) {
    const existing = getMessageComposer();
    if (existing) return { opened: true, alreadyOpen: true };

    let trigger = null;
    if (selector) {
      const el = document.querySelector(selector);
      if (isVisible(el)) trigger = el;
    }

    let topCard = null;
    if (!trigger) {
      topCard =
        document.querySelector(".org-top-card-primary-actions") ||
        document.querySelector(".org-top-card__primary-actions") ||
        document.querySelector(".pv-top-card-v2-ctas") ||
        document.querySelector(".ph5.pb5") ||
        null;
      trigger = (topCard && findMessageButton(topCard)) || findMessageButton(document);
    }

    // Some pages tuck Message behind the top card's "More" menu
    if (!trigger && topCard) {
      const moreBtn = findClickableByLabel(
        topCard,
        (label) => label === "more" || label.startsWith("more actions") || label.startsWith("more options")
      );
      if (moreBtn) {
        await dispatchNativeClickAsync(moreBtn);
        await new Promise((r) => setTimeout(r, 1000));
        trigger = findMessageButton(document);
      }
    }

    if (!trigger) {
      return { opened: false, error: "No Message button on this page" };
    }

    await HumanBehavior.hoverElement(trigger);
    await dispatchNativeClickAsync(trigger);
    await new Promise((r) => setTimeout(r, 1500));

    // Company-page modals show the topic and the message box together, while
    // the pill-style choosers only reveal the box after a topic is picked —
    // so look for the box, answer the topic question, then look again.
    let composer = await waitForMessageComposer(4000);
    const topicResult = await selectMessageTopic();
    if (!composer) composer = await waitForMessageComposer(6000);

    if (!composer) {
      return {
        opened: false,
        error: "Message composer did not open",
        topic: topicResult.topic || "",
        topics: topicResult.topics || [],
      };
    }

    return {
      opened: true,
      topic: topicResult.topic || "",
      topics: topicResult.topics || [],
    };
  }

  async function sendComposedMessage(text) {
    const composer = await waitForMessageComposer(5000);
    if (!composer) return { sent: false, error: "Message composer not open" };

    const { editor } = composer;

    // Company-page modals cap the box (750 chars) and reject anything longer
    const maxLength = Number(editor.getAttribute?.("maxlength")) || 0;
    const body = maxLength > 0 && text.length > maxLength ? text.slice(0, maxLength) : text;

    editor.focus();
    editor.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));

    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      await dispatchNativeInput(editor, body);
      // Some forms only validate on change/blur, not on each keystroke
      editor.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // contenteditable: clear anything LinkedIn pre-filled, then insert
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("delete", false);
      document.execCommand("insertText", false, body);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await new Promise((r) => setTimeout(r, 1200));

    // Send stays disabled until every required field validates — on a company
    // page that means the conversation topic as well as the message body.
    const currentSendButton = () => getMessageComposer()?.sendButton || composer.sendButton;
    let sendButton = currentSendButton();
    let retriedTopic = false;

    for (let i = 0; i < 12; i++) {
      sendButton = currentSendButton();
      if (sendButton && isEnabled(sendButton)) break;

      // Halfway through, assume the blocker is an unset topic and set it again
      if (!retriedTopic && i === 5) {
        retriedTopic = true;
        const topicSelect = getTopicSelect();
        if (topicSelect && !topicSelect.value) {
          selectTopicFromSelect(topicSelect);
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    if (!sendButton) return { sent: false, error: "Send button not found" };
    if (!isEnabled(sendButton)) {
      const topicSelect = getTopicSelect();
      const reason = topicSelect && !topicSelect.value ? "conversation topic was not accepted" : "form did not validate";
      return { sent: false, error: `Send button stayed disabled (${reason})` };
    }

    await dispatchNativeClickAsync(sendButton);
    await new Promise((r) => setTimeout(r, 2500));

    // Sent when the composer clears or closes; text still sitting there means it failed
    const after = getMessageComposer();
    const leftover = after ? (after.editor.value ?? after.editor.textContent ?? "").trim() : "";
    if (!after || leftover.length === 0) {
      return { sent: true, length: body.length };
    }

    return { sent: false, error: "Message was still in the box after pressing Send" };
  }

  async function closeMessageOverlay() {
    const dialog = getOpenDialog();
    const composer = getMessageComposer();

    // Only ever click inside something that is actually open. Searching the
    // whole page for "close"/"dismiss" would hit the Dismiss button on a job card.
    const scope =
      dialog ||
      composer?.editor.closest(".msg-overlay-conversation-bubble, .msg-form, form") ||
      null;
    if (!scope) return { closed: true };

    const closeBtn = findClickableByLabel(
      scope,
      (label) => /^(close|dismiss|cancel)\b/.test(label) || label === "close conversation"
    );
    if (closeBtn) {
      await dispatchNativeClickAsync(closeBtn);
      await new Promise((r) => setTimeout(r, 800));
    }

    // "Discard draft?" confirmation, when a half-written message is open
    const confirmDialog = getOpenDialog();
    const discardBtn = confirmDialog
      ? findClickableByLabel(confirmDialog, (label) => label === "discard" || label.startsWith("discard"))
      : null;
    if (discardBtn) {
      await dispatchNativeClickAsync(discardBtn);
      await new Promise((r) => setTimeout(r, 600));
    }

    return { closed: !getMessageComposer() };
  }

  /** The company behind the job currently shown, as a page URL we can open. */
  function getCompanyFromJob() {
    const root = getJobDetailRoot();
    const link =
      root.querySelector(".job-details-jobs-unified-top-card__company-name a") ||
      root.querySelector(".jobs-unified-top-card__company-name a") ||
      root.querySelector("a[href*='/company/']") ||
      document.querySelector(".job-details-jobs-unified-top-card__company-name a") ||
      document.querySelector("a[href*='/company/']");

    if (!link) {
      const nameEl =
        root.querySelector(".job-details-jobs-unified-top-card__company-name") ||
        root.querySelector(".jobs-unified-top-card__company-name");
      const name = nameEl?.textContent?.replace(/\s+/g, " ").trim() || "";
      return name ? { name, url: "" } : null;
    }

    const name = (link.textContent || "").replace(/\s+/g, " ").trim();
    let url = "";
    try {
      const parsed = new URL(link.href, window.location.origin);
      const slug = parsed.pathname.match(/\/company\/([^/?#]+)/i)?.[1];
      url = slug ? `https://www.linkedin.com/company/${slug}/` : "";
    } catch {
      url = "";
    }

    return { name, url };
  }

  /** "Meet the hiring team" — the people LinkedIn says own this posting. */
  function getHiringTeamTargets() {
    const cards = document.querySelectorAll(
      ".job-details-people-who-can-help__section, .hirer-card__container, " +
      "[class*='hirer-card'], .jobs-poster, .job-details-module__hirer-card"
    );

    const targets = [];
    const seen = new Set();

    for (const card of cards) {
      if (!isVisible(card)) continue;

      const profileLink = card.querySelector("a[href*='/in/']");
      const name =
        card.querySelector(".jobs-poster__name")?.textContent ||
        card.querySelector(".hirer-card__hirer-information span[aria-hidden='true']")?.textContent ||
        profileLink?.textContent ||
        "";
      const cleanName = name.replace(/\s+/g, " ").trim();
      if (!cleanName || seen.has(cleanName)) continue;

      const headline =
        card.querySelector(".hirer-card__hirer-job-title")?.textContent ||
        card.querySelector(".t-14.t-black--light")?.textContent ||
        "";

      const messageBtn = findMessageButton(card);

      seen.add(cleanName);
      targets.push({
        name: cleanName,
        headline: headline.replace(/\s+/g, " ").trim(),
        profileUrl: profileLink?.href || "",
        canMessage: !!messageBtn,
        selector: messageBtn ? buildSelector(messageBtn) : "",
      });
    }

    return targets;
  }

  /** People listed on a company's People tab, with connection degree when shown. */
  function scrapeCompanyPeople() {
    const cards = document.querySelectorAll(
      ".org-people-profile-card__profile-card-spacing, .org-people-profile-card, " +
      ".artdeco-entity-lockup, li.grid"
    );

    const people = [];
    const seen = new Set();

    for (const card of cards) {
      if (!isVisible(card)) continue;

      const link = card.querySelector("a[href*='/in/']");
      if (!link) continue;

      let profileUrl = "";
      try {
        const parsed = new URL(link.href, window.location.origin);
        profileUrl = `${parsed.origin}${parsed.pathname}`;
      } catch {
        continue;
      }
      if (seen.has(profileUrl)) continue;

      const name = (
        card.querySelector(".artdeco-entity-lockup__title")?.textContent ||
        card.querySelector(".org-people-profile-card__profile-title")?.textContent ||
        link.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      if (!name || /^linkedin member$/i.test(name)) continue;

      const headline = (
        card.querySelector(".artdeco-entity-lockup__subtitle")?.textContent ||
        card.querySelector(".lt-line-clamp--multi-line")?.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();

      const degreeText = (
        card.querySelector(".dist-value")?.textContent ||
        card.querySelector(".artdeco-entity-lockup__degree")?.textContent ||
        (card.textContent || "").match(/\b(1st|2nd|3rd)\b/)?.[0] ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();

      seen.add(profileUrl);
      people.push({ name, headline, profileUrl, degree: degreeText });
    }

    return people;
  }

  // --- Phase 2: Post Creation Helper ---

  async function createLinkedInPost(content, hashtags) {
    // Navigate to feed if not already there
    if (!window.location.href.includes("/feed")) {
      window.location.href = "https://www.linkedin.com/feed/";
      await new Promise((r) => setTimeout(r, 3000));
    }

    // Click "Start a post" button
    const startPostBtn =
      document.querySelector(".share-box-feed-entry__trigger") ||
      getElementByText("button", "Start a post");
    if (!startPostBtn) return { posted: false, error: "Start a post button not found" };

    dispatchNativeClick(startPostBtn);
    await new Promise((r) => setTimeout(r, 2000));

    // Find the post editor
    const editor =
      document.querySelector(".ql-editor") ||
      document.querySelector("[role='textbox'][contenteditable='true']") ||
      document.querySelector("[data-test-ql-editor-contenteditable]");

    if (!editor) return { posted: false, error: "Post editor not found" };

    // Type content with hashtags
    let fullContent = content;
    if (hashtags && hashtags.length > 0) {
      fullContent += "\n\n" + hashtags.map((h) => `#${h}`).join(" ");
    }

    editor.focus();
    // Use execCommand for rich text editors
    document.execCommand("insertText", false, fullContent);
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 1000));

    // Click Post button
    const postBtn =
      getElementByText("button", "Post") ||
      document.querySelector(".share-actions__primary-action");
    if (!postBtn) return { posted: false, error: "Post button not found", content: fullContent };

    dispatchNativeClick(postBtn);
    await new Promise((r) => setTimeout(r, 3000));

    return { posted: true, content: fullContent };
  }

  // --- Phase 2: Engagement Helpers ---
  //
  // LinkedIn now ships two completely different feed DOMs depending on which
  // rollout the account is on:
  //
  //   legacy   — semantic class names: .feed-shared-update-v2,
  //              .update-components-actor__title, data-urn="urn:li:activity:…"
  //   redesign — every class is a hashed token (._28da66c8), the feed is
  //              <div data-testid="mainFeed" role="list"> and each post is a
  //              role="listitem" identified only by a `componentkey` hash.
  //
  // Nothing in the redesign's markup is stable except its accessibility
  // surface, so everything below matches on roles, aria-labels and visible
  // text first and treats the legacy class names as a fallback. Selector-only
  // matching is what made the scraper return zero posts on redesigned accounts
  // while still reporting success.

  /**
   * Cards found by the last feed sweep, keyed by the postKey handed to the
   * server. ENGAGE_FEED_POST comes back later naming one of those keys, and
   * the redesign gives us no id we could re-query the DOM with — so the
   * element reference itself is what we keep.
   */
  const feedCardRegistry = new Map();

  /** Every container shape a post has been seen in, most specific first. */
  const FEED_CARD_SELECTORS = [
    "[data-testid='mainFeed'] [role='listitem']",
    "div.feed-shared-update-v2",
    "div[data-id^='urn:li:activity']",
    "div[data-urn^='urn:li:activity']",
    "main [role='list'] [role='listitem']",
    ".scaffold-finite-scroll__content > div",
  ];

  /** Collect candidate post cards from whichever DOM the page is rendering. */
  function findFeedCards() {
    const cards = [];
    const seen = new Set();
    for (const selector of FEED_CARD_SELECTORS) {
      let found;
      try {
        found = document.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const el of found) {
        if (seen.has(el)) continue;
        seen.add(el);
        cards.push(el);
      }
      // The first selector that matches a plausible number of cards wins;
      // falling through would mix wrappers and inner cards into one list.
      if (cards.length >= 3) break;
    }
    return cards;
  }

  /**
   * What a screen reader would call this control.
   *
   * aria-label wins because the redesign labels its icon-only buttons that way
   * and their text content is empty.
   */
  function accessibleName(el) {
    if (!el) return "";
    const label =
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.textContent ||
      "";
    return label.replace(/\s+/g, " ").trim();
  }

  /**
   * The control's visible caption, ignoring aria-label.
   *
   * The redesign's action bar labels its Like button "Reaction button state:
   * no reaction" — accurate for a screen reader, useless for matching — while
   * the word actually printed on it is "Like". Its Comment button carries no
   * aria-label at all. So both names have to be checked, not just one.
   */
  function visibleText(el) {
    if (!el) return "";
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  /** Buttons in `root`, covering both <button> and role="button" divs. */
  function clickableCandidates(root) {
    return Array.from(
      (root || document).querySelectorAll("button, [role='button']")
    ).filter((el) => !el.disabled && el.getAttribute("aria-disabled") !== "true");
  }

  /**
   * Find one social-action button by either of its names.
   *
   * `exact` is tried across every candidate before `loose`, because a post's
   * action bar and its social-proof row both mention "comment" and only the
   * exactly-named one is the control we want.
   */
  function findActionButton(root, exact, loose, reject) {
    const candidates = clickableCandidates(root).filter(
      (el) => !reject || !(reject.test(accessibleName(el)) || reject.test(visibleText(el)))
    );
    for (const el of candidates) {
      if (exact.test(accessibleName(el)) || exact.test(visibleText(el))) return el;
    }
    if (loose) {
      for (const el of candidates) {
        if (loose.test(accessibleName(el)) || loose.test(visibleText(el))) return el;
      }
    }
    return null;
  }

  // "Like"/"Unlike" as printed on the button, and the redesign's aria-label,
  // which spells out the current reaction rather than the action.
  const LIKE_EXACT = /^(react\s+)?(like|unlike)$/i;
  const LIKE_LOOSE = /^reaction button state\b/i;
  // The chevron beside Like opens the reaction picker. Clicking it opens a
  // menu instead of liking, so it has to be excluded by name.
  const LIKE_REJECT = /reactions? menu/i;
  const COMMENT_EXACT = /^(comment|add a comment|leave a comment)$/i;
  // "Comment on <name>'s post" — but never "12 comments", which is the
  // social-proof link into the comment list.
  const COMMENT_LOOSE = /^comment\b(?!s)/i;

  function findLikeButton(root) {
    return (
      (root && root.querySelector("[data-test-action='like']")) ||
      (root && root.querySelector(".social-actions-button[aria-label*='Like']")) ||
      findActionButton(root, LIKE_EXACT, LIKE_LOOSE, LIKE_REJECT)
    );
  }

  function findCommentButton(root) {
    return (
      (root && root.querySelector("[data-test-action='comment']")) ||
      findActionButton(root, COMMENT_EXACT, COMMENT_LOOSE)
    );
  }

  /** Has this like button already been pressed? */
  function isAlreadyLiked(btn) {
    if (!btn) return false;
    if (btn.getAttribute("aria-pressed") === "true") return true;
    if (btn.classList.contains("react-button--active")) return true;
    if (/^unlike\b/i.test(accessibleName(btn))) return true;
    if (/^unlike\b/i.test(visibleText(btn))) return true;

    // "Reaction button state: no reaction" means untouched; any other state —
    // "like", "celebrate", "insightful" — means it has already been reacted to.
    const state = accessibleName(btn).match(/^reaction button state:\s*(.+)$/i);
    if (state) return !/^no reaction$/i.test(state[1].trim());

    return false;
  }

  /**
   * The post card the page is "about".
   *
   * On a post permalink every comment carries its own Like and Reply buttons,
   * so a bare document-wide query can land on a reply to the post instead of
   * the post. Scoping to the first update card keeps the action on the thing
   * that was actually read. Falls back to the whole document when the page is
   * not shaped like a feed card.
   */
  function primaryPostRoot() {
    return (
      document.querySelector("div.feed-shared-update-v2") ||
      document.querySelector("div[data-urn^='urn:li:activity']") ||
      document.querySelector("div[data-id^='urn:li:activity']") ||
      document.querySelector("[data-testid='mainFeed'] [role='listitem']") ||
      document.querySelector("main [role='listitem']") ||
      document
    );
  }

  /** Resolve whatever the service worker named into a card element. */
  function resolveEngagementRoot({ postKey, selector }) {
    if (postKey && feedCardRegistry.has(postKey)) {
      const el = feedCardRegistry.get(postKey);
      // A card the feed has since recycled out of the DOM is no longer usable.
      if (el && el.isConnected) return el;
      feedCardRegistry.delete(postKey);
      return null;
    }
    if (selector) return document.querySelector(selector);
    return primaryPostRoot();
  }

  /** Put a card on screen the way scrolling to it would. */
  async function bringIntoView(el) {
    if (!el || typeof el.scrollIntoView !== "function") return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(600, 1400));
  }

  async function likePost(postSelector, root) {
    const scope =
      root ||
      (postSelector ? document.querySelector(postSelector) : primaryPostRoot()) ||
      document;

    const likeBtn = findLikeButton(scope) || findLikeButton(document);
    if (!likeBtn) return { liked: false, error: "Like button not found" };

    if (isAlreadyLiked(likeBtn)) return { liked: false, alreadyLiked: true };

    await HumanBehavior.humanClick(likeBtn);
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(700, 1600));
    return { liked: true };
  }

  /**
   * Find the comment editor that belongs to `scope`.
   *
   * Scoped first because on the feed several posts can have their comment box
   * open at once, and typing into the wrong one posts the comment under the
   * wrong post.
   */
  const COMMENT_INPUT_SELECTORS = [
    // The redesign's editor: a TipTap/ProseMirror contenteditable, labelled
    // for screen readers and wrapped in a testid'd container.
    "[aria-label='Text editor for creating comment']",
    "[data-testid='ui-core-tiptap-text-editor-wrapper'] [contenteditable='true']",
    ".comments-comment-box__form .ql-editor",
    ".comments-comment-box .ql-editor",
    ".comments-comment-texteditor .ql-editor",
    "[role='textbox'][aria-label*='comment' i]",
    "[role='textbox'][contenteditable='true']",
    "[contenteditable='true'][aria-multiline='true']",
  ];

  /**
   * The comment editor belonging to `scope`.
   *
   * Never widens past the card. A sweep leaves comment boxes open on the posts
   * behind it, so a document-wide query lands on whichever box opened first
   * and the comment goes under the wrong post. Better to report "input not
   * found" and move on than to comment on something at random.
   */
  function findCommentInput(scope) {
    const root = scope && scope !== document ? scope : document;
    for (const sel of COMMENT_INPUT_SELECTORS) {
      const found = root.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  /**
   * The button that actually publishes what was typed into `input`.
   *
   * Searched outwards from the editor rather than inwards from the card: a
   * post with a video attached puts forty-odd video-player controls inside the
   * same card, and the comment box's own subtree is the only scope guaranteed
   * to hold nothing but the comment box. As with the input, this never widens
   * to the document — submitting into another post's box is worse than
   * failing.
   */
  function findCommentSubmit(scope, input) {
    // The card is a hard ceiling on the search. Walking above it reaches the
    // feed container and, from there, the submit button of whichever other
    // post has its box open — which would publish this comment under that post.
    const ceiling = scope && scope !== document ? scope : null;

    // The redesign wraps the submit button in a div whose id ends in
    // "commentButtonSection" plus the post's own key, which makes it both
    // unambiguous and unique to this post. Every class around it is a hashed
    // token and the button itself is a type="button" captioned "Comment" —
    // identical, by name, to the button on the card that opens the box. This
    // id is the only thing that tells the two apart.
    const section = (root) =>
      root.querySelector?.(SUBMIT_SECTION_SELECTOR) &&
      firstEnabled(root.querySelectorAll(`${SUBMIT_SECTION_SELECTOR} button, ${SUBMIT_SECTION_SELECTOR} [role='button']`));

    if (ceiling) {
      const byId = section(ceiling);
      if (byId) return byId;
    }

    const roots = [];
    if (input) {
      const form = input.closest("form");
      if (form && (!ceiling || ceiling.contains(form))) roots.push(form);
      const box = input.closest("[class*='comments-comment-box'], [class*='comment-box']");
      if (box && (!ceiling || ceiling.contains(box))) roots.push(box);

      let hop = input.parentElement;
      for (let up = 0; up < 8 && hop; up++) {
        roots.push(hop);
        if (ceiling && hop === ceiling) break;
        hop = hop.parentElement;
        if (ceiling && hop && !ceiling.contains(hop)) break;
      }
    }
    if (ceiling && !roots.includes(ceiling)) roots.push(ceiling);

    for (const root of roots) {
      const direct =
        section(root) ||
        root.querySelector?.(".comments-comment-box__submit-button:not([disabled])") ||
        root.querySelector?.("[class*='comments-comment-box'] button[type='submit']:not([disabled])") ||
        root.querySelector?.("button[type='submit']:not([disabled])");
      if (direct) return direct;

      const named = findActionButton(root, /^(post|submit|reply)$/i, null, SUBMIT_REJECT);
      if (named) return named;

      // A button captioned "Comment" is the submit button when it is inside the
      // box, and the button that opens the box when it is out on the card's
      // action bar. Only accept it below the card.
      if (root !== ceiling) {
        const inBox = findActionButton(root, /^comment$/i);
        if (inBox) return inBox;
      }
    }
    return null;
  }

  const SUBMIT_SECTION_SELECTOR = "[id*='commentButtonSection']";

  /** The first of these that is actually clickable. */
  function firstEnabled(nodes) {
    for (const el of nodes || []) {
      if (el.disabled === true) continue;
      if (el.getAttribute("aria-disabled") === "true") continue;
      return el;
    }
    return null;
  }

  // The card's own Comment button reopens the box rather than submitting it,
  // and a video attachment brings its own "Play"/"Pause"/"Done" controls. None
  // of them are the submit button, however they are named.
  const SUBMIT_REJECT =
    /^(start a post|play|pause|done|reset|close|show emoji|open gif|share photo|add a photo)/i;

  /** Buttons near the editor that are currently disabled. */
  function disabledNear(input, ceiling) {
    const box = commentBoxScope(input, ceiling);
    if (!box) return [];
    return Array.from(box.querySelectorAll("button, [role='button']")).filter(
      (el) => el.disabled === true || el.getAttribute("aria-disabled") === "true"
    );
  }

  /**
   * The smallest container holding the whole comment box and nothing else.
   *
   * Bounded by the card for the same reason the submit search is: a scope that
   * climbs past it snapshots another post's submit button, and the wake-up
   * check would then click that one.
   */
  function commentBoxScope(input, ceiling) {
    if (!input) return null;
    const within = (el) => el && (!ceiling || ceiling === document || ceiling.contains(el));

    const form = input.closest("form");
    if (within(form)) return form;

    const box = input.closest("[class*='comments-comment-box'], [class*='comment-box']");
    if (within(box)) return box;

    let hop = input.parentElement;
    for (let up = 0; up < 3 && hop; up++) {
      if (ceiling && hop === ceiling) return hop;
      const next = hop.parentElement;
      if (!within(next)) return hop;
      hop = next;
    }
    return hop || input.parentElement || null;
  }

  /**
   * The submit button, identified by what it does rather than what it is
   * called.
   *
   * LinkedIn keeps the comment box's submit disabled until there is text in
   * the editor, so the control that flips from disabled to enabled the moment
   * the comment is typed is the submit button — whatever the redesign has
   * renamed it to this week. Matching on behaviour is the one approach that
   * does not go stale every time the markup is reshuffled.
   */
  function newlyEnabled(before) {
    for (const el of before) {
      const stillOff = el.disabled === true || el.getAttribute("aria-disabled") === "true";
      if (!stillOff && el.isConnected) return el;
    }
    return null;
  }

  async function commentOnPost(postSelector, commentText, root) {
    if (!commentText || !String(commentText).trim()) {
      return { commented: false, error: "No comment text supplied" };
    }

    const scope =
      root ||
      (postSelector ? document.querySelector(postSelector) : primaryPostRoot()) ||
      document;

    const commentBtn = findCommentButton(scope) || findCommentButton(document);
    if (!commentBtn) return { commented: false, error: "Comment button not found" };

    await HumanBehavior.humanClick(commentBtn);
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(1200, 2500));

    // The editor mounts asynchronously; one click plus a fixed sleep is not
    // enough on a slow feed.
    let commentInput = null;
    for (let attempt = 0; attempt < 12 && !commentInput; attempt++) {
      commentInput = findCommentInput(scope);
      if (!commentInput) await HumanBehavior.sleep(400);
    }
    if (!commentInput) return { commented: false, error: "Comment input not found" };

    // Snapshot what is disabled before typing, so the button that wakes up in
    // response to the text can be identified by that alone.
    const wasDisabled = disabledNear(commentInput, scope);

    await HumanBehavior.humanType(commentInput, commentText);
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(800, 1800));

    // Submit only enables once the editor has registered the text, so look for
    // it after typing rather than before.
    let submitBtn = null;
    for (let attempt = 0; attempt < 8 && !submitBtn; attempt++) {
      submitBtn = newlyEnabled(wasDisabled) || findCommentSubmit(scope, commentInput);
      if (!submitBtn) await HumanBehavior.sleep(400);
    }
    if (!submitBtn) return { commented: false, error: "Submit button not found" };

    await HumanBehavior.humanClick(submitBtn);
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(2000, 3500));
    return { commented: true };
  }

  /**
   * Like and comment on one card of the feed, in place.
   *
   * Feed mode used to open each post's permalink first. The redesign often
   * renders no permalink on the card at all, so there is nothing to navigate
   * to — and acting on the card directly is both what a person does and one
   * fewer page load per post.
   */
  async function engageFeedPost({ postKey, selector, comment, alsoLike }) {
    const root = resolveEngagementRoot({ postKey, selector });
    if (!root) {
      return { liked: false, commented: false, error: "That post is no longer on the page" };
    }

    await bringIntoView(root);

    const out = { liked: false, alreadyLiked: false, commented: false };

    if (alsoLike !== false) {
      const like = await likePost(null, root);
      out.liked = Boolean(like.liked);
      out.alreadyLiked = Boolean(like.alreadyLiked);
      if (like.error) out.likeError = like.error;
      await HumanBehavior.sleep(HumanBehavior.clampedGaussian(1200, 3000));
    }

    if (comment && String(comment).trim()) {
      const posted = await commentOnPost(null, comment, root);
      out.commented = Boolean(posted.commented);
      if (posted.error) out.error = posted.error;
    }

    return out;
  }

  // ─── Autopilot: read down the LinkedIn home feed ──────────────────────────

  /**
   * Scroll the home feed and collect what is on it.
   *
   * Separate from scrapeKeywordPosts because the feed and the search results
   * page are different pages with different containers: search wraps each hit
   * in a result container, the feed renders bare update cards. Sharing one
   * scraper across both meant whichever page was not being tested silently
   * returned nothing.
   *
   * Scrolls incrementally rather than jumping to the bottom — the feed is
   * infinite and lazily rendered, so a jump loses everything in between.
   */
  async function scrapeFeedPosts(maxPosts) {
    try {
      await waitForElement(FEED_CARD_SELECTORS.join(", "), 12000);
    } catch {
      console.warn("[WinPilot CS] scrapeFeedPosts: feed never rendered any cards");
    }

    await new Promise((r) => setTimeout(r, 1500));

    feedCardRegistry.clear();

    const posts = [];
    const seenKeys = new Set();
    const seenCards = new Set();
    let stalledPasses = 0;

    // Up to 12 passes down the feed. The loop exits early once we have enough,
    // or once two passes in a row add nothing new (end of feed, or a render
    // the selectors do not recognise).
    for (let pass = 0; pass < 12 && posts.length < maxPosts; pass++) {
      const before = posts.length;

      for (const item of findFeedCards()) {
        if (posts.length >= maxPosts) break;
        if (seenCards.has(item)) continue;
        seenCards.add(item);

        await expandSeeMore(item);
        const parsed = parseFeedCard(item);
        if (!parsed) continue;
        if (seenKeys.has(parsed.postKey)) continue;
        seenKeys.add(parsed.postKey);
        feedCardRegistry.set(parsed.postKey, item);
        posts.push(parsed);
      }

      if (posts.length >= maxPosts) break;

      if (posts.length === before) {
        stalledPasses++;
        if (stalledPasses >= 2) break;
      } else {
        stalledPasses = 0;
      }

      // Scroll roughly one card's worth and give the feed time to fill in.
      if (!document.hidden) {
        try {
          await HumanBehavior.idleScroll();
        } catch {
          window.scrollBy(0, 700);
        }
      } else {
        window.scrollTo(0, window.scrollY + 800);
      }
      await new Promise((r) => setTimeout(r, 1200 + Math.random() * 1200));
    }

    console.log(
      `[WinPilot CS] scrapeFeedPosts: collected ${posts.length} posts from ${seenCards.size} cards`
    );
    return posts;
  }

  /**
   * Click a card's "see more" so the scrape reads the whole post.
   *
   * A comment written against a truncated post is a comment about the first
   * three lines of it, which is exactly the kind of output that reads as a bot.
   */
  async function expandSeeMore(item) {
    try {
      const more =
        item.querySelector("[data-testid='expandable-text-button']") ||
        clickableCandidates(item).find((el) =>
          /^(…|\.\.\.)?\s*(see )?more$/i.test(accessibleName(el))
        );
      if (!more) return;
      more.click();
      await new Promise((r) => setTimeout(r, 250));
    } catch {
      // Reading the truncated text is better than failing the sweep
    }
  }

  /** Stable-enough id for a card the redesign gives no urn or permalink for. */
  function fingerprint(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
  }

  /**
   * The post's own text.
   *
   * Tries the legacy commentary containers first. When none match — the
   * redesign has no such class — it falls back to picking the longest run of
   * text in the card that is not itself a control, which lands on the
   * commentary because it is by far the biggest text block on a post.
   */
  function extractPostText(item) {
    const known = [
      // The redesign's commentary block. It is the one part of a post card
      // that still carries a testid, so it is the most reliable hook there is.
      "[data-testid='expandable-text-box']",
      ".update-components-text .break-words",
      ".feed-shared-inline-show-more-text .break-words",
      ".update-components-text span[dir]",
      "[class*='commentary'] .break-words",
      ".update-components-text",
    ];
    for (const sel of known) {
      const el = item.querySelector(sel);
      if (!el) continue;
      const text = readVisibleText(el);
      if (text.length >= 40) return text;
    }

    let best = "";
    for (const el of item.querySelectorAll("p, span[dir], div[dir]")) {
      // Anything inside a control or the actor header is chrome, not the post.
      if (el.closest("button, [role='button'], a, h2, figure")) continue;
      const text = readVisibleText(el);
      if (text.length > best.length) best = text;
    }
    return best;
  }

  /**
   * An element's text as a reader sees it.
   *
   * Strips the controls LinkedIn nests inside the commentary — the "…more"
   * expander lives inside the text block itself — and turns <br> into the line
   * breaks the author actually typed, so the model is given the post rather
   * than the post with "…more" welded onto the end of it.
   */
  function readVisibleText(el) {
    if (!el) return "";
    const copy = el.cloneNode(true);
    for (const junk of copy.querySelectorAll("button, [role='button'], style, script")) {
      junk.remove();
    }
    for (const br of copy.querySelectorAll("br")) {
      br.replaceWith("\n");
    }
    return (copy.textContent || "")
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Pull one feed card apart. Returns null for anything that is not a real
   * post: ads, "people you may know" carousels, the share box, the sort
   * control, empty placeholder cards.
   */
  function parseFeedCard(item) {
    try {
      const text = (el) => el?.textContent?.trim() || "";

      let authorName = text(
        item.querySelector(".update-components-actor__title span[aria-hidden='true']") ||
        item.querySelector(".update-components-actor__name span[aria-hidden='true']") ||
        item.querySelector(".update-components-actor__title") ||
        item.querySelector(".update-components-actor__name") ||
        item.querySelector("[class*='actor__title'] span[aria-hidden='true']") ||
        item.querySelector("[class*='actor__name']")
      );

      // Redesign: the only place the author is named in plain text is the
      // control-menu button's label, "Open control menu for post by <name>".
      //
      // Those two labels are checked before the profile links because a card
      // that surfaced through someone else's reaction opens with "View
      // company: Nayatel" — the reactor, not the person who wrote the post.
      if (!authorName) {
        const patterns = [
          /(?:open control menu for post by|hide post by)\s+(.+)$/i,
          /^view\s+(.+?)(?:’s|'s)\s+profile$/i,
          /^view\s+(?:company:\s*)?(.+)$/i,
        ];
        outer: for (const pattern of patterns) {
          for (const el of item.querySelectorAll("[aria-label]")) {
            const match = accessibleName(el).match(pattern);
            if (match && match[1]) {
              authorName = match[1].trim();
              break outer;
            }
          }
        }
      }

      const authorProfileUrl =
        item.querySelector("a.update-components-actor__meta-link")?.href ||
        item.querySelector("a.update-components-actor__container-link")?.href ||
        item.querySelector("a[href*='/in/']")?.href ||
        "";

      const authorHeadline = text(
        item.querySelector(".update-components-actor__description span[aria-hidden='true']") ||
        item.querySelector("[class*='actor__description'] span[aria-hidden='true']") ||
        item.querySelector("[class*='actor__description']")
      );

      const postContent = extractPostText(item);

      // A promoted card has no commentary worth reading and a "Promoted"
      // label; skip both it and any card with nothing to react to.
      const itemText = (item.textContent || "").trim();
      if (/\bPromoted\b/.test(itemText.slice(0, 400))) return null;
      if (!postContent || postContent.length < 40) return null;

      // Only act on things that can actually be acted on. This is also what
      // drops the share box and the "Sort by" control, both of which are
      // role="listitem" in the redesigned feed.
      if (!findLikeButton(item) && !findCommentButton(item)) return null;

      // The feed rarely renders a direct post link, but a legacy update
      // carries its activity urn — which is enough to build the permalink.
      const urn =
        item.getAttribute("data-urn") ||
        item.getAttribute("data-id") ||
        item.querySelector("[data-urn^='urn:li:activity']")?.getAttribute("data-urn") ||
        item.querySelector("[data-id^='urn:li:activity']")?.getAttribute("data-id") ||
        "";

      let postUrl =
        item.querySelector("a[href*='/feed/update/urn']")?.href ||
        item.querySelector("a[href*='/posts/']")?.href ||
        "";
      if (!postUrl && urn.startsWith("urn:li:activity")) {
        postUrl = `https://www.linkedin.com/feed/update/${urn}/`;
      }

      // The redesign exposes neither, so fall back to a content fingerprint.
      // It is only ever used as a dedupe key and a registry handle, never
      // navigated to, so it does not need to be a real URL — but it does need
      // to be the same string the next time this post comes round.
      const postKey =
        (postUrl && postUrl.split("?")[0].replace(/\/$/, "")) ||
        urn ||
        `winpilot:post:${fingerprint(`${authorName}|${postContent.slice(0, 200)}`)}`;

      const reactionsEl = item.querySelector(
        "[class*='social-details-social-counts__reactions-count'], " +
        "[class*='social-counts'] [aria-label*='reaction']"
      );
      const commentsEl = item.querySelector(
        "[class*='social-details-social-counts__comments'], [class*='comments-count']"
      );

      return {
        postKey,
        // Kept for the server's dedupe and the journal. Falls back to the key
        // so a redesigned card is still deduped, just not linkable.
        postUrl: postUrl || postKey,
        postId: urn,
        authorName,
        authorHeadline,
        authorProfileUrl,
        postContent: postContent.slice(0, 3000),
        likeCount: parseInt(text(reactionsEl).replace(/[^\d]/g, "") || "0", 10) || 0,
        commentCount: parseInt(text(commentsEl).replace(/[^\d]/g, "") || "0", 10) || 0,
      };
    } catch (e) {
      console.warn("[WinPilot CS] parseFeedCard failed:", e.message);
      return null;
    }
  }


  // ─── Lead Generation: scrape posts from LinkedIn search/feed ──────────────

  /**
   * Scrape visible posts from LinkedIn search results page.
   * Called after navigating to: /search/results/content/?keywords=...
   * Returns an array of post metadata for the service worker to process.
   */
  async function scrapeKeywordPosts(keyword) {
    // Wait for search results to load — try multiple selectors LinkedIn uses
    const waitSelectors = [
      "li.reusable-search__result-container",
      ".search-results-container .artdeco-list__item",
      ".search-results__list .artdeco-list__item",
      "[data-view-name='search-entity-result-universal-template']",
      ".scaffold-finite-scroll__content li",
    ];

    let found = false;
    for (const sel of waitSelectors) {
      try {
        await waitForElement(sel, 5000);
        found = true;
        console.log(`[WinPilot CS] scrapeKeywordPosts: Found results via selector: ${sel}`);
        break;
      } catch { /* try next */ }
    }
    if (!found) {
      console.warn("[WinPilot CS] scrapeKeywordPosts: No search results found — page may not have loaded");
    }

    // Give LinkedIn a moment to finish lazy-rendering
    await new Promise((r) => setTimeout(r, 2000));

    // Scroll to trigger lazy load (document.hidden-safe)
    if (!document.hidden) {
      try { await HumanBehavior.idleScroll(); } catch { /* ignore */ }
    } else {
      window.scrollTo(0, 400);
    }
    await new Promise((r) => setTimeout(r, 1500));

    const posts = [];
    const seenUrls = new Set();

    // Collect result items — try multiple container strategies
    let resultItems = [];

    // Strategy 1: Modern LinkedIn search result containers
    const strategy1 = document.querySelectorAll("li.reusable-search__result-container");
    if (strategy1.length > 0) {
      resultItems = Array.from(strategy1);
      console.log(`[WinPilot CS] Using strategy1 (reusable-search): ${resultItems.length} items`);
    }

    // Strategy 2: Data-urn post cards (feed updates embedded in search)
    if (resultItems.length === 0) {
      const strategy2 = document.querySelectorAll("[data-urn], [data-activity-urn]");
      if (strategy2.length > 0) {
        resultItems = Array.from(strategy2);
        console.log(`[WinPilot CS] Using strategy2 (data-urn): ${resultItems.length} items`);
      }
    }

    // Strategy 3: Classic artdeco list items
    if (resultItems.length === 0) {
      const strategy3 = document.querySelectorAll(
        ".search-results-container .artdeco-list__item, " +
        ".search-results__list .artdeco-list__item, " +
        ".search-results-container li, " +
        ".scaffold-finite-scroll__content li"
      );
      if (strategy3.length > 0) {
        resultItems = Array.from(strategy3);
        console.log(`[WinPilot CS] Using strategy3 (artdeco-list): ${resultItems.length} items`);
      }
    }

    console.log(`[WinPilot CS] scrapeKeywordPosts: Total result items to parse: ${resultItems.length}`);

    for (const item of resultItems) {
      try {
        // ── Author name ───────────────────────────────────────────────────────
        const authorEl =
          item.querySelector(".update-components-actor__name span[aria-hidden='true']") ||
          item.querySelector(".update-components-actor__title span[aria-hidden='true']") ||
          item.querySelector(".update-components-actor__name") ||
          item.querySelector("[class*='actor__name'] span[aria-hidden='true']") ||
          item.querySelector("[class*='actor__name']") ||
          item.querySelector("[class*='actor__title']");

        // ── Author headline ───────────────────────────────────────────────────
        const headlineEl =
          item.querySelector(".update-components-actor__description span[aria-hidden='true']") ||
          item.querySelector("[class*='actor__description'] span[aria-hidden='true']") ||
          item.querySelector("[class*='actor__description']") ||
          item.querySelector("[class*='actor__subtitle']");

        // ── Author profile link ───────────────────────────────────────────────
        const profileLinkEl =
          item.querySelector("a.update-components-actor__container-link") ||
          item.querySelector("a.update-components-actor__meta-link") ||
          item.querySelector("[class*='actor__container-link']") ||
          item.querySelector("a[href*='/in/']");

        // ── Post content text (multiple fallbacks) ────────────────────────────
        const contentEl =
          item.querySelector(".update-components-text span.break-words") ||
          item.querySelector(".update-components-text-view span[dir]") ||
          item.querySelector(".feed-shared-update-v2__description .break-words") ||
          item.querySelector(".update-components-text .break-words") ||
          item.querySelector("[class*='commentary'] .break-words") ||
          item.querySelector("[class*='commentary'] span") ||
          item.querySelector(".feed-shared-text .break-words") ||
          item.querySelector("[class*='update-v2__description'] span") ||
          item.querySelector(".update-components-text");

        // ── Post URL ──────────────────────────────────────────────────────────
        const postLinkEl =
          item.querySelector("a[href*='/posts/']") ||
          item.querySelector("a[href*='/feed/update/urn']") ||
          item.querySelector(".update-components-header__text-wrapper a") ||
          item.querySelector("[class*='time-ago'] a") ||
          item.querySelector("a[data-tracking-control-name*='share_via']") ||
          item.querySelector("a[href*='linkedin.com/posts']");

        // ── URN ───────────────────────────────────────────────────────────────
        const urnEl =
          item.querySelector("[data-urn]") ||
          item.querySelector("[data-activity-urn]") ||
          item.closest("[data-urn]") ||
          item;

        const authorName = authorEl?.textContent?.trim() || "";
        const authorHeadline = headlineEl?.textContent?.trim() || "";
        const profileUrl = profileLinkEl?.href || "";
        const urn = urnEl?.getAttribute("data-urn") || urnEl?.getAttribute("data-activity-urn") || "";

        // Get post content — use specific el first, then full item text as fallback
        let postContent = contentEl?.textContent?.trim() || "";
        if (!postContent) {
          // Last resort: strip known boilerplate from item text
          const fullText = (item.textContent || "").trim();
          // Skip extremely short items (likely not real posts)
          if (fullText.length > 80) {
            postContent = fullText.substring(0, 800);
          }
        }

        // Build post URL
        let postUrl = postLinkEl?.href || "";
        if (!postUrl && urn) {
          postUrl = `https://www.linkedin.com/feed/update/${urn}/`;
        }

        // Skip items without content or URL
        if (!postContent || !postUrl) continue;

        // Deduplicate
        const normalizedUrl = postUrl.split("?")[0].replace(/\/$/, "");
        if (seenUrls.has(normalizedUrl)) continue;
        seenUrls.add(normalizedUrl);

        // Like / comment counts
        const likeCountEl = item.querySelector(
          "[class*='social-counts'] [class*='like-count'], " +
          "[aria-label*='reaction'], [class*='reactions-count']"
        );
        const commentCountEl = item.querySelector(
          "[class*='social-counts'] [class*='comment-count'], " +
          "[class*='comments-count']"
        );

        posts.push({
          postUrl,
          postId: urn,
          authorName,
          authorHeadline,
          authorProfileUrl: profileUrl,
          postContent: postContent.substring(0, 1000),
          likeCount: parseInt(likeCountEl?.textContent?.trim() || "0", 10) || 0,
          commentCount: parseInt(commentCountEl?.textContent?.trim() || "0", 10) || 0,
        });
      } catch (itemErr) {
        console.warn("[WinPilot CS] scrapeKeywordPosts: Error parsing item:", itemErr.message);
      }
    }

    console.log(`[WinPilot CS] scrapeKeywordPosts: Found ${posts.length} posts for keyword "${keyword}"`);
    return posts;
  }

  // --- SPA Navigation Detection ---

  let lastUrl = window.location.href;

  const navigationObserver = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      chrome.runtime.sendMessage({
        type: "REPORT_STATUS",
        status: "navigation",
        data: {
          page: detectPage(),
          url: currentUrl,
        },
      }).catch(() => {});
    }
  });

  navigationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // --- Dashboard → Extension bridge ───────────────────────────────────────────
  // Listens for window.postMessage events from the Next.js dashboard pages
  // and relays them to the background service worker via chrome.runtime.sendMessage.
  // This is the approved Manifest V3 pattern for page ↔ extension communication.

  window.addEventListener("message", (event) => {
    // Only accept messages from the same frame origin
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;

    switch (msg.type) {
      case "START_LEAD_GEN_REQUEST":
        chrome.runtime.sendMessage(
          { type: "START_LEAD_GEN", campaignId: msg.campaignId, options: msg.options || {} },
          () => {}
        );
        break;
      case "STOP_LEAD_GEN_REQUEST":
        chrome.runtime.sendMessage({ type: "STOP_LEAD_GEN" }, () => {});
        break;
      default:
        break;
    }
  });

  // Relay LEADGEN_PROGRESS from service worker back to the page
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "LEADGEN_PROGRESS") {
      window.postMessage(message, "*");
    }
  });

  // --- Message Listener ---

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "EXECUTE_ACTION") {
      handleAction(message)
        .then(sendResponse)
        .catch((e) =>
          sendResponse({
            status: "error",
            actionId: message.actionId,
            error: e.message,
          })
        );
      return true; // Async response
    }
  });

  // --- Init ---
  console.log("[WinPilot] Content script loaded on", detectPage());

  // Report initial page
  chrome.runtime.sendMessage({
    type: "REPORT_STATUS",
    status: "content_script_ready",
    data: {
      page: detectPage(),
      url: window.location.href,
    },
  }).catch(() => {
    // Background script not available
  });
})();
