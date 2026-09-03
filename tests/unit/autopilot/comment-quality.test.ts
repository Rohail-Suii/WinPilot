import { describe, it, expect } from "vitest";
import {
  appendPortfolio,
  policyFor,
  polishComment,
  rejectReason,
} from "@/lib/autopilot/comment-quality";

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
  });

  it("rejects empty agreement separately from warmth", () => {
    // The two are held apart so a light post can allow warmth without also
    // admitting the canonical LinkedIn-bot phrases. These stay banned in every
    // register, which is why they get their own reason.
    expect(rejectReason("Couldn't agree more, the tooling is the hard part.")).toBe(
      "opened with empty agreement"
    );
    expect(rejectReason("100% this, the observability gap is the real cost.")).toBe(
      "opened with empty agreement"
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


describe('emoji', () => {
  it('strips them by default, exactly as before', () => {
    // Every existing caller passes no options and must be unaffected.
    expect(polishComment("worth doing 🚀 #buildinpublic #nextjs")).toBe("worth doing");
  });

  it('keeps one when the register allows it', () => {
    expect(polishComment("nailed it 😄👏🚀", { allowEmoji: true })).toBe("nailed it 😄");
  });

  it('keeps a two-person emoji together rather than counting it three times', () => {
    // A ZWJ sequence is one emoji to a reader. The old character-class strip
    // saw three code points, which did not matter when all of them were
    // deleted and matters now they are counted.
    expect(polishComment("shipping 👨‍💻", { allowEmoji: true })).toBe("shipping 👨‍💻");
  });

  it('strips all of them on a pitch, whatever the model wrote', () => {
    expect(polishComment("built the thing 🚀", { allowEmoji: true, maxEmoji: 0 })).toBe(
      "built the thing"
    );
  });
});

describe('warmth on a light post', () => {
  const light = { allowPraise: true };

  it('allows a warm adjective opener', () => {
    expect(
      rejectReason("amazing, the second one is the actual answer", light)
    ).toBeNull();
  });

  it('still rejects the same opener when praise is not allowed', () => {
    expect(rejectReason("amazing, the second one is the actual answer")).toBe(
      "opened with flattery"
    );
  });

  it('never allows the canonical bot phrases, however warm the register', () => {
    // This is the whole reason the praise ban was split rather than dropped:
    // "relax flattery" means allow warmth, not admit these.
    expect(rejectReason("so true, the tooling is the hard part", light)).toBe(
      "opened with empty agreement"
    );
    expect(rejectReason("couldn't agree more about the chunking", light)).toBe(
      "opened with empty agreement"
    );
    expect(rejectReason("great post, the second one got me", light)).toBe(
      "was generic praise"
    );
    // "Love" is an allowed adjective, but "love this" is caught mid-comment.
    expect(rejectReason("love this, the second one got me", light)).toBe(
      "was generic praise"
    );
  });
});

describe('short reactions', () => {
  it('accepts a few words when the floor is lowered for them', () => {
    expect(rejectReason("called it, twice", { minLength: 12 })).toBeNull();
  });

  it('still rejects something with no subject in it', () => {
    expect(rejectReason("lol", { minLength: 12 })).toBe("came back empty or too short");
  });

  it('lets a short congratulation through on a celebration', () => {
    expect(
      rejectReason("congrats, four years earned", {
        allowCongratulation: true,
        minSubstance: 12,
      })
    ).toBeNull();
  });
});

describe('never posting the same thing twice', () => {
  const prior = ["the part that bites is the retry loop"];

  it('rejects a word-for-word repeat', () => {
    expect(
      rejectReason("The part that bites is the retry loop.", { recentComments: prior })
    ).toBe("was word-for-word something I already posted");
  });

  it('allows a comment that is merely similar', () => {
    // Near-repetition is steered away from in the prompt. Rejecting on it here
    // would force a second model call on every post that landed close.
    expect(
      rejectReason("the part that bites is the backoff, not the retry", {
        recentComments: prior,
      })
    ).toBeNull();
  });
});

describe('policyFor', () => {
  const opts = { isPitch: false, postType: "opinion", band: "short" as const };

  it('keeps analytical comments plain', () => {
    const p = policyFor("analytical", opts);
    expect(p.allowEmoji).toBe(false);
    expect(p.allowPraise).toBe(false);
    expect(p.allowCongratulation).toBe(false);
  });

  it('lets the light registers be warm', () => {
    expect(policyFor("playful", opts).allowPraise).toBe(true);
    expect(policyFor("celebratory", opts).allowCongratulation).toBe(true);
    // A setback is warm, but congratulating someone on it is the worst
    // possible reply.
    expect(policyFor("supportive", opts).allowCongratulation).toBe(false);
  });

  it('never allows an emoji on a technical post', () => {
    expect(
      policyFor("playful", { ...opts, postType: "technical" }).allowEmoji
    ).toBe(false);
  });

  it('overrides everything for a pitch', () => {
    // A pitch is read as an application: never warm, never short, never
    // decorated, whatever register the model claimed.
    const p = policyFor("playful", { ...opts, isPitch: true, band: "reaction" });
    expect(p.allowEmoji).toBe(false);
    expect(p.allowPraise).toBe(false);
    expect(p.minLength).toBe(40);
  });

  it('lowers the floor for a reaction', () => {
    expect(policyFor("playful", { ...opts, band: "reaction" }).minLength).toBe(12);
    expect(policyFor("playful", { ...opts, band: "standard" }).minLength).toBe(15);
  });
});
