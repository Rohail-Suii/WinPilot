/**
 * "Is there enough of this post on the page to comment on it?"
 *
 * The agent reads text. It does not see the picture, the carousel, the video
 * or the poll — so on the very common LinkedIn post that is an image plus four
 * words and an emoji, everything that says what the post is ABOUT is in the
 * part we cannot read. The model, handed that caption and told to engage,
 * writes something confident about a post it has not seen. That comment is the
 * single most damaging thing this account can publish: it is wrong in public,
 * under a stranger's photo, in front of the exact people the whole system
 * exists to impress.
 *
 * So the rule is: no context, no comment. Not a better guess, not a vaguer
 * comment — silence. The post still gets a like, which is what a person does
 * when they scroll past something they did not really read.
 *
 * Everything here is pure text: no AI, no network, no database. That matters
 * because it runs BEFORE the model call, so a post we cannot read costs
 * nothing at all rather than costing a generation and then being thrown away.
 * The model gets a second, softer veto of its own (`understood: false`) for
 * the posts that read fine and still make no sense.
 */

/** What LinkedIn rendered alongside the text, as far as the scraper could tell. */
export interface PostMedia {
  image?: boolean;
  video?: boolean;
  /** A slide deck / PDF carousel. Its content is entirely inside the viewer. */
  document?: boolean;
  poll?: boolean;
  /** A shared link with a preview card. The headline is usually readable. */
  article?: boolean;
}

export interface ContextVerdict {
  /** Whether the text alone says what this post is about. */
  readable: boolean;
  /** Words left after the decoration is stripped. The number the floors test. */
  words: number;
  /** What the post is carrying that we cannot read, for the log line. */
  carriedBy: string;
  /** Plain English, written to be shown in the journal next to the skip. */
  reason: string;
}

/**
 * How many real words a post needs before we will comment on it.
 *
 * Three floors, because the same caption means different things depending on
 * what it is a caption FOR:
 *
 *   WITH_MEDIA   The meaning is in a picture, a deck or a video we cannot see,
 *                so the text has to stand up on its own before we speak. A
 *                dozen words is roughly one real sentence with a subject in it
 *                — "we shipped the new pricing page and traffic doubled" —
 *                as opposed to "so proud of this team 🚀".
 *   TEXT_ONLY    Nothing is hidden, so a short post is short, not unreadable.
 *                "anyone hiring react devs in lahore?" is five words and
 *                perfectly clear.
 *   UNKNOWN      An older extension build sends no media flags at all. We
 *                cannot tell which of the two cases we are in, so this sits
 *                between them: a post with fewer than eight real words is a
 *                caption either way.
 */
export const CONTEXT_FLOORS = {
  WITH_MEDIA: 12,
  TEXT_ONLY: 5,
  UNKNOWN: 8,
} as const;

/** Decoration that carries no meaning on its own, stripped before counting. */
function stripDecoration(raw: string): string {
  return (raw || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // A link is not something we can read either — the target is off-page.
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\b(?:www\.|lnkd\.in\/)\S+/gi, " ")
    // "#hiring #jobs #opentowork" is a filing system, not a sentence.
    .replace(/[#@][\p{L}\p{N}_-]+/gu, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    // Emoji sit next to their modifiers and joiners; drop those too so they do
    // not survive as one-character "words".
    .replace(/[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The words a reader would actually get meaning from.
 *
 * Single characters and bare punctuation runs do not count: a line of "•" or
 * "|" separators is layout, and counting it would let a decorated caption
 * through on the strength of its own bullet points.
 */
export function meaningfulWords(raw: string): string[] {
  return stripDecoration(raw)
    .split(/[\s|•·—–\-]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length >= 2 && /[\p{L}\p{N}]/u.test(w));
}

/** Whether the scraper saw anything the agent cannot read. */
function unreadableMedia(media?: PostMedia): string {
  if (!media) return "";
  if (media.document) return "a document or slide deck";
  if (media.video) return "a video";
  if (media.poll) return "a poll";
  if (media.image) return "an image";
  // A shared article renders its headline as text, so it is not a blind spot.
  return "";
}

/**
 * Everything the card is carrying, in a phrase, for the prompt.
 *
 * Told to the model in the user message so it knows the caption is a caption.
 * Left empty when there is nothing to say, so the line disappears from the
 * prompt entirely rather than reading "this post also contains: nothing".
 */
export function describePostMedia(media?: PostMedia): string {
  if (!media) return "";
  const parts: string[] = [];
  if (media.image) parts.push("an image");
  if (media.video) parts.push("a video");
  if (media.document) parts.push("a slide deck or document");
  if (media.poll) parts.push("a poll");
  if (media.article) parts.push("a shared link");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Decide whether this post can be understood from its text.
 *
 * `media` being absent is not the same as there being no media: it means the
 * extension that scraped this post is too old to say. See CONTEXT_FLOORS.
 */
export function assessPostContext(post: {
  postContent: string;
  media?: PostMedia;
}): ContextVerdict {
  const words = meaningfulWords(post.postContent).length;
  const carriedBy = unreadableMedia(post.media);

  const floor = carriedBy
    ? CONTEXT_FLOORS.WITH_MEDIA
    : post.media
      ? CONTEXT_FLOORS.TEXT_ONLY
      : CONTEXT_FLOORS.UNKNOWN;

  if (words >= floor) {
    return { readable: true, words, carriedBy, reason: "" };
  }

  if (words === 0) {
    return {
      readable: false,
      words,
      carriedBy,
      reason: carriedBy
        ? `the post is ${carriedBy} with no text on it, and I cannot see ${carriedBy}`
        : "the post has no readable text on it at all",
    };
  }

  return {
    readable: false,
    words,
    carriedBy,
    reason: carriedBy
      ? `the post is ${carriedBy} with ${words} words of caption, so what it is actually about is in a part I cannot see`
      : `there are only ${words} words here, which is not enough to tell what the post is about`,
  };
}
