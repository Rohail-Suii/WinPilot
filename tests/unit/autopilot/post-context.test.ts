/**
 * The "can we even read this post?" gate.
 *
 * The agent is handed a post's text and nothing else. LinkedIn's most common
 * post shape — a photo, a screenshot or a carousel with four words and an emoji
 * over it — therefore arrives with the entire subject missing, and a comment
 * written from that caption is a confident guess published under a stranger's
 * post. What is pinned here is that those never reach the model, and that
 * ordinary short posts are not caught in the same net.
 */
import { describe, it, expect } from "vitest";
import {
  assessPostContext,
  describePostMedia,
  meaningfulWords,
  CONTEXT_FLOORS,
} from "@/lib/autopilot/post-context";

const IMAGE = { image: true };
const TEXT_ONLY = {};

describe("meaningfulWords", () => {
  it("does not count hashtags, mentions, links or emoji as words", () => {
    expect(
      meaningfulWords("Proud 🚀🚀 #hiring #jobs @acme https://lnkd.in/abc")
    ).toEqual(["Proud"]);
  });

  it("does not count bullets and separators as words", () => {
    expect(meaningfulWords("• | — ·")).toEqual([]);
  });

  it("keeps the real sentence intact", () => {
    expect(meaningfulWords("we moved checkout off rails and p95 halved")).toHaveLength(8);
  });
});

describe("a post whose meaning is in the picture", () => {
  it("refuses a caption over an image", () => {
    const verdict = assessPostContext({
      postContent: "This says it all 🔥 #grateful",
      media: IMAGE,
    });

    expect(verdict.readable).toBe(false);
    expect(verdict.reason).toContain("an image");
  });

  it("refuses an image post with no text at all", () => {
    const verdict = assessPostContext({ postContent: "", media: IMAGE });

    expect(verdict.readable).toBe(false);
    expect(verdict.words).toBe(0);
  });

  it("names the deck rather than the picture, because a deck hides more", () => {
    // The carousel's slides are the post. A caption over one is the least
    // readable thing on the feed, and the reason line has to say so.
    const verdict = assessPostContext({
      postContent: "Swipe 👉",
      media: { image: true, document: true },
    });

    expect(verdict.readable).toBe(false);
    expect(verdict.reason).toContain("document or slide deck");
  });

  it("allows an image post that says what it is about in words", () => {
    const verdict = assessPostContext({
      postContent:
        "we cut our vercel bill from 900 to 210 a month by moving image transforms to a worker, here is the breakdown",
      media: IMAGE,
    });

    expect(verdict.readable).toBe(true);
  });

  it("holds an illustrated post to a higher bar than a plain one", () => {
    // The same sentence: readable on its own, a caption when there is a photo
    // above it. This is the whole point of the media flag.
    const sentence = "big news from the team today";

    expect(assessPostContext({ postContent: sentence, media: TEXT_ONLY }).readable).toBe(true);
    expect(assessPostContext({ postContent: sentence, media: IMAGE }).readable).toBe(false);
  });
});

describe("a post that is only text", () => {
  it("allows a short but clear one", () => {
    const verdict = assessPostContext({
      postContent: "anyone hiring react developers in lahore?",
      media: TEXT_ONLY,
    });

    expect(verdict.readable).toBe(true);
  });

  it("still refuses two words and an emoji", () => {
    const verdict = assessPostContext({ postContent: "so this 😅", media: TEXT_ONLY });

    expect(verdict.readable).toBe(false);
    expect(verdict.reason).toContain("not enough");
  });
});

describe("an extension too old to report media", () => {
  it("treats missing flags as unknown rather than as no media", () => {
    // Absent is not the same as {}. A six-word post from an old build could be
    // a caption on a photo, and the floor sits between the two known cases.
    const post = { postContent: "shipped something I am proud of today" };

    expect(assessPostContext(post).readable).toBe(false);
    expect(assessPostContext({ ...post, media: TEXT_ONLY }).readable).toBe(true);
  });

  it("uses a floor between the two known ones", () => {
    expect(CONTEXT_FLOORS.TEXT_ONLY).toBeLessThan(CONTEXT_FLOORS.UNKNOWN);
    expect(CONTEXT_FLOORS.UNKNOWN).toBeLessThan(CONTEXT_FLOORS.WITH_MEDIA);
  });
});

describe("describePostMedia", () => {
  it("says nothing when there is nothing to say", () => {
    expect(describePostMedia(undefined)).toBe("");
    expect(describePostMedia({})).toBe("");
  });

  it("lists everything the post is carrying", () => {
    expect(describePostMedia({ image: true, video: true })).toBe("an image and a video");
  });

  it("does not treat a shared link as a blind spot", () => {
    // The preview card renders its headline as text, so the agent can read it.
    const verdict = assessPostContext({
      postContent: "worth a read",
      media: { article: true },
    });

    expect(verdict.carriedBy).toBe("");
    expect(describePostMedia({ article: true })).toBe("a shared link");
  });
});
