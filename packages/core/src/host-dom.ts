const eventListeners = new WeakMap<Element, Map<string, EventListener>>();

const eventNameAliases: Record<string, string> = {
  doubleclick: "dblclick",
};

export function createHostDOM(type: string): Element {
  return document.createElement(type);
}

export function updateProps(
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

    setProp(element, key, value, oldProps[key]);
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

  if (key === "value" && "value" in element) {
    return String((element as HTMLInputElement).value) === String(value);
  }

  if (key === "checked" && "checked" in element) {
    return Boolean((element as HTMLInputElement).checked) === Boolean(value);
  }

  return oldValue === value;
}

function setProp(
  element: Element,
  key: string,
  value: unknown,
  oldValue: unknown,
): void {
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

  if (key === "style" && isStyleObject(value)) {
    const style = (element as HTMLElement).style;

    element.removeAttribute("style");

    if (style) {
      for (const [property, propertyValue] of Object.entries(value)) {
        if (propertyValue === null || propertyValue === undefined) {
          continue;
        }

        if (property.startsWith("--")) {
          style.setProperty(property, String(propertyValue));
        } else {
          style.setProperty(toKebabCase(property), String(propertyValue));
        }
      }
    }

    return;
  }

  if (key === "style" && oldValue !== undefined && typeof oldValue === "object") {
    element.removeAttribute("style");
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

function isStyleObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof String)
  );
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
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
