/**
 * Drives the extension's outreach DOM helpers against LinkedIn's real markup.
 *
 * The content script is one IIFE that MV3 loads directly, so there is nothing to
 * import; the test slices the outreach block out of the source and evaluates it
 * with its few collaborators stubbed. If the block's boundaries move, the slice
 * fails loudly rather than silently testing nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// jsdom has no layout: offsetParent is always null and getClientRects() is
// empty, so every element would read as hidden. Give elements a box.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get() {
    return this.isConnected ? document.body : null;
  },
});

const SOURCE = readFileSync(
  path.resolve(__dirname, '../../extension/content/content-script.js'),
  'utf8'
);

const START = '  const MSG_EDITOR_SELECTORS';
const END = '  // --- Phase 2: Post Creation Helper ---';

function loadOutreachHelpers() {
  const start = SOURCE.indexOf(START);
  const end = SOURCE.indexOf(END);
  expect(start, 'outreach block start marker').toBeGreaterThan(-1);
  expect(end, 'outreach block end marker').toBeGreaterThan(start);

  const block = SOURCE.slice(start, end);
  const factory = new Function(
    'HumanBehavior',
    'dispatchNativeClickAsync',
    'dispatchNativeInput',
    'getJobDetailRoot',
    'buildSelector',
    `${block}
    return { openMessageComposer, selectMessageTopic, sendComposedMessage, getMessageComposer, getTopicSelect, isEnabled };`
  );

  const clicked: Element[] = [];
  const helpers = factory(
    { hoverElement: async () => {}, sleep: async () => {} },
    async (el: Element) => {
      clicked.push(el);
      (el as HTMLElement).click();
    },
    // Stand-in for human typing: same end state, without the per-character wait
    async (el: HTMLTextAreaElement, value: string) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    () => document.body,
    () => 'stub-selector'
  );

  return { ...helpers, clicked };
}

/** The company-page message modal, copied from a live LinkedIn page. */
const COMPANY_MESSAGE_MODAL = `
<div data-test-modal role="dialog" tabindex="-1" class="artdeco-modal" aria-labelledby="msg-shared-modals-msg-page-modal">
  <button aria-label="Dismiss" class="artdeco-button artdeco-modal__dismiss"></button>
  <div class="artdeco-modal__header"><h2 id="msg-shared-modals-msg-page-modal">New message</h2></div>
  <div class="artdeco-modal__content">
    <div class="t-24 t-bold">To: DSD Recruitment</div>
    <label for="msg-shared-modals-msg-page-modal-presenter-conversation-topic">Conversation topic</label>
    <select id="msg-shared-modals-msg-page-modal-presenter-conversation-topic">
      <option value="" disabled>Select a topic</option>
      <option value="urn:li:fsd_pageMailboxConversationTopic:1">Service request</option>
      <option value="urn:li:fsd_pageMailboxConversationTopic:2">Request a demo</option>
      <option value="urn:li:fsd_pageMailboxConversationTopic:3">Support</option>
      <option value="urn:li:fsd_pageMailboxConversationTopic:6">Careers</option>
      <option value="urn:li:fsd_pageMailboxConversationTopic:7">Other</option>
    </select>
    <div class="artdeco-text-input">
      <label for="org-message-page-modal-message">Compose message</label>
      <textarea class="artdeco-text-input__textarea" id="org-message-page-modal-message"
                maxlength="750" required name="message" placeholder="Write a message…" rows="6"></textarea>
    </div>
  </div>
  <div class="artdeco-modal__actionbar">
    <button disabled class="artdeco-button artdeco-button--primary artdeco-button--disabled">
      <span class="artdeco-button__text">Send message</span>
    </button>
  </div>
</div>`;

/** LinkedIn keeps Send disabled until a topic is picked and the body is long enough. */
function wireModalValidation() {
  const select = document.querySelector('select') as HTMLSelectElement;
  const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
  const send = document.querySelector('.artdeco-modal__actionbar button') as HTMLButtonElement;

  const revalidate = () => {
    const valid = !!select.value && textarea.value.trim().length >= 25;
    send.disabled = !valid;
    send.classList.toggle('artdeco-button--disabled', !valid);
  };

  select.addEventListener('change', revalidate);
  textarea.addEventListener('input', revalidate);
  send.addEventListener('click', () => {
    if (!send.disabled) document.body.innerHTML = '';
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  // jsdom does not implement execCommand, used for contenteditable composers
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: vi.fn(() => true),
  });
});

describe('company page message modal', () => {
  it('picks the Careers topic out of the topic <select>', async () => {
    document.body.innerHTML = COMPANY_MESSAGE_MODAL;
    wireModalValidation();
    const { selectMessageTopic } = loadOutreachHelpers();

    const result = await selectMessageTopic();

    expect(result.selected).toBe(true);
    expect(result.topic).toBe('Careers');
    expect((document.querySelector('select') as HTMLSelectElement).value).toBe(
      'urn:li:fsd_pageMailboxConversationTopic:6'
    );
    expect(result.topics).toContain('Support');
    // The disabled "Select a topic" placeholder is never a candidate
    expect(result.topics).not.toContain('Select a topic');
  });

  it('finds the Send button while it is still disabled', () => {
    document.body.innerHTML = COMPANY_MESSAGE_MODAL;
    const { getMessageComposer, isEnabled } = loadOutreachHelpers();

    const composer = getMessageComposer();

    expect(composer?.editor.id).toBe('org-message-page-modal-message');
    expect(composer?.sendButton?.textContent?.trim()).toBe('Send message');
    expect(isEnabled(composer!.sendButton)).toBe(false);
  });

  it('sends once the topic and body make the form valid', async () => {
    document.body.innerHTML = COMPANY_MESSAGE_MODAL;
    wireModalValidation();
    const { selectMessageTopic, sendComposedMessage } = loadOutreachHelpers();

    await selectMessageTopic();
    const result = await sendComposedMessage(
      'I just applied for the Frontend Engineer role and wanted to flag my application.'
    );

    expect(result.sent).toBe(true);
  });

  it('sets the topic itself when Send stays disabled without one', { timeout: 20000 }, async () => {
    document.body.innerHTML = COMPANY_MESSAGE_MODAL;
    wireModalValidation();
    // Note: no selectMessageTopic() call — the send step has to notice and recover
    const { sendComposedMessage } = loadOutreachHelpers();

    const result = await sendComposedMessage(
      'I just applied for the Frontend Engineer role and wanted to flag my application.'
    );

    expect(result.sent).toBe(true);
  });

  it('trims the body to the textarea limit', async () => {
    document.body.innerHTML = COMPANY_MESSAGE_MODAL;
    wireModalValidation();
    const { selectMessageTopic, sendComposedMessage } = loadOutreachHelpers();

    await selectMessageTopic();
    const result = await sendComposedMessage('x'.repeat(900));

    expect(result.sent).toBe(true);
    expect(result.length).toBe(750);
  });
});

describe('profile message overlay', () => {
  const OVERLAY = `
    <div class="msg-overlay-conversation-bubble">
      <form class="msg-form">
        <div class="msg-form__contenteditable" contenteditable="true" role="textbox" aria-label="Write a message…"></div>
        <div class="msg-form__right-actions">
          <button type="submit" class="msg-form__send-button" disabled>Send</button>
        </div>
      </form>
    </div>`;

  it('finds the overlay Send button while disabled and reports it stayed disabled', { timeout: 20000 }, async () => {
    document.body.innerHTML = OVERLAY;
    const { getMessageComposer, sendComposedMessage } = loadOutreachHelpers();

    expect(getMessageComposer()?.sendButton).not.toBeNull();

    const result = await sendComposedMessage('Hello there, I applied for the role today.');
    expect(result.sent).toBe(false);
    expect(result.error).toContain('stayed disabled');
  });
});
