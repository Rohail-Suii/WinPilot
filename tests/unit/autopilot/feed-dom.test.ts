/**
 * Drives the extension's feed helpers against LinkedIn's real markup.
 *
 * LinkedIn is mid-rollout of a redesigned feed whose every class name is a
 * hashed token and whose posts carry no urn and usually no permalink. The old
 * selector-only scraper matched nothing on it and returned an empty list —
 * which the task runner reported as a clean "nothing to do", so feed mode
 * looked like it was running while doing nothing at all.
 *
 * Both DOMs are pinned here. The content script is one IIFE that MV3 loads
 * directly, so there is nothing to import; the test slices the engagement block
 * out of the source and evaluates it. If the block's boundaries move, the slice
 * fails loudly rather than silently testing nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const SOURCE = readFileSync(
  path.resolve(__dirname, "../../../extension/content/content-script.js"),
  "utf8"
);

const START = "  // --- Phase 2: Engagement Helpers ---";
const END = "  // ─── Lead Generation: scrape posts from LinkedIn search/feed";

interface FeedHelpers {
  parseFeedCard: (item: Element) => Record<string, unknown> | null;
  findFeedCards: () => Element[];
  findLikeButton: (root: Element) => Element | null;
  findCommentButton: (root: Element) => Element | null;
  isAlreadyLiked: (btn: Element) => boolean;
  accessibleName: (el: Element) => string;
}

function loadFeedHelpers(): FeedHelpers {
  const start = SOURCE.indexOf(START);
  const end = SOURCE.indexOf(END);
  expect(start, "engagement block start marker").toBeGreaterThan(-1);
  expect(end, "engagement block end marker").toBeGreaterThan(start);

  const factory = new Function(
    "HumanBehavior",
    "waitForElement",
    "getElementByText",
    "dispatchNativeClick",
    `${SOURCE.slice(start, end)}
    return { parseFeedCard, findFeedCards, findLikeButton, findCommentButton, isAlreadyLiked, accessibleName };`
  );

  return factory(
    { sleep: async () => {}, clampedGaussian: () => 0, humanClick: async () => {}, humanType: async () => {}, idleScroll: async () => {} },
    async () => null,
    () => null,
    () => {}
  ) as FeedHelpers;
}

/** A post as the redesigned feed renders it: hashed classes, no urn, no link. */
function redesignedCard(opts: { author: string; body: string; liked?: boolean }) {
  document.body.innerHTML = `
    <main>
      <div role="list" data-testid="mainFeed">
        <div class="_28da66c8 _41d1e6c9" role="listitem">
          <div class="_7e760e14" componentkey="EVzx0JQ7fIuCeMe_mX_iE9">
            <h2 class="_9f92f1a5"><span class="_34777e48">Feed post</span></h2>
            <button type="button" aria-label="Open control menu for post by ${opts.author}"></button>
            <button type="button" aria-label="Hide post by ${opts.author}"></button>
            <a href="https://www.linkedin.com/in/someone-8ba2613a0/" class="_0181a986">
              <figure><img alt="View ${opts.author}’s profile" /></figure>
            </a>
            <div class="_02dbc99e">
              <p class="_9f92f1a5" dir="ltr">${opts.body}</p>
            </div>
            <div class="_4ff8f685">
              <button type="button" aria-label="${opts.liked ? "Unlike" : "React Like"}" aria-pressed="${opts.liked ? "true" : "false"}"></button>
              <button type="button" aria-label="Comment"></button>
              <button type="button" aria-label="Repost"></button>
              <button type="button" aria-label="Send"></button>
            </div>
          </div>
        </div>
      </div>
    </main>`;
  return document.querySelector("[role='listitem']") as Element;
}

/** The same post as the legacy feed renders it. */
function legacyCard(opts: { author: string; body: string }) {
  document.body.innerHTML = `
    <div class="feed-shared-update-v2" data-urn="urn:li:activity:7290000000000000000">
      <div class="update-components-actor__title"><span aria-hidden="true">${opts.author}</span></div>
      <div class="update-components-actor__description"><span aria-hidden="true">Founder at Acme</span></div>
      <a class="update-components-actor__meta-link" href="https://www.linkedin.com/in/someone/"></a>
      <div class="update-components-text"><span class="break-words">${opts.body}</span></div>
      <div class="feed-shared-social-actions">
        <button aria-label="React Like" aria-pressed="false"></button>
        <button aria-label="Comment"></button>
      </div>
    </div>`;
  return document.querySelector(".feed-shared-update-v2") as Element;
}

const BODY =
  "we moved our RAG pipeline off pgvector and onto a managed index last quarter and the recall barely moved, the win was entirely in the chunking";

describe("parseFeedCard on the redesigned feed", () => {
  it("reads a post that has no urn, no permalink and no semantic class names", () => {
    const h = loadFeedHelpers();
    const post = h.parseFeedCard(redesignedCard({ author: "Ankit Waghamore", body: BODY }));

    expect(post).not.toBeNull();
    expect(post!.postContent).toBe(BODY);
    expect(post!.authorName).toBe("Ankit Waghamore");
  });

  it("gives a linkless post a key stable enough to dedupe on", () => {
    const h = loadFeedHelpers();
    const first = h.parseFeedCard(redesignedCard({ author: "Ankit Waghamore", body: BODY }));
    const again = h.parseFeedCard(redesignedCard({ author: "Ankit Waghamore", body: BODY }));

    expect(first!.postKey).toBe(again!.postKey);
    expect(String(first!.postKey)).toMatch(/^winpilot:post:/);

    const other = h.parseFeedCard(
      redesignedCard({ author: "Ankit Waghamore", body: `${BODY} and the eval suite caught it` })
    );
    expect(other!.postKey).not.toBe(first!.postKey);
  });

  it("finds the like and comment buttons by their labels", () => {
    const h = loadFeedHelpers();
    const card = redesignedCard({ author: "Ankit Waghamore", body: BODY });

    expect(h.accessibleName(h.findLikeButton(card)!)).toBe("React Like");
    expect(h.accessibleName(h.findCommentButton(card)!)).toBe("Comment");
  });

  it("does not re-like a post already liked", () => {
    const h = loadFeedHelpers();
    const card = redesignedCard({ author: "Ankit Waghamore", body: BODY, liked: true });

    expect(h.isAlreadyLiked(h.findLikeButton(card)!)).toBe(true);
  });

  it("passes over the share box and the sort control, which are also listitems", () => {
    const h = loadFeedHelpers();
    document.body.innerHTML = `
      <main>
        <div role="list" data-testid="mainFeed">
          <div role="listitem"><div role="button" aria-label="Start a post"><p>Start a post</p></div></div>
          <div role="listitem"><div role="button"><p>Sort by: Top</p></div></div>
        </div>
      </main>`;

    for (const card of document.querySelectorAll("[role='listitem']")) {
      expect(h.parseFeedCard(card)).toBeNull();
    }
  });

  it("passes over promoted posts", () => {
    const h = loadFeedHelpers();
    const card = redesignedCard({ author: "Acme", body: BODY });
    card.insertAdjacentHTML("afterbegin", "<span>Promoted</span>");

    expect(h.parseFeedCard(card)).toBeNull();
  });
});

describe("parseFeedCard on the legacy feed", () => {
  it("still reads the markup the old selectors were written for", () => {
    const h = loadFeedHelpers();
    const post = h.parseFeedCard(legacyCard({ author: "Ankit Waghamore", body: BODY }));

    expect(post).not.toBeNull();
    expect(post!.authorName).toBe("Ankit Waghamore");
    expect(post!.authorHeadline).toBe("Founder at Acme");
    expect(post!.postContent).toBe(BODY);
    // A urn is enough to build the permalink, so a legacy card is linkable and
    // keys on its URL rather than on a fingerprint.
    expect(post!.postUrl).toBe(
      "https://www.linkedin.com/feed/update/urn:li:activity:7290000000000000000/"
    );
    expect(post!.postKey).toBe(
      "https://www.linkedin.com/feed/update/urn:li:activity:7290000000000000000"
    );
  });
});

describe("findFeedCards", () => {
  it("finds the redesigned feed's posts", () => {
    const h = loadFeedHelpers();
    document.body.innerHTML = `
      <main>
        <div role="list" data-testid="mainFeed">
          <div role="listitem" id="a"></div>
          <div role="listitem" id="b"></div>
          <div role="listitem" id="c"></div>
        </div>
      </main>`;

    expect(h.findFeedCards().map((el) => el.id)).toEqual(["a", "b", "c"]);
  });
});
