import { describe, it, expect } from "vitest";
import { polishComment, rejectReason } from "@/lib/autopilot/comment-quality";

/**
 * The last line of defence before something gets typed into a real LinkedIn
 * comment box. Everything here is a failure that has to be caught without an AI
 * call, because by this point the model has already had its turn.
 */

describe("polishComment", () => {
  it("strips the wrapping quotes models add around the answer", () => {
    expect(polishComment('"the retry loop is the part that bites"')).toBe(
      "the retry loop is the part that bites"
    );
  });

  it("replaces em and en dashes, which read as machine-written", () => {
    expect(polishComment("we tried this — it fell over at 200 rps")).toBe(
      "we tried this, it fell over at 200 rps"
    );
    expect(polishComment("cheap – until you shard")).toBe("cheap, until you shard");
  });

  it("removes hashtags and emoji", () => {
    expect(polishComment("worth doing 🚀 #buildinpublic #nextjs")).toBe("worth doing");
  });

  it("leaves a clean comment untouched", () => {
    const good =
      "we hit this on a 40k-row import. batching at 500 fixed the timeouts but the memory ceiling moved, not went away.";
    expect(polishComment(good)).toBe(good);
  });
});

describe("rejectReason", () => {
  it("passes a comment with something concrete in it", () => {
    expect(
      rejectReason(
        "the failure mode we hit was the webhook retrying before the first write committed. idempotency keys, not longer timeouts."
      )
    ).toBeNull();
  });

  it("rejects flattery openers even when something follows them", () => {
    expect(rejectReason("Great post. we saw the same thing at scale.")).toBe(
      "opened with flattery"
    );
    expect(rejectReason("Love this breakdown of the caching layer.")).toBe(
      "opened with flattery"
    );
    expect(rejectReason("Couldn't agree more, the tooling is the hard part.")).toBe(
      "opened with flattery"
    );
    expect(rejectReason("100% this, the observability gap is the real cost.")).toBe(
      "opened with flattery"
    );
  });

  it("rejects sycophancy buried mid-comment", () => {
    expect(
      rejectReason("Interesting angle, thanks for sharing this with everyone here.")
    ).toBe("was generic praise");
  });

  it("rejects an empty or one-word answer", () => {
    expect(rejectReason("")).toBe("came back empty or too short");
    expect(rejectReason("yes")).toBe("came back empty or too short");
    // Short boilerplate trips the length check first. Either way it never posts.
    expect(rejectReason("100% this.")).not.toBeNull();
  });

  it("holds pitches to a longer minimum than ordinary comments", () => {
    const thin = "built something similar in Next.js.";
    expect(rejectReason(thin)).toBeNull();
    expect(rejectReason(thin, 40)).toBe("came back empty or too short");
  });

  it("does not reject a comment that merely quotes a banned word in context", () => {
    // "great" appears, but not as flattery, and not at the start.
    expect(
      rejectReason("the docs claim great defaults, but the connection pool caps at 10.")
    ).toBeNull();
  });
});
