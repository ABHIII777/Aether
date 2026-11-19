export class FakeNode {
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

export class FakeText extends FakeNode {
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

export class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this._value = "";
    this._checked = false;
    this.style = {
      values: new Map(),
      setProperty: (name, value) => {
        this.style.values.set(name, String(value));
      },
      removeProperty: (name) => {
        this.style.values.delete(name);
      },
      getPropertyValue: (name) => this.style.values.get(name) ?? "",
    };
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

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
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
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);

    if (name === "style") {
      this.style.values.clear();
    }
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
      return event;
    }

    const dispatchEvent = {
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      preventDefault() {
        dispatchEvent.defaultPrevented = true;
      },
      ...event,
      currentTarget: this,
      target: this,
    };

    for (const handler of [...handlers]) {
      handler.call(this, dispatchEvent);
    }

    return dispatchEvent;
  }
}

export class FakeDocument {
  createTextNode(value) {
    return new FakeText(value);
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

export function installFakeDOM() {
  globalThis.document = new FakeDocument();
}
