export { render } from "./dom.js";

export type AetherText = {
  kind: "text";
  value: string;
};

export type AetherElement = {
  kind: "element";
  type: string;
  props: Record<string, unknown>;
  children: AetherNode[];
};

export type AetherNode = AetherElement | AetherText;
export type AetherChild =
  | AetherNode
  | string
  | number
  | boolean
  | null
  | undefined
  | AetherChild[];

export function createElement(
  type: string,
  props: Record<string, unknown> = {},
  ...children: AetherChild[]
): AetherElement {
  return {
    kind: "element",
    type,
    props,
    children: children.flatMap(normalizeChild),
  };
}

function normalizeChild(child: AetherChild): AetherNode[] {
  // Conditional expressions such as `condition && <p />` evaluate to `false`
  // and should not become children.
  if (child === null || child === undefined || typeof child === "boolean") {
    return [];
  }

  if (typeof child === "string" || typeof child === "number") {
    return [
      {
        kind: "text",
        value: String(child),
      },
    ];
  }

  if (Array.isArray(child)) {
    return child.flatMap((nested) => normalizeChild(nested));
  }

  return [child];
}
