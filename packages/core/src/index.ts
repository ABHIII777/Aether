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
export type AetherChild = AetherNode | string | number;

export function createElement(
  type: string,
  props: Record<string, unknown> = {},
  ...children: AetherChild[]
): AetherElement {
  return {
    kind: "element",
    type,
    props,
    children: children.map((child): AetherNode => {
      if (typeof child === "string" || typeof child === "number") {
        return {
          kind: "text",
          value: String(child),
        };
      }

      return child;
    }),
  };
}
