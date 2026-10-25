import type { AetherNode, AetherElement } from "./index.js";

export function render(node: AetherNode, container: HTMLElement): void {
  const domNode = createDOMNode(node);
  container.appendChild(domNode);
}

function createDOMNode(node: AetherNode): Node {
  if (node.kind === "text") {
    return document.createTextNode(node.value);
  }

  const element = document.createElement(node.type);

  for (const [key, value] of Object.entries(node.props)) {
    if (value !== null && value !== undefined) {
      element.setAttribute(key, String(value));
    }
  }

  for (const child of node.children) {
    element.appendChild(createDOMNode(child));
  }

  return element;
}
