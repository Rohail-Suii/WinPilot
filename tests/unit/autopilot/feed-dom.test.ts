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
  visibleText: (el: Element) => string;
  findCommentInput: (scope: Element | Document) => Element | null;
  findCommentSubmit: (scope: Element | Document, input: Element | null) => Element | null;
  newlyEnabled: (before: Element[]) => Element | null;
  disabledNear: (input: Element, ceiling?: Element | Document) => Element[];
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
    return { parseFeedCard, findFeedCards, findLikeButton, findCommentButton, isAlreadyLiked, accessibleName, visibleText, findCommentInput, findCommentSubmit, newlyEnabled, disabledNear };`
  );

  return factory(
    { sleep: async () => {}, clampedGaussian: () => 0, humanClick: async () => {}, humanType: async () => {}, idleScroll: async () => {} },
    async () => null,
    () => null,
    () => {}
  ) as FeedHelpers;
}

/**
 * A post as the redesigned feed actually renders it.
 *
 * Copied from a live card, and every detail here has drawn blood: the Like
 * button is labelled by its reaction *state* rather than by its action, the
 * Comment button carries no aria-label at all, the "…more" expander lives
 * inside the commentary it truncates, and a card surfaced through someone
 * else's reaction opens with that reactor's name, not the author's.
 */
function redesignedCard(opts: {
  author: string;
  body: string;
  liked?: boolean;
  reactedBy?: string;
}) {
  const reactor = opts.reactedBy
    ? `<a href="https://www.linkedin.com/company/nayatel/posts/">
         <figure><svg role="img" aria-label="View company: ${opts.reactedBy}"></svg></figure>
       </a>
       <p><span><strong>${opts.reactedBy}</strong> likes this</span></p>`
    : "";

  document.body.innerHTML = `
    <main>
      <div role="list" data-testid="mainFeed">
        <div class="_28da66c8 _41d1e6c9" role="listitem">
          <div class="_7e760e14" componentkey="WJQO0TZPTY1l489eut9TKVsORg">
            <h2 class="_9f92f1a5"><span class="_34777e48">Feed post</span></h2>
            ${reactor}
            <button type="button" aria-label="Open control menu for post by ${opts.author}" aria-expanded="false"></button>
            <button type="button" aria-label="Hide post by ${opts.author}"></button>
            <a href="https://www.linkedin.com/in/someone-8ba2613a0/" class="_0181a986">
              <figure><svg role="img" aria-label="View ${opts.author}’s profile"></svg></figure>
            </a>
            <p class="_9f92f1a5" componentkey="d24a424a">
              <span class="_24060294" tabindex="-1" data-testid="expandable-text-box">${opts.body}<button
                type="button" aria-hidden="true" data-testid="expandable-text-button"
              ><span><span><span>…</span><span> more</span></span></span></button></span>
            </p>
            <div class="_39ca5bcd">
              <div role="button"><p><span class="_34777e48">21 comments</span><span aria-hidden="true">21 comments</span></p></div>
            </div>
            <div class="_53d0ad87">
              <button type="button" componentkey="3f879e1e" aria-label="Reaction button state: ${opts.liked ? "like" : "no reaction"}">
                <span><svg id="thumbs-up-outline-small"></svg><span>${opts.liked ? "Unlike" : "Like"}</span></span>
              </button>
              <button type="button" aria-label="Open reactions menu" aria-expanded="false"><span><svg></svg></span></button>
              <button type="button" componentkey="ebc90d12">
                <span><svg id="comment-small"></svg><div><span><span>Comment</span></span></div></span>
              </button>
              <button type="button" componentkey="6629b289" aria-expanded="false">
                <span><svg id="repost-small"></svg><div><span><span>Repost</span></span></div></span>
              </button>
              <a href="https://www.linkedin.com/feed/"><span><div><span><span>Send</span></span></div></span></a>
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

  it("leaves the '…more' expander out of the post text", () => {
    const h = loadFeedHelpers();
    const post = h.parseFeedCard(redesignedCard({ author: "Ankit Waghamore", body: BODY }));

    // The expander is a button nested inside the commentary itself, so a naive
    // textContent read hands the model "…more" welded onto the post.
    expect(post!.postContent).not.toMatch(/more$/);
    expect(post!.postContent).toBe(BODY);
  });

  it("keeps the line breaks the author typed", () => {
    const h = loadFeedHelpers();
    const card = redesignedCard({ author: "Wajahat Gul", body: "x" });
    card.querySelector("[data-testid='expandable-text-box']")!.innerHTML =
      "Alhamdulillah!<br><br>I have been promoted to Assistant Engineering Supervisor at Nayatel.";

    const post = h.parseFeedCard(card);
    expect(post!.postContent).toBe(
      "Alhamdulillah!\n\nI have been promoted to Assistant Engineering Supervisor at Nayatel."
    );
  });

  it("names the author, not whoever reacted the post onto the feed", () => {
    const h = loadFeedHelpers();
    const post = h.parseFeedCard(
      redesignedCard({ author: "Wajahat Gul", body: BODY, reactedBy: "Nayatel" })
    );

    expect(post!.authorName).toBe("Wajahat Gul");
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

  it("finds the Like button, which is labelled by its reaction state", () => {
    const h = loadFeedHelpers();
    const card = redesignedCard({ author: "Ankit Waghamore", body: BODY });
    const like = h.findLikeButton(card);

    expect(like).not.toBeNull();
    expect(h.accessibleName(like!)).toBe("Reaction button state: no reaction");
    expect(h.visibleText(like!)).toBe("Like");
  });

  it("never mistakes the reactions-menu chevron for the Like button", () => {
    const h = loadFeedHelpers();
    const card = redesignedCard({ author: "Ankit Waghamore", body: BODY });

    expect(h.accessibleName(h.findLikeButton(card)!)).not.toMatch(/reactions menu/i);
  });

  it("finds the Comment button, which carries no aria-label at all", () => {
    const h = loadFeedHelpers();
    const card = redesignedCard({ author: "Ankit Waghamore", body: BODY });
    const comment = h.findCommentButton(card);

    expect(comment).not.toBeNull();
    expect(comment!.getAttribute("aria-label")).toBeNull();
    expect(h.visibleText(comment!)).toBe("Comment");
    // Not the "21 comments" link into the comment list.
    expect(h.visibleText(comment!)).not.toMatch(/\d/);
  });

  it("does not re-like a post already reacted to", () => {
    const h = loadFeedHelpers();
    const card = redesignedCard({ author: "Ankit Waghamore", body: BODY, liked: true });

    expect(h.isAlreadyLiked(h.findLikeButton(card)!)).toBe(true);
  });

  it("treats an untouched post as not yet liked", () => {
    const h = loadFeedHelpers();
    const card = redesignedCard({ author: "Ankit Waghamore", body: BODY });

    expect(h.isAlreadyLiked(h.findLikeButton(card)!)).toBe(false);
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

/**
 * The video-player controls LinkedIn injects into a card when the post has a
 * video attached. Forty-odd buttons, several of which are named things a
 * loose matcher would happily mistake for a social action.
 */
const VIDEO_PLAYER = `
  <div data-vjs-player="true" class="video-js vjs-playing">
    <video muted="muted"></video>
    <button class="vjs-big-play-button" type="button" title="Play Video"><span>Play Video</span></button>
    <div class="vjs-control-bar">
      <button class="vjs-play-control" type="button" title="Pause"><span>Pause</span></button>
      <button class="vjs-skip-backward" type="button" title="Skip Backward"><span>Skip Backward</span></button>
      <button class="vjs-mute-control" type="button" title="Unmute"><span>Unmute</span></button>
      <button class="vjs-picture-in-picture-control" type="button" title="Picture-in-Picture"><span>Picture-in-Picture</span></button>
      <button class="vjs-fullscreen-control" type="button" title="Fullscreen"><span>Fullscreen</span></button>
    </div>
    <div class="vjs-text-track-settings">
      <button class="vjs-default-button" type="button" title="restore all settings to the default values">Reset</button>
      <button class="vjs-done-button" type="button" title="Done">Done</button>
      <button class="vjs-close-button" type="button" title="Close Modal Dialog"><span>Close Modal Dialog</span></button>
    </div>
  </div>`;

/** A company post with a video attached, as the redesigned feed renders it. */
function companyVideoCard(body: string) {
  document.body.innerHTML = `
    <main>
      <div role="list" data-testid="mainFeed">
        <div role="listitem" componentkey="expandedPGrwELasyU9Bp0hy5yuIaU">
          <h2><span>Feed post</span></h2>
          <a href="https://www.linkedin.com/company/hrways/posts/">
            <figure><svg role="img" aria-label="View company: HR Ways - Hiring Tech Talent"></svg></figure>
          </a>
          <button type="button" aria-label="Open control menu for post by HR Ways - Hiring Tech Talent" aria-expanded="false"></button>
          <button type="button" aria-label="Hide post by HR Ways - Hiring Tech Talent"></button>
          <p><span tabindex="-1" data-testid="expandable-text-box">${body}<button
            type="button" aria-hidden="true" data-testid="expandable-text-button"
          ><span><span><span>…</span><span> more</span></span></span></button></span></p>
          ${VIDEO_PLAYER}
          <div>
            <button type="button" aria-label="Reaction button state: no reaction">
              <span><svg id="thumbs-up-outline-small"></svg><span>Like</span></span>
            </button>
            <button type="button" aria-label="Open reactions menu" aria-expanded="false"><span><svg></svg></span></button>
            <button type="button"><span><svg id="comment-small"></svg><div><span><span>Comment</span></span></div></span></button>
          </div>
        </div>
      </div>
    </main>`;
  return document.querySelector("[role='listitem']") as Element;
}

const VLOG =
  "Day 1 Vlog is here!!! Come with us to Leap 2026! New Connections, big ideas and a whole lot of moments.";

describe("a company post with a video attached", () => {
  it("reads it, and names the company as the author", () => {
    const h = loadFeedHelpers();
    const post = h.parseFeedCard(companyVideoCard(VLOG));

    expect(post).not.toBeNull();
    expect(post!.authorName).toBe("HR Ways - Hiring Tech Talent");
    expect(post!.postContent).toBe(VLOG);
  });

  it("finds the real Like button among forty video controls", () => {
    const h = loadFeedHelpers();
    const like = h.findLikeButton(companyVideoCard(VLOG));

    expect(h.visibleText(like!)).toBe("Like");
    expect(like!.className).not.toMatch(/vjs/);
  });

  it("finds the real Comment button, not a player control", () => {
    const h = loadFeedHelpers();
    const comment = h.findCommentButton(companyVideoCard(VLOG));

    expect(h.visibleText(comment!)).toBe("Comment");
    expect(comment!.className).not.toMatch(/vjs/);
  });

  it("keeps the video player's text out of the post", () => {
    const h = loadFeedHelpers();
    const post = h.parseFeedCard(companyVideoCard(VLOG));

    expect(post!.postContent).not.toMatch(/Fullscreen|Pause|Picture-in-Picture/);
  });
});

describe("commenting on the right post", () => {
  /** Two cards, each with its own comment box already open. */
  function twoOpenBoxes() {
    document.body.innerHTML = `
      <main>
        <div role="list" data-testid="mainFeed">
          <div role="listitem" id="first">
            <form><div role="textbox" contenteditable="true" id="box-1"></div>
              <button type="submit" id="submit-1" disabled></button></form>
          </div>
          <div role="listitem" id="second">
            <form><div role="textbox" contenteditable="true" id="box-2"></div>
              <button type="submit" id="submit-2" disabled></button></form>
          </div>
        </div>
      </main>`;
    return {
      first: document.getElementById("first")!,
      second: document.getElementById("second")!,
    };
  }

  it("types into the box belonging to the card it was given", () => {
    const h = loadFeedHelpers();
    const { second } = twoOpenBoxes();

    // A document-wide query returns box-1 — the first one open on the page —
    // and the comment lands under the wrong post.
    expect(h.findCommentInput(second)!.id).toBe("box-2");
  });

  it("never falls back to another card's box", () => {
    const h = loadFeedHelpers();
    const { first } = twoOpenBoxes();
    first.querySelector("#box-1")!.remove();

    expect(h.findCommentInput(first)).toBeNull();
  });

  it("submits into the box it typed into", () => {
    const h = loadFeedHelpers();
    const { second } = twoOpenBoxes();
    const input = h.findCommentInput(second)!;

    // LinkedIn keeps submit disabled until the editor has text, and a disabled
    // button is never a candidate — so this is the state after typing.
    document.getElementById("submit-2")!.removeAttribute("disabled");

    expect(h.findCommentSubmit(second, input)!.id).toBe("submit-2");
  });

  it("ignores a submit button that is still disabled", () => {
    const h = loadFeedHelpers();
    const { second } = twoOpenBoxes();
    const input = h.findCommentInput(second)!;

    // Nothing typed yet. Clicking a disabled submit does nothing and would be
    // reported as a posted comment that never appeared.
    expect(h.findCommentSubmit(second, input)).toBeNull();
  });

  it("does not reach into the other card for an enabled submit", () => {
    const h = loadFeedHelpers();
    const { first, second } = twoOpenBoxes();
    const input = h.findCommentInput(second)!;

    // The first card's submit is live and the second card's is not. Widening
    // the search would publish this comment under the first post.
    first.querySelector("#submit-1")!.removeAttribute("disabled");

    expect(h.findCommentSubmit(second, input)).toBeNull();
  });

  it("identifies submit by the button that wakes up when text is typed", () => {
    const h = loadFeedHelpers();
    const { second } = twoOpenBoxes();
    const input = h.findCommentInput(second)!;

    const before = h.disabledNear(input, second);
    expect(before.map((el) => el.id)).toContain("submit-2");
    // Nothing has been typed yet, so nothing has woken up.
    expect(h.newlyEnabled(before)).toBeNull();

    // LinkedIn enables submit once the editor has text. Whatever the button is
    // called, that transition is what identifies it.
    document.getElementById("submit-2")!.removeAttribute("disabled");
    expect(h.newlyEnabled(before)!.id).toBe("submit-2");
  });

  it("never snapshots the other card's submit button", () => {
    const h = loadFeedHelpers();
    const { first, second } = twoOpenBoxes();
    const input = h.findCommentInput(second)!;

    const before = h.disabledNear(input, second);
    expect(before.map((el) => el.id)).not.toContain("submit-1");

    // The other post's submit going live must not be read as ours waking up.
    first.querySelector("#submit-1")!.removeAttribute("disabled");
    expect(h.newlyEnabled(before)).toBeNull();
  });
});

/**
 * LinkedIn's comment box, verbatim from a live post.
 *
 * Two details in here are the whole reason comments were never being posted:
 * the editor is a TipTap/ProseMirror contenteditable with no `value`, and the
 * button that publishes is a `type="button"` captioned "Comment" — the same
 * caption as the button on the card that opens the box. The only thing that
 * distinguishes them is the id on the wrapper around the submit button.
 */
function cardWithOpenCommentBox(postKey = "CgsIgIDNkKTt1IzQAQ") {
  document.body.innerHTML = `
    <main>
      <div role="list" data-testid="mainFeed">
        <div role="listitem" id="the-card">
          <p><span data-testid="expandable-text-box">${"a post worth responding to ".repeat(3)}</span></p>
          <div>
            <button type="button" aria-label="Reaction button state: no reaction">
              <span><span>Like</span></span>
            </button>
            <button type="button" id="open-box"><span><div><span><span>Comment</span></span></div></span></button>
          </div>
          <div>
            <div data-testid="ui-core-tiptap-text-editor-wrapper">
              <div>
                <div contenteditable="true" role="textbox" dir="auto" tabindex="0"
                     aria-label="Text editor for creating comment" translate="no"
                     class="tiptap ProseMirror" id="editor"></div>
              </div>
            </div>
            <div>
              <button type="button" aria-label="Show Emoji Picker" aria-expanded="false"></button>
              <button type="button" aria-label="Open GIF picker" aria-haspopup="dialog"></button>
              <button type="button" aria-label="Share photo"></button>
            </div>
            <div id="${postKey}-commentButtonSectionqXXn1eVFnW">
              <button type="button" id="real-submit"><span><span>Comment</span></span></button>
            </div>
          </div>
        </div>
      </div>
    </main>`;
  return document.getElementById("the-card")!;
}

describe("the comment box", () => {
  it("finds the TipTap editor", () => {
    const h = loadFeedHelpers();
    const card = cardWithOpenCommentBox();

    expect(h.findCommentInput(card)!.id).toBe("editor");
  });

  it("submits with the box's Comment button, not the card's", () => {
    const h = loadFeedHelpers();
    const card = cardWithOpenCommentBox();
    const input = h.findCommentInput(card)!;

    // Both buttons are captioned "Comment". Picking the wrong one reopens the
    // box forever and never posts anything.
    expect(h.findCommentSubmit(card, input)!.id).toBe("real-submit");
  });

  it("never picks an emoji, GIF or photo button as submit", () => {
    const h = loadFeedHelpers();
    const card = cardWithOpenCommentBox();
    card.querySelector("[id*='commentButtonSection']")!.remove();
    const input = h.findCommentInput(card)!;

    const found = h.findCommentSubmit(card, input);
    // With the real submit gone, it must not fall on a toolbar button.
    if (found) {
      expect(h.accessibleName(found)).not.toMatch(/emoji|gif|photo/i);
    }
  });

  it("keys the submit section to this post, so two open boxes stay apart", () => {
    const h = loadFeedHelpers();
    const first = cardWithOpenCommentBox("post-one");
    const feed = first.parentElement!;

    const second = first.cloneNode(true) as HTMLElement;
    second.id = "second-card";
    second.querySelector("#real-submit")!.id = "second-submit";
    second.querySelector("[id*='commentButtonSection']")!.id = "post-two-commentButtonSection";
    second.querySelector("#editor")!.id = "second-editor";
    feed.appendChild(second);

    expect(h.findCommentSubmit(second, h.findCommentInput(second)!)!.id).toBe("second-submit");
    expect(h.findCommentSubmit(first, h.findCommentInput(first)!)!.id).toBe("real-submit");
  });
});
