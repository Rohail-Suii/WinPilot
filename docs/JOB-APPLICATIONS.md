# Job applications from the feed

The agent already reads every post on your LinkedIn feed. This feature acts on
the ones that turn out to be job openings: if the post gives an email address,
it sends an application from your own Gmail with your resume attached; if it
does not, it saves the post and its application link for you to handle by hand.

Both outcomes land on **Dashboard → Job Applications**.

---

## The path a post takes

```
extension reads a feed card
   └─ postContent + postLinks (mailto: and outbound hrefs)
        │
        ▼
  /api/autopilot/generate           lib/outreach/hiring-post.ts
   ├─ action "unseen_posts"  ──────▶ detectHiringPost()   pure text matching, no AI
   └─ action "comment"       ──────▶ same, plus the model's own postType
        │
        ▼
  lib/outreach/relevance.ts         is this job anything to do with me?
   ├─ another profession     ──────▶ status "skipped"      recorded, never emailed
   └─ cannot tell            ──────▶ status "needs_review" asked, never guessed
        │
        ▼
  lib/outreach/capture.ts           one record per post, unique on (userId, postKey)
   ├─ address + sending on   ──────▶ status "queued"
   ├─ address, sending off / low confidence ─▶ "needs_review"
   └─ no address             ──────▶ "needs_manual"   ← the saved-link half
        │
        ▼
  lib/outreach/worker.ts            every 2 minutes, one send per user per pass
        │
        ▼
  lib/outreach/sender.ts
   ├─ recipient cooldown, MX check, daily cap, spacing
   ├─ draftApplication()   AI writes subject + body from your real background
   ├─ assessSpamRisk()     rejects a draft that reads as bulk mail
   └─ sendApplicationEmail()  Gmail SMTP, plain text + matching HTML, resume attached
```

## Detection

`lib/outreach/hiring-post.ts` is deterministic and runs on every post the agent
reads, so it has to cost nothing when the answer is no. It handles the two
things that break naive matching on LinkedIn:

- **Styled text.** Writers use Mathematical Alphanumeric Symbols for headings
  (`𝐖𝐞𝐛𝐬𝐢𝐭𝐞 𝐃𝐞𝐯𝐞𝐥𝐨𝐩𝐞𝐫`) because the composer has no bold button. NFKC
  normalisation folds them, along with an address written as `𝐡𝐫@𝐧𝐞𝐱𝐮𝐬𝟗𝟓.𝐜𝐨𝐦`.
- **Obfuscated addresses.** `hr [at] acme [dot] io` and `hr at acme dot com`
  are rewritten before matching.

Addresses are ranked, so `careers@` beats the poster's personal address. Role
titles, company names and apply links (Google Forms, Lever, Greenhouse, careers
pages) are extracted the same way.

A post where the author is announcing **their own** job hunt vetoes everything,
including the model's classification — writing an application to another job
seeker is the one mistake here that is actively embarrassing.

## Relevance: which jobs it will and will not apply for

`lib/outreach/relevance.ts` decides this in code, from your real history, before
a token is spent writing anything. The model never gets the question, because it
answers it badly in both directions — asked loosely it applies to everything,
asked strictly it refuses every post whose tool list is not an exact match.

The gate is **occupation-level, not tool-level**:

| The post is… | Outcome |
| --- | --- |
| your own profession | **applies** — even if it names none of your tools |
| a neighbouring profession (data, product, design for a software background) | **applies only** if it names at least one thing you have actually used |
| another profession — nursing, sales, finance, logistics, HR, teaching, marketing, physical engineering | **never applies**; recorded as *Not applied* with the reason |
| an occupation it cannot name, with fewer than two of your skills in it | **asks you** — held as *Needs your OK*, never guessed either way |

So a WordPress role is applied for by a React developer (both are web
development, and the email says honestly what they have actually built), while a
Data Scientist post asking for pandas and scikit-learn is not, and a Registered
Nurse post never gets near the sender.

Your fields are derived from your headline, the job titles you have actually
held, and your skills — **not** from Autopilot's `targetRoles`, which are the
people the agent networks with (recruiters, CTOs), not jobs to apply for.

**Settings → Applications → "Only apply when the post names something I have
used"** is stricter still: it holds back an in-field post that lists a stack you
have never touched. Off by default, because that would have skipped the
WordPress role above.

Nothing is deleted by this gate. A skipped opening is on the dashboard with the
reason on it, and *Reopen → Send now* overrides it by hand.

## Why the mail reaches the inbox

Ranked by how much each actually matters:

1. **It is sent through your Gmail account over authenticated SMTP.** The
   message is DKIM-signed by Google, SPF passes, DMARC aligns, and it carries
   Google's sending reputation. This is most of the battle, and it is why the
   feature uses an app password rather than a transactional email service on a
   cold domain.
2. **Behaviour.** A daily cap (default 20) on a rolling 24 hours, a minimum gap
   between sends (default 6 minutes), one send per worker pass, and a 30-day
   cooldown per recipient address across all posts.
3. **The recipient is checked first.** Syntax, then a cached MX lookup. Bounces
   burn reputation faster than anything else, and a typo'd domain scraped off a
   post is the likeliest bounce there is.
4. **Content.** `lib/email/deliverability.ts` scores every draft the way a
   filter would — shouting, emoji, link count, shorteners, urgency language,
   fake `Re:` prefixes, unsubscribe wording, length. A draft over the threshold
   is rewritten once with the specific problems named, and refused if it is
   still bad.
5. **Shape.** Plain text with a matching, minimal HTML part; no tracking pixel,
   no images, no marketing markup, no `List-Unsubscribe` or `Precedence: bulk`
   headers, a real `Reply-To`, and one attachment.

## The resume

Your own file, uploaded once in **Settings → Applications**, attached
unmodified. It is deliberately *not* the tailored PDF the rest of the app can
generate — an application should send the document you chose. Nothing is sent
until one is uploaded.

A draft written before a resume was on file says "available on request"; if the
attachment changes underneath a stored draft, it is rewritten rather than sent
with a body that contradicts it.

## What the model may and may not decide

It decides how to write the email. It does **not** get to decide that you are
unqualified: the only grounds for not applying are "this is not a job posting"
and "this is a different profession". A missing framework or CMS is answered
honestly in the body ("I have not used WordPress; here is what I have built and
in what"), not with a skip. Models refuse far too readily here, so a refusal on
any other ground is challenged once with the refusal quoted back — see
`isAcceptedRefusal` in `lib/outreach/sender.ts`.

## Setup

1. **Settings → Applications → Gmail account.** 2-Step Verification must be on;
   generate an App Password at <https://myaccount.google.com/apppasswords>. The
   password is verified against Gmail before it is stored, and encrypted at rest
   with the same envelope as your AI keys.
2. **Upload your resume** on the same tab.
3. **Turn on "Send applications automatically"** — until then, openings with an
   address are held as *Needs your OK* and you send them one at a time.
4. Run Autopilot in feed mode as usual.

A deployment-wide fallback account can be set with `GMAIL_USER` and
`GMAIL_APP_PASSWORD`. It is only used for a user who has not connected their own
account. `OUTREACH_ENABLED=false` stops the sender without removing the feature.

## Statuses

| Status | Meaning |
| --- | --- |
| `queued` | Has an address, waiting on pacing |
| `sending` | Claimed by a worker pass; reclaimed after 10 minutes if it dies |
| `sent` | Handed to Gmail's SMTP server |
| `failed` | Permanent failure, or retries exhausted (4 attempts, exponential backoff to 6h) |
| `needs_manual` | No address — the post and its apply links are saved for you |
| `needs_review` | Held for a person: the agent could not tell what line of work it is, sending is off, confidence was low, no resume, or the draft failed its spam check |
| `skipped` | Not your line of work, dismissed by you, not a real opening, or already applied to that address recently — the reason is on the record |

## Tests

`tests/unit/outreach/` covers detection (including the real styled post and the
job-seeker veto), the relevance gate across fifteen occupations, the capture
branch table, the spam assessment, and the send pipeline's guard rails.
