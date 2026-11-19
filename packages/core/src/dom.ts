import type { AetherNode } from "./index.js";

type RenderState = {
  vnode: AetherNode;
  domNode: Node;
};

type ChildRecord = {
  vnode: AetherNode;
  domNode: Node | undefined;
  key: string | null;
  used: boolean;
};

// Keep the last rendered tree per container so the next render can diff instead
// of appending a second copy of the UI.
const renderStates = new WeakMap<HTMLElement, RenderState>();

// Event handlers have to be tracked so a changed handler replaces the previous
// one instead of being added alongside it.
const eventListeners = new WeakMap<Element, Map<string, EventListener>>();

const eventNameAliases: Record<string, string> = {
  doubleclick: "dblclick",
};

export function render(node: AetherNode, container: HTMLElement): void {
  const state = renderStates.get(container);

  if (!state || state.domNode.parentNode !== container) {
    const domNode = createDOMNode(node);
    container.appendChild(domNode);
    renderStates.set(container, { vnode: node, domNode });
    return;
  }

  const domNode = patchNode(state.domNode, state.vnode, node);

  if (domNode !== state.domNode) {
    container.replaceChild(domNode, state.domNode);
  }

  renderStates.set(container, { vnode: node, domNode });
}

function createDOMNode(node: AetherNode): Node {
  if (node.kind === "text") {
    return document.createTextNode(node.value);
  }

  const element = document.createElement(node.type);

  // Children are inserted before props are applied so properties that depend
  // on their children (for example <select value="...">) receive the correct
  // value.
  for (const child of node.children) {
    element.appendChild(createDOMNode(child));
  }

  patchProps(element, {}, node.props);
  return element;
}

/**
 * Patches an existing DOM node in place. Returns `domNode` when it can be
 * reused, or a freshly created node when the node type changed.
 */
function patchNode(
  domNode: Node,
  oldNode: AetherNode,
  newNode: AetherNode,
): Node {
  if (oldNode.kind === "text") {
    if (newNode.kind !== "text") {
      return createDOMNode(newNode);
    }

    if (domNode.nodeValue !== newNode.value) {
      domNode.nodeValue = newNode.value;
    }

    return domNode;
  }

  if (newNode.kind !== "element" || oldNode.type !== newNode.type) {
    return createDOMNode(newNode);
  }

  const element = domNode as Element;
  patchProps(element, oldNode.props, newNode.props);
  patchChildren(element, oldNode.children, newNode.children);
  return domNode;
}

function patchChildren(
  parent: Element,
  oldChildren: AetherNode[],
  newChildren: AetherNode[],
): void {
  const oldRecords: ChildRecord[] = oldChildren.map((vnode, index) => ({
    vnode,
    domNode: parent.childNodes[index],
    key: getKey(vnode),
    used: false,
  }));

  const keyed = new Map<string, ChildRecord>();
  const unkeyed: ChildRecord[] = [];

  for (const record of oldRecords) {
    if (record.key === null) {
      unkeyed.push(record);
    } else {
      keyed.set(record.key, record);
    }
  }

  let unkeyedCursor = 0;

  for (let index = 0; index < newChildren.length; index++) {
    const newChild = newChildren[index]!;
    const key = getKey(newChild);
    let match: ChildRecord | undefined;

    if (key !== null) {
      const candidate = keyed.get(key);
      if (candidate && !candidate.used) {
        match = candidate;
      }
    } else {
      // Unkeyed children are matched by position. Skip entries already claimed
      // by an earlier child so a keyed reorder cannot reuse one twice.
      while (unkeyedCursor < unkeyed.length && unkeyed[unkeyedCursor]!.used) {
        unkeyedCursor++;
      }
      match = unkeyed[unkeyedCursor];
    }

    let domNode: Node;

    if (match) {
      match.used = true;

      if (match.domNode) {
        const previousDOMNode = match.domNode;
        domNode = patchNode(previousDOMNode, match.vnode, newChild);

        if (domNode !== previousDOMNode && previousDOMNode.parentNode === parent) {
          parent.replaceChild(domNode, previousDOMNode);
        }
      } else {
        domNode = createDOMNode(newChild);
      }
    } else {
      domNode = createDOMNode(newChild);
    }

    const currentAtIndex = parent.childNodes[index];

    if (currentAtIndex !== domNode) {
      parent.insertBefore(domNode, currentAtIndex ?? null);
    }
  }

  for (const record of oldRecords) {
    if (
      !record.used &&
      record.domNode &&
      record.domNode.parentNode === parent
    ) {
      parent.removeChild(record.domNode);
    }
  }
}

function getKey(node: AetherNode): string | null {
  if (node.kind !== "element") {
    return null;
  }

  const key = node.props.key;

  if (typeof key === "string" || typeof key === "number") {
    return String(key);
  }

  return null;
}

function patchProps(
  element: Element,
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
): void {
  for (const key of Object.keys(oldProps)) {
    if (key === "key") {
      continue;
    }

    if (!(key in newProps)) {
      removeProp(element, key);
    }
  }

  for (const [key, value] of Object.entries(newProps)) {
    if (key === "key") {
      continue;
    }

    if (isUnchanged(element, key, value, oldProps[key])) {
      continue;
    }

    setProp(element, key, value);
  }
}

function isUnchanged(
  element: Element,
  key: string,
  value: unknown,
  oldValue: unknown,
): boolean {
  if (value === null || value === undefined) {
    return oldValue === value;
  }

  // Controlled inputs are compared against the DOM property, not just the
  // previous virtual value. The user may have typed into the field since the
  // last render even when the incoming prop did not change.
  if (key === "value" && "value" in element) {
    return (element as HTMLInputElement).value === String(value);
  }

  if (key === "checked" && "checked" in element) {
    return (element as HTMLInputElement).checked === Boolean(value);
  }

  return oldValue === value;
}

function setProp(element: Element, key: string, value: unknown): void {
  if (value === null || value === undefined) {
    removeProp(element, key);
    return;
  }

  if (isEventProp(key)) {
    if (typeof value === "function") {
      updateListener(element, key, value as EventListener);
    } else {
      removeProp(element, key);
    }
    return;
  }

  if (typeof value === "function") {
    return;
  }

  if (key === "value") {
    if ("value" in element) {
      (element as HTMLInputElement).value = String(value);
    } else {
      element.setAttribute("value", String(value));
    }
    return;
  }

  if (key === "checked") {
    if ("checked" in element) {
      (element as HTMLInputElement).checked = Boolean(value);
    } else if (value) {
      element.setAttribute("checked", "");
    } else {
      element.removeAttribute("checked");
    }
    return;
  }

  if (value === false) {
    element.removeAttribute(attributeName(key));
    return;
  }

  if (value === true) {
    element.setAttribute(attributeName(key), "");
    return;
  }

  element.setAttribute(attributeName(key), String(value));
}

function removeProp(element: Element, key: string): void {
  if (isEventProp(key)) {
    updateListener(element, key, null);
    return;
  }

  if (key === "value") {
    if ("value" in element) {
      (element as HTMLInputElement).value = "";
    }
    element.removeAttribute("value");
    return;
  }

  if (key === "checked") {
    if ("checked" in element) {
      (element as HTMLInputElement).checked = false;
    }
    element.removeAttribute("checked");
    return;
  }

  element.removeAttribute(attributeName(key));
}

function isEventProp(key: string): boolean {
  return /^on[A-Z]/.test(key);
}

function updateListener(
  element: Element,
  key: string,
  handler: EventListener | null,
): void {
  const eventName = normalizeEventName(key);
  let listeners = eventListeners.get(element);

  if (!listeners) {
    if (!handler) {
      return;
    }

    listeners = new Map();
    eventListeners.set(element, listeners);
  }

  const previous = listeners.get(eventName);

  if (previous) {
    element.removeEventListener(eventName, previous);
  }

  if (handler) {
    element.addEventListener(eventName, handler);
    listeners.set(eventName, handler);
  } else {
    listeners.delete(eventName);

    if (listeners.size === 0) {
      eventListeners.delete(element);
    }
  }
}

function normalizeEventName(key: string): string {
  const name = key.slice(2).toLowerCase();
  return eventNameAliases[name] ?? name;
}

function attributeName(key: string): string {
  if (key === "className") {
    return "class";
  }

  if (key === "htmlFor") {
    return "for";
  }

  return key;
}
