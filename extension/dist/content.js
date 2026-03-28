// LinkedBoost Content Script
// Runs on LinkedIn pages — handles DOM interaction, page detection, and action execution

(function () {
  "use strict";

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
  // All actions use native event dispatching for anti-detection

  function dispatchNativeClick(element) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    element.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      })
    );

    element.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      })
    );

    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      })
    );
  }

  function dispatchNativeInput(element, value) {
    // Focus the element
    element.focus();
    element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

    // Set value via native input setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;

    if (element.tagName === "TEXTAREA" && nativeTextAreaValueSetter) {
      nativeTextAreaValueSetter.call(element, value);
    } else if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function scrollTo(y) {
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  // --- Action Handler ---

  async function handleAction(action) {
    try {
      switch (action.command) {
        case "CLICK": {
          const el = await waitForElement(action.selector);
          dispatchNativeClick(el);
          return { status: "success", actionId: action.actionId };
        }

        case "TYPE": {
          const el = await waitForElement(action.selector);
          dispatchNativeInput(el, action.value);
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
          console.log("[LinkedBoost CS] SCRAPE_JOB_LISTINGS: Waiting for listing elements...");
          try {
            await waitForElement(
              ".jobs-search-results__list-item, .job-card-container, .scaffold-layout__list-item, " +
              "[data-occludable-job-id], .job-card-list",
              12000
            );
            console.log("[LinkedBoost CS] SCRAPE_JOB_LISTINGS: Found listing container");
          } catch (e) {
            console.warn("[LinkedBoost CS] SCRAPE_JOB_LISTINGS: No listing elements found within timeout");
          }
          await new Promise((r) => setTimeout(r, 500));
          const jobs = scrapeJobListings();
          console.log(`[LinkedBoost CS] SCRAPE_JOB_LISTINGS: Scraped ${jobs.length} jobs`);
          if (jobs.length > 0) console.log("[LinkedBoost CS] First job:", JSON.stringify(jobs[0]));
          return {
            status: "success",
            actionId: action.actionId,
            data: { jobs },
          };
        }

        case "SCRAPE_JOB_DETAIL": {
          // Wait for the job description container to load
          console.log("[LinkedBoost CS] SCRAPE_JOB_DETAIL: Waiting for description element...");
          try {
            await waitForElement(
              "#job-details, .jobs-description__content, .jobs-box__html-content, " +
              ".jobs-description-content, [class*='jobs-description'], .show-more-less-html__markup, " +
              "[data-testid='expandable-text-box'], [componentkey^='JobDetails_AboutTheJob'], " +
              "[data-sdui-component*='aboutTheJob']",
              15000
            );
            console.log("[LinkedBoost CS] SCRAPE_JOB_DETAIL: Found description container");
          } catch (e) {
            console.warn("[LinkedBoost CS] SCRAPE_JOB_DETAIL: No description element found within timeout");
            console.warn("[LinkedBoost CS] Page URL:", window.location.href);
            console.warn("[LinkedBoost CS] Page title:", document.title);
            // Debug: log what elements ARE on the page
            const debugSelectors = [
              "#job-details", "[class*='jobs-description']", ".show-more-less-html__markup",
              "[data-testid='expandable-text-box']", "[componentkey^='JobDetails']",
              "[data-sdui-component]", "article", "section", "h2",
            ];
            for (const sel of debugSelectors) {
              const found = document.querySelectorAll(sel);
              if (found.length > 0) {
                console.log(`[LinkedBoost CS] DEBUG: Found ${found.length} element(s) matching "${sel}"`);
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
                console.log(`[LinkedBoost CS] SCRAPE_JOB_DETAIL: Content loaded after ${(i + 1) * 500}ms`);
                break;
              }
            }
          } else {
            // Legacy layout — wait for content to settle
            await new Promise((r) => setTimeout(r, 2000));
          }
          const detail = scrapeJobDetail();
          console.log(`[LinkedBoost CS] SCRAPE_JOB_DETAIL: title="${detail.title}", company="${detail.company}", description=${detail.description ? `${detail.description.length} chars` : 'EMPTY'}`);
          return {
            status: "success",
            actionId: action.actionId,
            data: { detail },
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
          await fillFormField(action.fieldIndex, action.value, action.fieldType);
          return { status: "success", actionId: action.actionId };
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

      const title = titleEl?.textContent?.trim() || "";
      const url = titleEl?.closest("a")?.href || "";
      const jobId = url.match(/\/view\/(\d+)/)?.[1] || "";

      if (title) {
        jobs.push({
          title,
          company: companyEl?.textContent?.trim() || "",
          location: locationEl?.textContent?.trim() || "",
          easyApply: !!easyApplyBadge,
          url,
          jobId,
        });
      }
    }

    return jobs;
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
        description = expandable.textContent?.trim() || expandable.innerText?.trim() || "";
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

    return { title, company, location, description, salary, url: window.location.href };
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

    // Check if SDUI Easy Apply link (navigates to apply page instead of modal)
    const isLink = btn.tagName === "A" && btn.href && btn.href.includes("/apply/");

    dispatchNativeClick(btn);

    if (isLink) {
      // SDUI: clicking the link navigates to the apply page, wait for navigation
      await new Promise((r) => setTimeout(r, 3000));
      return { clicked: true, sdui: true };
    }

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
        required: sel.required,
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
        });
      }
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
    if (element.id) return `#${element.id}`;
    if (element.name) return `[name="${element.name}"]`;
    // Build a path selector
    const path = [];
    let current = element;
    while (current && current !== document.body) {
      let sel = current.tagName.toLowerCase();
      if (current.id) {
        sel = `#${current.id}`;
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

  async function fillFormField(fieldIndex, value, fieldType) {
    const modal =
      document.querySelector(".jobs-easy-apply-modal") ||
      document.querySelector("[data-test-modal]") ||
      document.querySelector(".artdeco-modal") ||
      document.querySelector("[class*='jobs-easy-apply']") ||
      (window.location.href.includes("/apply/") ? document.body : null);
    if (!modal) throw new Error("Application modal not found");

    if (fieldType === "select") {
      const selects = modal.querySelectorAll("select");
      const sel = selects[fieldIndex];
      if (sel) {
        sel.value = value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else if (fieldType === "radio") {
      // Use CSS.escape to prevent selector injection
      const escapedValue = CSS.escape(value);
      const radios = modal.querySelectorAll(`input[type='radio'][value='${escapedValue}']`);
      if (radios.length > 0) {
        dispatchNativeClick(radios[0]);
      }
    } else {
      // Text input or textarea
      const inputs = modal.querySelectorAll("input[type='text'], input[type='number'], input[type='tel'], input[type='email'], input[type='url'], textarea");
      const input = inputs[fieldIndex];
      if (input) {
        dispatchNativeInput(input, value);
      }
    }
  }

  async function clickNextOrSubmit() {
    const modal =
      document.querySelector(".jobs-easy-apply-modal") ||
      document.querySelector("[data-test-modal]") ||
      document.querySelector(".artdeco-modal") ||
      document.querySelector("[class*='jobs-easy-apply']") ||
      (window.location.href.includes("/apply/") ? document.body : null);
    if (!modal) return { action: "none", error: "Modal not found" };

    // Look for Submit button first
    const submitBtn =
      getElementByText("button", "Submit application") ||
      modal.querySelector("[aria-label='Submit application']");
    if (submitBtn) {
      dispatchNativeClick(submitBtn);
      await new Promise((r) => setTimeout(r, 2000));
      return { action: "submitted" };
    }

    // Look for Review button
    const reviewBtn = getElementByText("button", "Review");
    if (reviewBtn) {
      dispatchNativeClick(reviewBtn);
      await new Promise((r) => setTimeout(r, 1000));
      return { action: "review" };
    }

    // Look for Next button
    const nextBtn =
      getElementByText("button", "Next") ||
      modal.querySelector("[aria-label='Continue to next step']");
    if (nextBtn) {
      dispatchNativeClick(nextBtn);
      await new Promise((r) => setTimeout(r, 1000));
      return { action: "next" };
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

    const fileInput = modal.querySelector("input[type='file']");
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
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 2000));
    return { uploaded: true };
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
    dispatchNativeClick(commentBtn);
    await new Promise((r) => setTimeout(r, 1500));

    // Find comment input
    const commentInput =
      document.querySelector(".comments-comment-box__form .ql-editor") ||
      document.querySelector("[role='textbox'][aria-label*='comment']");

    if (!commentInput) return { commented: false, error: "Comment input not found" };

    commentInput.focus();
    document.execCommand("insertText", false, commentText);
    commentInput.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 1000));

    // Submit comment
    const submitBtn =
      getElementByText("button", "Post") ||
      document.querySelector(".comments-comment-box__submit-button");

    if (submitBtn) {
      dispatchNativeClick(submitBtn);
      await new Promise((r) => setTimeout(r, 1500));
      return { commented: true };
    }

    return { commented: false, error: "Submit button not found" };
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
      }).catch(() => {
        // Background script not available
      });
    }
  });

  navigationObserver.observe(document.body, {
    childList: true,
    subtree: true,
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
  console.log("[LinkedBoost] Content script loaded on", detectPage());

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
