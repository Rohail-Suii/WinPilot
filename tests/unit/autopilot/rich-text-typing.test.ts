/**
 * Typing into LinkedIn's comment editor.
 *
 * The comment box is a TipTap/ProseMirror contenteditable div. It has no
 * `value`, and it does not respond to synthetic KeyboardEvents — the only
 * thing that puts text into it is a real editing command, which mutates the
 * DOM and fires the native beforeinput/input pair ProseMirror listens for.
 *
 * The plain-input path types by assigning `.value`. Against a contenteditable
 * that assignment does nothing at all, so the box stayed empty, its submit
 * button stayed disabled, and every comment was reported as "submit button not
 * found" — the agent liked posts and silently commented on none of them.
 *
 * The content script is one IIFE that MV3 loads directly, so there is nothing
 * to import; the test slices the behaviour block out of the source and
 * evaluates it. If the block's boundaries move, the slice fails loudly rather
 * than silently testing nothing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const SOURCE = readFileSync(
  path.resolve(__dirname, "../../../extension/content/content-script.js"),
  "utf8"
);

const START = "    function placeCaretAtEnd(element) {";
const END = "    // --- For short values (numbers, dropdown triggers), use fast input ---";

interface Typist {
  humanType: (el: Element, text: string) => Promise<void>;
  typeIntoRichEditor: (el: Element, text: string) => Promise<void>;
}

function loadTypist(): Typist {
  const start = SOURCE.indexOf(START);
  const end = SOURCE.indexOf(END);
  expect(start, "typing block start marker").toBeGreaterThan(-1);
  expect(end, "typing block end marker").toBeGreaterThan(start);

  const factory = new Function(
    "sleep",
    "clampedGaussian",
    `${SOURCE.slice(start, end)}
    return { humanType, typeIntoRichEditor };`
  );
  return factory(async () => {}, () => 0) as Typist;
}

/**
 * A stand-in for the browser's editing engine, which jsdom does not implement.
 * Inserts at the caret and fires the input event a real edit would.
 */
function installExecCommand(target: { calls: string[] }) {
  const activeEditor = () =>
    document.querySelector<HTMLElement>("[contenteditable='true']");

  document.execCommand = vi.fn((command: string, _ui?: boolean, value?: string) => {
    target.calls.push(command);
    const el = activeEditor();
    if (!el) return false;

    if (command === "insertText") {
      const selection = window.getSelection();
      if (selection?.rangeCount) {
        const range = selection.getRangeAt(0);
        const node = document.createTextNode(value ?? "");
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        el.append(value ?? "");
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    if (command === "selectAll") return true;

    if (command === "delete") {
      el.textContent = "";
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    return false;
  });
}

function editor(initial = "") {
  document.body.innerHTML = `
    <div contenteditable="true" role="textbox"
         aria-label="Text editor for creating comment" class="tiptap ProseMirror"
         id="editor">${initial}</div>`;
  return document.getElementById("editor")!;
}

describe("typing into the comment editor", () => {
  const exec = { calls: [] as string[] };

  beforeEach(() => {
    exec.calls = [];
    installExecCommand(exec);
  });

  it("actually puts the comment into a contenteditable editor", async () => {
    const t = loadTypist();
    const el = editor();

    await t.humanType(el, "the chunking is where the recall went");

    expect(el.textContent).toBe("the chunking is where the recall went");
  });

  it("edits through the browser rather than assigning a value", async () => {
    const t = loadTypist();
    const el = editor();

    await t.humanType(el, "abc");

    // Three characters, three real edits. Assigning `.value` here inserts
    // nothing, which is exactly the bug this guards.
    expect(exec.calls.filter((c) => c === "insertText")).toHaveLength(3);
  });

  it("fires input events so the editor's submit button wakes up", async () => {
    const t = loadTypist();
    const el = editor();
    const inputs = vi.fn();
    el.addEventListener("input", inputs);

    await t.humanType(el, "abc");

    expect(inputs).toHaveBeenCalled();
  });

  it("clears an existing draft instead of appending to it", async () => {
    const t = loadTypist();
    const el = editor("left over from a failed attempt");

    await t.humanType(el, "fresh");

    expect(exec.calls).toContain("delete");
    expect(el.textContent).toBe("fresh");
  });

  it("still types keystroke by keystroke, not in one paste", async () => {
    const t = loadTypist();
    const el = editor();
    const keydowns: string[] = [];
    el.addEventListener("keydown", (e) => keydowns.push((e as KeyboardEvent).key));

    await t.humanType(el, "hello");

    expect(keydowns).toEqual(["h", "e", "l", "l", "o"]);
  });

  it("writes the text itself when the browser refuses the edit", async () => {
    const t = loadTypist();
    const el = editor();
    document.execCommand = vi.fn(() => false);

    await t.humanType(el, "fallback");

    expect(el.textContent).toBe("fallback");
  });

  it("leaves plain inputs to the path built for them", async () => {
    const t = loadTypist();
    document.body.innerHTML = `<input id="plain" />`;
    const input = document.getElementById("plain") as HTMLInputElement;

    await t.humanType(input, "hi");

    expect(input.value).toBe("hi");
    // No rich-text editing was attempted against an <input>.
    expect(exec.calls).toHaveLength(0);
  });
});
