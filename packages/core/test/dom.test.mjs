import test from "node:test";
import assert from "node:assert/strict";

class FakeNode {
  parentNode = null;

  get nextSibling() {
    if (!this.parentNode) {
      return null;
    }

    const siblings = this.parentNode.childNodes;
    const index = siblings.indexOf(this);
    return siblings[index + 1] ?? null;
  }
}

class FakeText extends FakeNode {
  constructor(value) {
    super();
    this.nodeType = 3;
    this._value = String(value);
  }

  get nodeValue() {
    return this._value;
  }

  set nodeValue(value) {
    this._value = String(value);
  }

  get textContent() {
    return this._value;
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this._value = "";
    this._checked = false;
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = String(value);
  }

  get checked() {
    return this._checked;
  }

  set checked(value) {
    this._checked = Boolean(value);
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }

    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child, reference) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }

    if (reference === null || reference === undefined) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }

    const index = this.childNodes.indexOf(reference);

    if (index === -1) {
      throw new Error("insertBefore reference is not a child");
    }

    child.parentNode = this;
    this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);

    if (index === -1) {
      throw new Error("removeChild target is not a child");
    }

    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  replaceChild(newChild, oldChild) {
    const index = this.childNodes.indexOf(oldChild);

    if (index === -1) {
      throw new Error("replaceChild target is not a child");
    }

    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }

    oldChild.parentNode = null;
    newChild.parentNode = this;
    this.childNodes[index] = newChild;
    return oldChild;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(name, handler) {
    let handlers = this.listeners.get(name);

    if (!handlers) {
      handlers = new Set();
      this.listeners.set(name, handlers);
    }

    handlers.add(handler);
  }

  removeEventListener(name, handler) {
    const handlers = this.listeners.get(name);

    if (!handlers) {
      return;
    }

    handlers.delete(handler);

    if (handlers.size === 0) {
      this.listeners.delete(name);
    }
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type);

    if (!handlers) {
      return;
    }

    for (const handler of [...handlers]) {
      handler.call(this, { ...event, currentTarget: this, target: this });
    }
  }
}

class FakeDocument {
  createTextNode(value) {
    return new FakeText(value);
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

globalThis.document = new FakeDocument();

const { createElement: h } = await import("../dist/index.js");
const { render } = await import("../dist/dom.js");

function makeContainer() {
  return new FakeElement("div");
}

test("render creates the initial tree", () => {
  const container = makeContainer();

  render(h("section", { id: "root" }, h("h1", {}, "Hello")), container);

  assert.equal(container.childNodes.length, 1);

  const section = container.childNodes[0];

  assert.equal(section.tagName, "SECTION");
  assert.equal(section.getAttribute("id"), "root");
  assert.equal(section.childNodes[0].textContent, "Hello");
});

test("subsequent renders patch changed nodes in place", () => {
  const container = makeContainer();

  render(
    h("div", {}, h("p", { id: "a" }, "one"), h("p", { id: "b" }, "two")),
    container,
  );

  const root = container.childNodes[0];
  const first = root.childNodes[0];
  const second = root.childNodes[1];

  render(
    h("div", {}, h("p", { id: "a" }, "ONE"), h("p", { id: "b" }, "two")),
    container,
  );

  assert.equal(container.childNodes.length, 1);
  assert.equal(container.childNodes[0], root);
  assert.equal(root.childNodes[0], first);
  assert.equal(root.childNodes[1], second);
  assert.equal(first.textContent, "ONE");
  assert.equal(second.textContent, "two");
});

test("text node changes reuse the same text node", () => {
  const container = makeContainer();

  render(h("p", {}, "before"), container);

  const paragraph = container.firstChild;
  const text = paragraph.firstChild;

  render(h("p", {}, "after"), container);

  assert.equal(container.firstChild, paragraph);
  assert.equal(paragraph.firstChild, text);
  assert.equal(text.nodeValue, "after");
});

test("nested element type changes replace only that element", () => {
  const container = makeContainer();
  const tree = (tag) =>
    h(
      "div",
      {},
      h("header", {}, "header"),
      h(tag, { id: "target" }, "body"),
      h("footer", {}, "footer"),
    );

  render(tree("p"), container);

  const root = container.firstChild;
  const header = root.childNodes[0];
  const previousTarget = root.childNodes[1];
  const footer = root.childNodes[2];

  render(tree("section"), container);

  assert.equal(container.firstChild, root);
  assert.equal(root.childNodes[0], header);
  assert.equal(root.childNodes[2], footer);
  assert.equal(root.childNodes[1].tagName, "SECTION");
  assert.equal(root.childNodes[1].getAttribute("id"), "target");
  assert.notEqual(root.childNodes[1], previousTarget);
});

test("child nodes are added and removed", () => {
  const container = makeContainer();
  const list = (items) => h("ul", {}, ...items.map((text) => h("li", {}, text)));

  render(list(["A", "B"]), container);

  const listElement = container.firstChild;

  render(list(["A", "B", "C"]), container);

  assert.equal(listElement.childNodes.length, 3);
  assert.equal(listElement.childNodes[2].textContent, "C");

  render(list(["A"]), container);

  assert.equal(listElement.childNodes.length, 1);
  assert.equal(listElement.textContent, "A");
});

test("nested child updates preserve surrounding nodes", () => {
  const container = makeContainer();
  const tree = (text) =>
    h(
      "div",
      {},
      h("section", {}, h("p", { class: "a" }, text), h("span", {}, "static")),
      h("footer", {}, "footer"),
    );

  render(tree("first"), container);

  const root = container.firstChild;
  const section = root.childNodes[0];
  const paragraph = section.childNodes[0];
  const span = section.childNodes[1];
  const footer = root.childNodes[1];
  const text = paragraph.firstChild;

  render(tree("second"), container);

  assert.equal(container.firstChild, root);
  assert.equal(root.childNodes[0], section);
  assert.equal(root.childNodes[1], footer);
  assert.equal(section.childNodes[0], paragraph);
  assert.equal(section.childNodes[1], span);
  assert.equal(paragraph.firstChild, text);
  assert.equal(text.nodeValue, "second");
});

test("unchanged DOM nodes retain identity when only a sibling changes", () => {
  const container = makeContainer();

  render(
    h("div", {}, h("p", {}, "left"), h("p", {}, "right")),
    container,
  );

  const previousDOMNode = container.firstChild;
  const previousLeft = previousDOMNode.childNodes[0];

  render(
    h("div", {}, h("p", {}, "left"), h("p", {}, "RIGHT")),
    container,
  );

  assert.equal(previousDOMNode, container.firstChild);
  assert.equal(previousLeft, previousDOMNode.childNodes[0]);
  assert.equal(previousLeft.textContent, "left");
});

test("props are added, updated and removed", () => {
  const container = makeContainer();

  render(
    h("button", { disabled: true, title: null, "data-id": 1 }, "Go"),
    container,
  );

  const button = container.childNodes[0];

  assert.equal(button.getAttribute("disabled"), "");
  assert.equal(button.getAttribute("title"), null);
  assert.equal(button.getAttribute("data-id"), "1");

  render(h("button", { disabled: false, title: "ready" }, "Go"), container);

  assert.equal(container.childNodes[0], button);
  assert.equal(button.getAttribute("disabled"), null);
  assert.equal(button.getAttribute("title"), "ready");
  assert.equal(button.getAttribute("data-id"), null);
});

test("className is written as class", () => {
  const container = makeContainer();

  render(h("div", { className: "app" }, "Hello"), container);
  assert.equal(container.childNodes[0].getAttribute("class"), "app");

  render(h("div", { className: "app ready" }, "Hello"), container);
  assert.equal(container.childNodes[0].getAttribute("class"), "app ready");
});

test("htmlFor is written as for", () => {
  const container = makeContainer();

  render(h("label", { htmlFor: "email" }, "Email"), container);

  assert.equal(container.childNodes[0].getAttribute("for"), "email");
  assert.equal(container.childNodes[0].getAttribute("htmlFor"), null);
});

test("input value and checked props update the properties", () => {
  const container = makeContainer();

  render(h("input", { value: "first", checked: true }), container);

  const input = container.childNodes[0];

  assert.equal(input.value, "first");
  assert.equal(input.checked, true);

  render(h("input", { value: "second", checked: false }), container);

  assert.equal(container.childNodes[0], input);
  assert.equal(input.value, "second");
  assert.equal(input.checked, false);
});

test("controlled inputs are reset when the DOM diverges from props", () => {
  const container = makeContainer();
  const tree = (value) => h("input", { value });

  render(tree("fixed"), container);

  const input = container.childNodes[0];

  input.value = "typed by the user";
  render(tree("fixed"), container);

  assert.equal(container.childNodes[0], input);
  assert.equal(input.value, "fixed");
});

test("keyed children keep their DOM nodes when reordered", () => {
  const container = makeContainer();
  const list = (items) =>
    h(
      "ul",
      {},
      ...items.map(([key, text]) =>
        h("li", { key, "data-key": key }, text),
      ),
    );

  render(list([["a", "A"], ["b", "B"], ["c", "C"]]), container);

  const ul = container.childNodes[0];
  const [a, b, c] = ul.childNodes;

  render(list([["b", "B"], ["c", "C"], ["a", "A"]]), container);

  assert.equal(container.childNodes[0], ul);
  assert.deepEqual(
    ul.childNodes.map((node) => node.getAttribute("data-key")),
    ["b", "c", "a"],
  );
  assert.equal(ul.childNodes[0], b);
  assert.equal(ul.childNodes[1], c);
  assert.equal(ul.childNodes[2], a);

  render(list([["c", "C"]]), container);

  assert.equal(ul.childNodes.length, 1);
  assert.equal(ul.childNodes[0], c);
});

test("event handlers are replaced instead of accumulating", () => {
  const container = makeContainer();
  let firstCalls = 0;
  let secondCalls = 0;

  render(h("button", { onClick: () => firstCalls++ }, "Click"), container);

  const button = container.childNodes[0];
  button.dispatchEvent({ type: "click" });
  assert.equal(firstCalls, 1);

  render(h("button", { onClick: () => secondCalls++ }, "Click"), container);

  assert.equal(container.childNodes[0], button);
  assert.equal(button.listeners.get("click").size, 1);

  button.dispatchEvent({ type: "click" });
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);

  render(h("button", {}, "Click"), container);

  button.dispatchEvent({ type: "click" });
  assert.equal(secondCalls, 1);
  assert.equal(button.listeners.has("click"), false);
});

test("null, boolean and array children are handled", () => {
  const container = makeContainer();

  render(
    h(
      "div",
      {},
      true && h("span", {}, "yes"),
      false && h("span", {}, "no"),
      [h("b", {}, "1"), null, false, "tail"],
    ),
    container,
  );

  const div = container.childNodes[0];

  assert.equal(div.childNodes.length, 3);
  assert.equal(div.childNodes[0].tagName, "SPAN");
  assert.equal(div.childNodes[1].tagName, "B");
  assert.equal(div.childNodes[2].textContent, "tail");

  render(h("div", {}, false && h("span", {}, "no")), container);

  assert.equal(div.childNodes.length, 0);
});

test("changing the root element type replaces the root node", () => {
  const container = makeContainer();

  render(h("div", {}, "content"), container);

  const div = container.childNodes[0];

  render(h("section", {}, "content"), container);

  assert.equal(container.childNodes.length, 1);
  assert.equal(container.childNodes[0].tagName, "SECTION");
  assert.notEqual(container.childNodes[0], div);
});
