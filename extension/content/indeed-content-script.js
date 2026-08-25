// WinPilot Content Script — Indeed
// Runs on indeed.com pages (matched with all_frames: true, since the Indeed
// Apply / SmartApply form commonly renders inside a smartapply.indeed.com
// iframe rather than the top-level document). Each frame runs an independent
// copy of this script and only responds to EXECUTE_ACTION messages the
// background worker specifically routes to its frameId.
//
// Selectors below are a best-effort scaffold against Indeed's known/typical
// markup — not verified against a live account. Expect to iterate on these
// (see docs/plan) once tested against a real Indeed session.

(function () {
  "use strict";

  const isTopFrame = window.top === window.self;

  // ═══════════════════════════════════════════════════════════
  // HUMAN BEHAVIOR SIMULATION MODULE
  // Same anti-detection primitives as the LinkedIn content script — generic
  // DOM/event simulation, no LinkedIn coupling, so kept structurally identical.
  // ═══════════════════════════════════════════════════════════

  const HumanBehavior = (() => {
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

    function bezierPoint(t, p0, p1, p2, p3) {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    }

    async function moveMouseTo(targetX, targetY, steps) {
      const numSteps = steps || clampedGaussian(15, 35);
      const startX = targetX + clampedGaussian(-300, 300);
      const startY = targetY + clampedGaussian(-200, 200);
      const cp1x = startX + (targetX - startX) * 0.3 + clampedGaussian(-50, 50);
      const cp1y = startY + (targetY - startY) * 0.1 + clampedGaussian(-40, 40);
      const cp2x = startX + (targetX - startX) * 0.7 + clampedGaussian(-30, 30);
      const cp2y = startY + (targetY - startY) * 0.9 + clampedGaussian(-20, 20);

      for (let i = 0; i <= numSteps; i++) {
        const t = i / numSteps;
        const easedT = 1 - Math.pow(1 - t, 2.5);
        const x = bezierPoint(easedT, startX, cp1x, cp2x, targetX);
        const y = bezierPoint(easedT, startY, cp1y, cp2y, targetY);
        document.dispatchEvent(
          new MouseEvent("mousemove", {
            bubbles: true,
            cancelable: true,
            clientX: x + clampedGaussian(-2, 2),
            clientY: y + clampedGaussian(-1, 1),
            view: window,
          })
        );
        const baseDelay = t > 0.8 ? clampedGaussian(8, 20) : clampedGaussian(3, 10);
        await sleep(baseDelay);
      }
    }

    async function hoverElement(element) {
      const rect = element.getBoundingClientRect();
      const offsetX = clampedGaussian(-rect.width * 0.2, rect.width * 0.2);
      const offsetY = clampedGaussian(-rect.height * 0.15, rect.height * 0.15);
      const x = rect.left + rect.width / 2 + offsetX;
      const y = rect.top + rect.height / 2 + offsetY;
      await moveMouseTo(x, y);
      element.dispatchEvent(
        new MouseEvent("mouseenter", { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window })
      );
      element.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window })
      );
      await sleep(clampedGaussian(80, 250));
      return { x, y };
    }

    async function humanClick(element) {
      if (element.getBoundingClientRect) {
        const rect = element.getBoundingClientRect();
        const isVisibleInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!isVisibleInViewport) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(clampedGaussian(300, 700));
        }
      }
      const { x, y } = await hoverElement(element);
      element.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 })
      );
      await sleep(clampedGaussian(50, 150));
      element.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 })
      );
      await sleep(clampedGaussian(5, 20));
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 })
      );
    }

    async function humanType(element, text) {
      element.focus();
      element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      await sleep(clampedGaussian(100, 300));

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      const setter = element.tagName === "TEXTAREA" ? nativeTextAreaValueSetter : nativeInputValueSetter;
      if (setter && element.value) {
        setter.call(element, "");
        element.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(clampedGaussian(50, 150));
      }

      const chars = text.split("");
      let typed = "";
      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        typed += char;
        element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true, cancelable: true }));
        if (setter) setter.call(element, typed);
        element.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true, cancelable: true }));

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

    function fastInput(element, value) {
      element.focus();
      element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (element.tagName === "TEXTAREA" && nativeTextAreaValueSetter) {
        nativeTextAreaValueSetter.call(element, value);
      } else if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async function naturalScroll(targetY, duration) {
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
          const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          window.scrollTo(0, startY + distance * eased);
          if (progress < 1) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
    }

    async function idleScroll() {
      const scrollAmount = clampedGaussian(50, 300);
      const direction = Math.random() > 0.3 ? 1 : -1;
      const targetY = Math.max(0, window.scrollY + scrollAmount * direction);
      await naturalScroll(targetY, clampedGaussian(400, 800));
    }

    async function microMovements() {
      const count = clampedGaussian(2, 6);
      for (let i = 0; i < count; i++) {
        const x = clampedGaussian(100, window.innerWidth - 100);
        const y = clampedGaussian(100, window.innerHeight - 100);
        document.dispatchEvent(
          new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window })
        );
        await sleep(clampedGaussian(50, 200));
      }
    }

    async function simulateIdleActivity() {
      const action = Math.random();
      if (action < 0.4) await idleScroll();
      else if (action < 0.7) await microMovements();
      else await sleep(clampedGaussian(500, 2000));
    }

    // --- Check if Indeed has signed the user out ---
    function isSignedOut() {
      const url = window.location.href;
      if (url.includes("/account/login") || url.includes("/registration")) return true;
      const signInBtn = document.querySelector(
        'a[href*="/account/login"], button[data-gnav-element-name="SignIn"]'
      );
      if (signInBtn && signInBtn.offsetParent !== null) return true;
      return false;
    }

    // --- Check for an Indeed bot-check / captcha interstitial ---
    function isSecurityChallenge() {
      const url = window.location.href;
      if (url.includes("/captcha") || url.includes("/challenge")) return true;
      const bodyText = (document.body?.textContent || "").substring(0, 3000).toLowerCase();
      return (
        bodyText.includes("verify you are a human") ||
        bodyText.includes("additional verification required") ||
        bodyText.includes("unusual traffic")
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
    if (!isTopFrame) return "apply-frame";
    if (url.includes("/viewjob")) return "job-detail";
    if (url.includes("/jobs")) return "search";
    if (url.includes("smartapply") || url.includes("/apply")) return "apply";
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

  async function dispatchNativeClickAsync(element) {
    await HumanBehavior.humanClick(element);
  }

  async function dispatchNativeInput(element, value) {
    const isShortValue = !value || value.length <= 8 || /^\d+$/.test(value) || value.includes("://");
    if (isShortValue) {
      HumanBehavior.fastInput(element, value);
    } else {
      await HumanBehavior.humanType(element, value);
    }
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent === null && el.getClientRects?.().length === 0) return false;
    return true;
  }

  function isEnabled(el) {
    return !!el && !el.disabled && el.getAttribute("aria-disabled") !== "true";
  }

  function buildSelector(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    if (element.name) return `[name="${CSS.escape(element.name)}"]`;
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
        const siblings = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
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

  // --- Job listing scrape (search-results page, top frame only) ---

  function extractJobIdFromCard(card, url) {
    const dataJk = card.getAttribute?.("data-jk") || card.querySelector?.("[data-jk]")?.getAttribute("data-jk");
    if (dataJk) return dataJk;
    if (url) {
      const m = url.match(/[?&](?:jk|vjk)=([0-9a-f]+)/i);
      if (m) return m[1];
    }
    return "";
  }

  function scrapeJobListings() {
    const jobCards = document.querySelectorAll(
      "div.job_seen_beacon, .cardOutline, td.resultContent, [data-jk], li.eu4oa1w0"
    );
    const jobs = [];
    const seenIds = new Set();

    for (const card of jobCards) {
      const titleEl = card.querySelector("h2.jobTitle a, h2.jobTitle span[title], a.jcs-JobTitle");
      const companyEl = card.querySelector('[data-testid="company-name"], .companyName');
      const locationEl = card.querySelector('[data-testid="text-location"], .companyLocation');
      const cardText = (card.innerText || card.textContent || "").toLowerCase();
      const easyApplyFlag = /\beasily apply\b|\bindeed apply\b/.test(cardText) ? true : null;
      const alreadyApplied = /\bapplied\b/.test(cardText);

      const title = (titleEl?.textContent || "").replace(/\s+/g, " ").trim();
      if (!title) continue;

      const anchor = titleEl?.tagName === "A" ? titleEl : titleEl?.closest?.("a");
      let url = anchor?.href || "";
      let jobId = extractJobIdFromCard(card, url);
      if (!url && jobId) {
        url = `https://www.indeed.com/viewjob?jk=${jobId}`;
      }
      if (!url && !jobId) continue;

      const dedupeKey = jobId || url || title;
      if (seenIds.has(dedupeKey)) continue;
      seenIds.add(dedupeKey);

      jobs.push({
        title,
        company: (companyEl?.textContent || "").replace(/\s+/g, " ").trim(),
        location: (locationEl?.textContent || "").replace(/\s+/g, " ").trim(),
        easyApply: easyApplyFlag,
        applied: alreadyApplied,
        url,
        jobId: String(jobId || ""),
      });
    }

    return jobs;
  }

  function detectNoResultsState() {
    const bodyText = (document.body?.textContent || "").toLowerCase();
    return bodyText.includes("no jobs found") || bodyText.includes("did not match any jobs");
  }

  // --- Job detail scrape (right-hand pane or dedicated /viewjob page) ---

  function getJobDetailRoot() {
    return (
      document.querySelector("#jobsearch-ViewjobPaneWrapper") ||
      document.querySelector("#viewJobSSRRoot") ||
      document.querySelector("[data-testid='jobsearch-JobComponent']") ||
      document
    );
  }

  function scrapeJobDetail() {
    const root = getJobDetailRoot();
    const title =
      root.querySelector("h1.jobsearch-JobInfoHeader-title, h2.jobTitle")?.textContent?.trim() ||
      document.title.replace(/\s*-\s*Indeed\.com.*$/i, "").trim();
    const company =
      root.querySelector('[data-testid="inlineHeader-companyName"], [data-testid="jobsearch-CompanyInfoContainer"] a')
        ?.textContent?.trim() || "";
    const location =
      root.querySelector('[data-testid="inlineHeader-companyLocation"], [data-testid="job-location"]')
        ?.textContent?.trim() || "";
    const descriptionEl = root.querySelector("#jobDescriptionText, .jobsearch-JobComponent-description");
    const description = (descriptionEl?.innerText || descriptionEl?.textContent || "").trim();
    const applyBtn = findApplyButton(root);
    const isIndeedApply = !!applyBtn && !/apply on company site/i.test(applyBtn.textContent || "");

    return { title, company, location, description, easyApply: isIndeedApply };
  }

  async function selectJobFromList(jobId, jobUrl) {
    let card = null;
    if (jobId) {
      card = document.querySelector(`[data-jk="${CSS.escape(jobId)}"]`);
    }
    if (!card && jobUrl) {
      card = Array.from(document.querySelectorAll("a[href]")).find((a) => a.href === jobUrl)?.closest(
        "div.job_seen_beacon, .cardOutline, td.resultContent"
      );
    }
    if (!card) return { selected: false, error: "Job card not found in current list" };

    const titleLink = card.querySelector("h2.jobTitle a, a.jcs-JobTitle") || card;
    await HumanBehavior.idleScroll();
    await dispatchNativeClickAsync(titleLink);

    try {
      await waitForElement("#jobsearch-ViewjobPaneWrapper, #viewJobSSRRoot", 8000);
    } catch {
      // Detail pane may already be open, or the click navigated directly
    }
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(500, 1200));
    return { selected: true };
  }

  async function clickPaginationNext() {
    const nextBtn =
      document.querySelector('a[data-testid="pagination-page-next"]') ||
      document.querySelector('a[aria-label="Next Page"]') ||
      document.querySelector('a[aria-label="Next"]');
    if (!nextBtn || !isVisible(nextBtn)) {
      return { clicked: false, error: "No next-page control found" };
    }
    await HumanBehavior.idleScroll();
    await dispatchNativeClickAsync(nextBtn);
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(800, 1800));
    return { clicked: true };
  }

  // --- Apply flow ---

  function findApplyButton(root = getJobDetailRoot()) {
    const candidates = [
      root.querySelector("#indeedApplyButton"),
      root.querySelector("button[id*='indeedApplyButton']"),
      root.querySelector("button[aria-label*='Apply now']"),
      root.querySelector(".jobsearch-IndeedApplyButton-newDesign"),
      root.querySelector("[data-testid='indeedApplyButton']"),
    ].filter(Boolean);

    for (const el of candidates) {
      if (isVisible(el)) return el;
    }

    for (const tag of ["button", "a"]) {
      const nodes = root.querySelectorAll(tag);
      for (const el of nodes) {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (t === "apply now" || t.startsWith("apply now")) return el;
      }
    }

    return null;
  }

  async function clickApply() {
    const root = getJobDetailRoot();
    const btn = findApplyButton(root);
    if (!btn) return { clicked: false, error: "Apply button not found" };

    await HumanBehavior.idleScroll();
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(500, 1500));
    await dispatchNativeClickAsync(btn);

    // Indeed Apply typically opens a smartapply.indeed.com iframe; give it time
    // to attach before the background worker looks for its frameId.
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(1200, 2200));
    return { clicked: true };
  }

  // --- Form field discovery / filling (runs against whichever document this
  // frame owns — the top page for a same-document apply flow, or the
  // SmartApply iframe's own document when the form lives there) ---

  function getFormRoot() {
    return (
      document.querySelector("#ia-container") ||
      document.querySelector("form") ||
      document.body
    );
  }

  function cleanLabelText(text) {
    return (text || "").replace(/\s+/g, " ").replace(/\*$/, "").trim();
  }

  function findQuestionLabelNear(el) {
    if (el.id) {
      const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (forLabel) {
        const t = cleanLabelText(forLabel.textContent);
        if (t) return t;
      }
    }
    const wrapped = el.closest("label");
    if (wrapped) {
      const t = cleanLabelText(wrapped.textContent);
      if (t) return t;
    }
    const aria = el.getAttribute("aria-label") || el.getAttribute("placeholder") || "";
    if (aria.trim()) return cleanLabelText(aria);

    // Fall back to the nearest preceding heading/label-like text
    let node = el.parentElement;
    for (let depth = 0; depth < 6 && node; depth++) {
      let prev = node.previousElementSibling;
      while (prev) {
        if (["P", "LABEL", "LEGEND"].includes(prev.tagName) || prev.getAttribute("role") === "heading") {
          const t = cleanLabelText(prev.textContent);
          if (t && t.length > 2 && t.length < 300) return t;
        }
        prev = prev.previousElementSibling;
      }
      node = node.parentElement;
    }
    return "";
  }

  function radioOptionLabel(radio) {
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
    return cleanLabelText(radio.nextElementSibling?.textContent || radio.value || "");
  }

  function extractMaxLength(input) {
    if (input.maxLength && input.maxLength > 0 && input.maxLength < 100000) return input.maxLength;
    return undefined;
  }

  function getFormFields() {
    const root = getFormRoot();
    const fields = [];

    const inputs = root.querySelectorAll(
      "input[type='text'], input[type='number'], input[type='tel'], input[type='email'], input[type='url']"
    );
    for (const input of inputs) {
      if (!isVisible(input) && !input.required) continue;
      const label = findQuestionLabelNear(input);
      fields.push({
        type: "text",
        inputType: input.type || "text",
        label,
        value: input.value,
        selector: buildSelector(input),
        required: input.required || input.getAttribute("aria-required") === "true",
        maxLength: extractMaxLength(input),
      });
    }

    const textareas = root.querySelectorAll("textarea");
    for (const ta of textareas) {
      const label = findQuestionLabelNear(ta);
      fields.push({
        type: "textarea",
        label,
        value: ta.value,
        selector: buildSelector(ta),
        required: ta.required || ta.getAttribute("aria-required") === "true",
        maxLength: extractMaxLength(ta),
      });
    }

    const selects = root.querySelectorAll("select");
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

    // Radio groups — one field entry per group name, options list from members
    const radios = Array.from(root.querySelectorAll("input[type='radio']"));
    const radioGroups = new Map();
    for (const radio of radios) {
      const name = radio.name || buildSelector(radio);
      if (!radioGroups.has(name)) radioGroups.set(name, []);
      radioGroups.get(name).push(radio);
    }
    for (const [name, group] of radioGroups) {
      const first = group[0];
      const label = findQuestionLabelNear(first.closest("fieldset") || first);
      fields.push({
        type: "radio",
        label,
        value: group.find((r) => r.checked)?.value || "",
        options: group.map((r) => ({ value: r.value, text: radioOptionLabel(r), label: radioOptionLabel(r) })),
        selector: `input[name="${CSS.escape(name)}"]`,
        required: first.required,
      });
    }

    return fields;
  }

  async function fillFormField(fieldIndex, value, fieldType, selector) {
    const root = getFormRoot();
    const el = selector ? root.querySelector(selector) || document.querySelector(selector) : null;
    if (!el) return { filled: false, error: "Field not found" };

    if (fieldType === "select") {
      const option = Array.from(el.options || []).find(
        (o) => o.value === value || o.textContent?.trim() === value
      );
      if (option) {
        el.value = option.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return { filled: !!option };
    }

    if (fieldType === "radio") {
      const group = root.querySelectorAll(`input[name="${CSS.escape(el.name || "")}"]`);
      const target = Array.from(group).find(
        (r) => r.value === value || radioOptionLabel(r).toLowerCase() === String(value).toLowerCase()
      );
      if (target) {
        await dispatchNativeClickAsync(target);
        return { filled: true };
      }
      return { filled: false, error: "No matching radio option" };
    }

    await dispatchNativeInput(el, value ?? "");
    return { filled: true };
  }

  async function autoSelectDropdowns() {
    const root = getFormRoot();
    let selected = 0;
    const selects = root.querySelectorAll("select");
    for (const sel of selects) {
      if (sel.value) continue;
      const options = Array.from(sel.options).filter((o) => !o.disabled);
      const yes = options.find((o) => /^yes$/i.test((o.textContent || "").trim()));
      const chosen = yes || options.find((o) => (o.value || "").trim()) || options[0];
      if (chosen) {
        sel.value = chosen.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        selected++;
        await HumanBehavior.sleep(HumanBehavior.clampedGaussian(100, 300));
      }
    }
    return { selected };
  }

  async function clickNextOrSubmit() {
    const root = getFormRoot();
    const candidates = [
      root.querySelector("button[type='submit']"),
      root.querySelector("button[aria-label*='Continue']"),
      root.querySelector("button[aria-label*='Submit']"),
      root.querySelector("button[aria-label*='Review']"),
    ].filter(Boolean);

    let btn = candidates.find(isVisible);
    if (!btn) {
      const buttons = root.querySelectorAll("button");
      for (const el of buttons) {
        const t = (el.textContent || "").trim().toLowerCase();
        if (["continue", "next", "review", "submit", "submit your application"].includes(t)) {
          btn = el;
          break;
        }
      }
    }
    if (!btn || !isEnabled(btn)) {
      return { clicked: false, action: "blocked", error: "No next/submit control found" };
    }

    const label = (btn.textContent || "").trim().toLowerCase();
    const isFinalSubmit = /submit/.test(label);
    await dispatchNativeClickAsync(btn);
    await HumanBehavior.sleep(HumanBehavior.clampedGaussian(800, 1800));
    return { clicked: true, action: isFinalSubmit ? "submitted" : "next" };
  }

  async function uploadResume(fileDataB64, fileName) {
    const root = getFormRoot();
    const fileInputs = Array.from(root.querySelectorAll("input[type='file']"));
    if (fileInputs.length === 0) return { uploaded: false, error: "File input not found" };

    const findResumeInput = () => {
      for (const input of fileInputs) {
        const hint = [
          input.id || "",
          input.name || "",
          input.getAttribute("aria-label") || "",
          input.closest("label")?.textContent || "",
        ]
          .join(" ")
          .toLowerCase();
        if (hint.includes("resume") || hint.includes("cv")) return input;
      }
      return fileInputs[0];
    };

    const fileInput = findResumeInput();
    if (!fileInput) return { uploaded: false, error: "File input not found" };

    const byteChars = atob(fileDataB64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const file = new File([byteArr], fileName || "resume.pdf", { type: "application/pdf" });

    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 2000));
    return { uploaded: true, fileName: file.name };
  }

  // --- Action Handler ---

  async function handleAction(action) {
    try {
      if (action.command === "PING") {
        return {
          status: "success",
          actionId: action.actionId,
          data: { isTopFrame, href: window.location.href, readyState: document.readyState },
        };
      }

      if (HumanBehavior.isSignedOut()) {
        return {
          status: "error",
          actionId: action.actionId,
          error: "INDEED_SIGNED_OUT",
          message: "Indeed has signed you out. Please sign in again.",
        };
      }
      if (HumanBehavior.isSecurityChallenge()) {
        return {
          status: "error",
          actionId: action.actionId,
          error: "INDEED_SECURITY_CHALLENGE",
          message: "Indeed security challenge detected. Please complete it manually.",
        };
      }

      if (Math.random() < 0.3) {
        await HumanBehavior.simulateIdleActivity();
      }

      switch (action.command) {
        case "GET_PAGE_INFO": {
          return {
            status: "success",
            actionId: action.actionId,
            data: { url: window.location.href, page: detectPage(), isTopFrame },
          };
        }

        case "SCRAPE_JOB_LISTINGS": {
          try {
            await waitForElement("div.job_seen_beacon, .cardOutline, [data-jk]", 12000);
          } catch {
            // fall through — scrapeJobListings() below handles an empty result
          }
          await new Promise((r) => setTimeout(r, 500));
          const jobs = scrapeJobListings();
          const noResultsConfirmed = jobs.length === 0 && detectNoResultsState();
          return { status: "success", actionId: action.actionId, data: { jobs, noResultsConfirmed } };
        }

        case "SCRAPE_JOB_DETAIL": {
          try {
            await waitForElement("#jobDescriptionText, .jobsearch-JobComponent-description", 15000);
          } catch {
            // description container may not have loaded — scrapeJobDetail() reports what it can
          }
          await new Promise((r) => setTimeout(r, 500));
          const detail = scrapeJobDetail();
          return { status: "success", actionId: action.actionId, data: { detail } };
        }

        case "SELECT_JOB_FROM_LIST": {
          const result = await selectJobFromList(action.jobId, action.jobUrl);
          return { status: "success", actionId: action.actionId, data: result };
        }

        case "CLICK_PAGINATION_NEXT": {
          const result = await clickPaginationNext();
          return { status: "success", actionId: action.actionId, data: result };
        }

        case "CLICK_EASY_APPLY": {
          const result = await clickApply();
          return { status: "success", actionId: action.actionId, data: result };
        }

        case "GET_FORM_FIELDS": {
          const fields = getFormFields();
          return { status: "success", actionId: action.actionId, data: { fields } };
        }

        case "FILL_FORM_FIELD": {
          const result = await fillFormField(action.fieldIndex, action.value, action.fieldType, action.selector);
          return { status: "success", actionId: action.actionId, data: result };
        }

        case "AUTO_SELECT_DROPDOWNS": {
          const result = await autoSelectDropdowns();
          return { status: "success", actionId: action.actionId, data: result };
        }

        case "CLICK_NEXT_OR_SUBMIT": {
          const result = await clickNextOrSubmit();
          return { status: "success", actionId: action.actionId, data: result };
        }

        case "UPLOAD_RESUME": {
          const result = await uploadResume(action.fileData, action.fileName);
          return { status: "success", actionId: action.actionId, data: result };
        }

        case "NAVIGATE": {
          window.location.href = action.url;
          return { status: "success", actionId: action.actionId };
        }

        case "CHECK_SESSION": {
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
          const duration = action.duration || HumanBehavior.clampedGaussian(3000, 8000);
          const iterations = Math.floor(duration / 1000);
          for (let i = 0; i < iterations; i++) {
            await HumanBehavior.simulateIdleActivity();
            await HumanBehavior.sleep(HumanBehavior.clampedGaussian(400, 1200));
          }
          return { status: "success", actionId: action.actionId };
        }

        default:
          return {
            status: "error",
            actionId: action.actionId,
            error: "UNSUPPORTED_ACTION",
            message: `Indeed content script does not implement ${action.command}`,
          };
      }
    } catch (e) {
      return { status: "error", actionId: action.actionId, error: e.message };
    }
  }

  // --- Message Listener ---

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "EXECUTE_ACTION") {
      handleAction(message)
        .then(sendResponse)
        .catch((e) => sendResponse({ status: "error", actionId: message.actionId, error: e.message }));
      return true; // Async response
    }
  });

  // --- Init ---
  console.log("[WinPilot] Indeed content script loaded on", detectPage(), isTopFrame ? "(top frame)" : "(sub-frame)");

  chrome.runtime
    .sendMessage({
      type: "REPORT_STATUS",
      status: "content_script_ready",
      data: { page: detectPage(), url: window.location.href, platform: "indeed", isTopFrame },
    })
    .catch(() => {
      // Background script not available
    });
})();
