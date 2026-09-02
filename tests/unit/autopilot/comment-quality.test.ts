import { describe, it, expect } from "vitest";
import { appendPortfolio, polishComment, rejectReason } from "@/lib/autopilot/comment-quality";

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

describe('personal news', () => {
  const OPTS = { allowCongratulation: true };

  it('accepts a congratulation that says something about what they did', () => {
    // A promotion post is the single most common thing on a feed, and the
    // natural comment opens by congratulating them. Rejecting that outright is
    // what left every one of these posts liked and not commented on.
    expect(
      rejectReason(
        'congrats, four years on the same FTTH network before the supervisor title is the part most people skip past',
        OPTS
      )
    ).toBeNull();
  });

  it('still rejects a bare congratulation', () => {
    expect(rejectReason('Congratulations!', OPTS)).not.toBeNull();
    expect(rejectReason('Huge congrats, well deserved', OPTS)).not.toBeNull();
  });

  it('rejects congratulations on any other kind of post', () => {
    expect(
      rejectReason('congrats, four years on the same network is the part people skip')
    ).toBe('opened with flattery');
  });

  it('still rejects flattery even on personal news', () => {
    expect(rejectReason('Great post, congrats on the promotion at Nayatel', OPTS)).toBe(
      'opened with flattery'
    );
    expect(
      rejectReason('congrats, love this, four years of network work behind it', OPTS)
    ).toBe('was generic praise');
  });

  it('takes a bare minimum length the way callers always have', () => {
    // The options object is new; the numeric form is what every existing call
    // site passes.
    expect(rejectReason('short', 40)).toBe('came back empty or too short');
    expect(rejectReason('short', { minLength: 40 })).toBe('came back empty or too short');
  });
});

describe('appendPortfolio', () => {
  const URL = 'http://rohail.systems';
  const PITCH =
    'built the same thing at Right Tail, a RAG pipeline over 400k tickets, cut retrieval latency from 900ms to 120ms by fixing the chunking. happy to send a short walkthrough';

  it('puts the link on the end of a pitch', () => {
    expect(appendPortfolio(PITCH, URL)).toBe(`${PITCH}. ${URL}`);
  });

  it('does not add a second full stop when the pitch already ends in one', () => {
    expect(appendPortfolio('happy to send a walkthrough.', URL)).toBe(
      `happy to send a walkthrough. ${URL}`
    );
  });

  it('leaves a question mark alone', () => {
    expect(appendPortfolio('worth a quick call?', URL)).toBe(`worth a quick call? ${URL}`);
  });

  it('does not append twice when the model wrote the link itself', () => {
    // The pitch rules tell it not to, and it sometimes does anyway.
    const withLink = `happy to send a walkthrough. ${URL}`;
    expect(appendPortfolio(withLink, URL)).toBe(withLink);
  });

  it('recognises the link even without its scheme', () => {
    expect(appendPortfolio('see rohail.systems for the writeup', URL)).toBe(
      'see rohail.systems for the writeup'
    );
  });

  it('adds nothing when no portfolio is on file', () => {
    expect(appendPortfolio(PITCH, '')).toBe(PITCH);
    expect(appendPortfolio(PITCH, '   ')).toBe(PITCH);
  });

  it('adds nothing to an empty comment', () => {
    expect(appendPortfolio('', URL)).toBe('');
  });
});
