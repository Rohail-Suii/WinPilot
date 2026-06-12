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
    async function humanType(element, text) {
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
              "[data-occludable-job-id], .job-card-list",
              12000
            );
            console.log("[WinPilot CS] SCRAPE_JOB_LISTINGS: Found listing container");
          } catch (e) {
            console.warn("[WinPilot CS] SCRAPE_JOB_LISTINGS: No listing elements found within timeout");
          }
          await new Promise((r) => setTimeout(r, 500));
          const jobs = scrapeJobListings();
          console.log(`[WinPilot CS] SCRAPE_JOB_LISTINGS: Scraped ${jobs.length} jobs`);
          if (jobs.length > 0) console.log("[WinPilot CS] First job:", JSON.stringify(jobs[0]));
          return {
            status: "success",
            actionId: action.actionId,
            data: { jobs },
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
          const commentResult = await commentOnPost(action.selector, action.comment);
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
    const skillsSet = new Set<string>();
    skillEls.forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length < 60) skillsSet.add(text);
    });
    const skills = [...skillsSet].slice(0, 30);

    // Experience
    const experience: { title: string; company: string; duration: string; description: string }[] = [];
    const expSection = document.querySelector(
      "#experience ~ .pvs-list__outer-container, section[id='experience-section']"
    );
    if (expSection) {
      const expItems = expSection.querySelectorAll("li.pvs-list__paged-list-item");
      for (const item of Array.from(expItems).slice(0, 10)) {
        const spans = item.querySelectorAll("span[aria-hidden='true']");
        const texts = Array.from(spans)
          .map((s) => s.textContent?.trim())
          .filter(Boolean) as string[];
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
    const education: { school: string; degree: string; field: string }[] = [];
    const eduSection = document.querySelector(
      "#education ~ .pvs-list__outer-container, section[id='education-section']"
    );
    if (eduSection) {
      const eduItems = eduSection.querySelectorAll("li.pvs-list__paged-list-item");
      for (const item of Array.from(eduItems).slice(0, 5)) {
        const spans = item.querySelectorAll("span[aria-hidden='true']");
        const texts = Array.from(spans)
          .map((s) => s.textContent?.trim())
          .filter(Boolean) as string[];
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
    const certifications: { name: string; issuingOrg: string }[] = [];
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
          .filter(Boolean) as string[];
        if (texts.length >= 1) {
          certifications.push({
            name: texts[0] || "",
            issuingOrg: texts[1] || "",
          });
        }
      }
    }

    // Featured
    const featured: { type: string; title: string }[] = [];
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

  function scrapeJobListings() {
    const jobCards = document.querySelectorAll(
      ".jobs-search-results__list-item, .job-card-container, .scaffold-layout__list-item, " +
      ".jobs-search-results-list__list-item, [data-occludable-job-id], " +
      "li.jobs-search-results__list-item, .job-card-list"
    );
    const jobs = [];

    for (const card of jobCards) {
      const titleEl =
        card.querySelector(".job-card-list__title, .job-card-container__link, .job-card-list__title--link") ||
        card.querySelector("a[data-control-name], a.job-card-container__link, a.job-card-list__title--link") ||
        card.querySelector("a[href*='/jobs/view/']");
      const companyEl = card.querySelector(
        ".job-card-container__primary-description, .artdeco-entity-lockup__subtitle, " +
        ".job-card-container__company-name, .artdeco-entity-lockup__subtitle span"
      );
      const locationEl = card.querySelector(
        ".job-card-container__metadata-item, .artdeco-entity-lockup__caption, " +
        ".job-card-container__metadata-wrapper span"
      );
      const easyApplyBadge = card.querySelector(
        ".job-card-container__apply-method, [data-test-job-card-easy-apply], " +
        ".job-card-container__footer-item--highlighted, " +
        "li-icon[type='linkedin-bug']"
      );
      const easyApplyLabel = card.querySelector(
        "[aria-label*='Easy Apply'], [data-control-name*='easy_apply'], [class*='apply-method']"
      );
      const cardText = (card.textContent || "").toLowerCase();
      const easyApplyByText = cardText.includes("easy apply");
      const appliedBadge = card.querySelector(
        ".job-card-container__footer-item--success, [data-test-job-card-applied], .artdeco-inline-feedback"
      );
      const alreadyApplied =
        !!appliedBadge ||
        cardText.includes("applied") ||
        cardText.includes("application submitted") ||
        cardText.includes("submitted");

      const title = titleEl?.textContent?.trim() || "";
      const url = titleEl?.closest("a")?.href || "";
      const jobId = url.match(/\/view\/(\d+)/)?.[1] || "";

      if (title) {
        jobs.push({
          title,
          company: companyEl?.textContent?.trim() || "",
          location: locationEl?.textContent?.trim() || "",
          easyApply: !!easyApplyBadge || !!easyApplyLabel || easyApplyByText,
          applied: alreadyApplied,
          url,
          jobId,
        });
      }
    }

    return jobs;
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
    };
  }

  // --- Phase 2: Easy Apply Helpers ---

  async function clickEasyApply() {
    // SDUI layout uses <a> with aria-label, legacy uses <button>
    const btn =
      document.querySelector("a[aria-label*='Easy Apply']") ||
      document.querySelector("[aria-label='Easy Apply to this job']") ||
      document.querySelector(".jobs-apply-button") ||
      document.querySelector("[data-control-name='jobdetails_topcard_inapply']") ||
      document.querySelector("button.jobs-apply-button--top-card") ||
      getElementByText("a", "Easy Apply") ||
      getElementByText("button", "Easy Apply") ||
      getElementByText("button", "Apply");

    if (!btn) {
      return { clicked: false, error: "Easy Apply button not found" };
    }

    // Simulate reading the job before clicking apply (human behavior)
    await HumanBehavior.idleScroll();
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(500, 1500));

    // Check if SDUI Easy Apply link (navigates to apply page instead of modal)
    const isLink = btn.tagName === "A" && btn.href && btn.href.includes("/apply/");

    if (isLink) {
      // Return immediately so the message channel can respond before navigation unloads the page.
      const urlBefore = window.location.href;
      const targetUrl = btn.href;
      // Human-like click on the link
      await dispatchNativeClickAsync(btn);

      // If click doesn't navigate promptly, force it shortly after.
      setTimeout(() => {
        if (window.location.href === urlBefore && targetUrl) {
          window.location.href = targetUrl;
        }
      }, 200);

      return { clicked: true, sdui: true };
    }

    await dispatchNativeClickAsync(btn);

    // Legacy: wait for modal to appear
    try {
      await waitForElement(
        ".jobs-easy-apply-modal, [data-test-modal], .artdeco-modal",
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

    // Text inputs
    const inputs = modal.querySelectorAll("input[type='text'], input[type='number'], input[type='tel'], input[type='email'], input[type='url']");
    for (const input of inputs) {
      const label = input.closest(".fb-dash-form-element")?.querySelector("label")?.textContent?.trim() ||
        input.getAttribute("aria-label") || input.getAttribute("placeholder") || "";
      fields.push({
        type: "text",
        inputType: input.type || "text",
        label,
        value: input.value,
        selector: buildSelector(input),
        required: input.required || input.getAttribute("aria-required") === "true",
      });
    }

    // Textareas
    const textareas = modal.querySelectorAll("textarea");
    for (const ta of textareas) {
      const label = ta.closest(".fb-dash-form-element")?.querySelector("label")?.textContent?.trim() ||
        ta.getAttribute("aria-label") || "";
      fields.push({
        type: "textarea",
        label,
        value: ta.value,
        selector: buildSelector(ta),
        required: ta.required,
      });
    }

    // Selects (dropdowns)
    const selects = modal.querySelectorAll("select");
    for (const sel of selects) {
      const label = sel.closest(".fb-dash-form-element")?.querySelector("label")?.textContent?.trim() ||
        sel.getAttribute("aria-label") || "";
      const options = Array.from(sel.options).map((o) => ({
        value: o.value,
        text: o.textContent?.trim() || "",
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

      const label = control.closest(".fb-dash-form-element")?.querySelector("label")?.textContent?.trim() ||
        control.getAttribute("aria-label") || "";
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

    // Radio buttons
    const radioGroups = modal.querySelectorAll("fieldset, [role='radiogroup']");
    for (const group of radioGroups) {
      const legend = group.querySelector("legend, .fb-dash-form-element__label")?.textContent?.trim() || "";
      const radios = group.querySelectorAll("input[type='radio']");
      const options = Array.from(radios).map((r) => ({
        value: r.value,
        label: r.closest("label")?.textContent?.trim() || r.nextElementSibling?.textContent?.trim() || "",
        selector: buildSelector(r),
      }));
      if (options.length > 0) {
        fields.push({
          type: "radio",
          label: legend,
          options,
          value: group.querySelector("input[type='radio']:checked")?.value || "",
          required:
            group.querySelector("input[type='radio'][required]") !== null ||
            group.getAttribute("aria-required") === "true",
        });
      }
    }

    // Checkboxes
    const checkboxes = modal.querySelectorAll("input[type='checkbox']");
    for (const cb of checkboxes) {
      const label =
        cb.closest("label")?.textContent?.trim() ||
        cb.closest(".fb-dash-form-element")?.querySelector("label")?.textContent?.trim() ||
        cb.getAttribute("aria-label") ||
        "Consent checkbox";
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
      const label = fi.closest(".fb-dash-form-element")?.querySelector("label")?.textContent?.trim() ||
        fi.getAttribute("aria-label") || "Resume/CV Upload";
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
        dispatchNativeClick(bySelector);
        return;
      }
      // Use CSS.escape to prevent selector injection
      const escapedValue = CSS.escape(value);
      const radios = modal.querySelectorAll(`input[type='radio'][value='${escapedValue}']`);
      if (radios.length > 0) {
        dispatchNativeClick(radios[0]);
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

  async function likePost(postSelector) {
    const post = postSelector
      ? document.querySelector(postSelector)
      : null;
    const likeBtn = post
      ? post.querySelector("[data-test-action='like'], button[aria-label*='Like']")
      : document.querySelector("[data-test-action='like'], button[aria-label*='Like']");

    if (!likeBtn) return { liked: false, error: "Like button not found" };

    // Check if already liked
    const isLiked = likeBtn.getAttribute("aria-pressed") === "true" ||
      likeBtn.classList.contains("react-button--active");
    if (isLiked) return { liked: false, alreadyLiked: true };

    dispatchNativeClick(likeBtn);
    await new Promise((r) => setTimeout(r, 500));
    return { liked: true };
  }

  async function commentOnPost(postSelector, commentText) {
    const post = postSelector
      ? document.querySelector(postSelector)
      : null;

    // Click comment button to open comment box
    const commentBtn = post
      ? post.querySelector("button[aria-label*='Comment'], button[aria-label*='comment']")
      : document.querySelector("button[aria-label*='Comment'], button[aria-label*='comment']");

    if (!commentBtn) return { commented: false, error: "Comment button not found" };

    await HumanBehavior.humanClick(commentBtn);
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(1200, 2500));

    // Find comment input — try multiple selectors LinkedIn uses
    const commentInput =
      document.querySelector(".comments-comment-box__form .ql-editor") ||
      document.querySelector(".comments-comment-box .ql-editor") ||
      document.querySelector("[role='textbox'][aria-label*='comment']") ||
      document.querySelector("[role='textbox'][aria-label*='Comment']") ||
      document.querySelector(".comments-comment-texteditor .ql-editor");

    if (!commentInput) return { commented: false, error: "Comment input not found" };

    // Use human-like typing for the comment
    await HumanBehavior.humanType(commentInput, commentText);

    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(800, 1800));

    // Submit comment — try multiple selectors
    const submitBtn =
      document.querySelector(".comments-comment-box__submit-button:not([disabled])") ||
      document.querySelector("[class*='comments-comment-box'] button[type='submit']") ||
      getElementByText("button", "Post") ||
      document.querySelector("form.comments-comment-box button.artdeco-button--primary");

    if (submitBtn) {
      await HumanBehavior.humanClick(submitBtn);
      await HumanBehavior.sleep(HumanBehavior.clampedGaussian(1500, 3000));
      return { commented: true };
    }

    return { commented: false, error: "Submit button not found" };
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
