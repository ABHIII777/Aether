import type {
  AetherChild,
  AetherComponent,
  AetherElement,
  AetherFragment,
  AetherNode,
  AetherProps,
  AetherText,
  ComponentType,
} from "./types.js";

export function Fragment(_props: AetherProps): AetherNode {
  return { kind: "fragment", children: [] };
}

export function createElement(
  type: string | ComponentType<any>,
  props: AetherProps = {},
  ...children: AetherChild[]
): AetherNode {
  const normalizedChildren = children.flatMap(normalizeChild);
  const key = props.key;

  if (type === Fragment) {
    return {
      kind: "fragment",
      children: normalizedChildren,
    } satisfies AetherFragment;
  }

  if (typeof type === "function") {
    const componentProps: AetherProps = { ...props };

    if (key !== undefined) {
      componentProps.key = key;
    }

    return {
      kind: "component",
      type,
      props: componentProps,
      children: normalizedChildren,
    } satisfies AetherComponent;
  }

  return {
    kind: "element",
    type,
    props,
    children: normalizedChildren,
  } satisfies AetherElement;
}

export function normalizeChild(child: unknown): AetherNode[] {
  if (child === null || child === undefined || typeof child === "boolean") {
    return [];
  }

  if (typeof child === "string" || typeof child === "number") {
    return [
      {
        kind: "text",
        value: String(child),
      } satisfies AetherText,
    ];
  }

  if (Array.isArray(child)) {
    return child.flatMap(normalizeChild);
  }

  const node = child as AetherNode;

  if (node.kind === "fragment") {
    return node.children.flatMap(normalizeChild);
  }

  if (node.kind === "text" || node.kind === "element" || node.kind === "component") {
    return [node];
  }

  throw new Error("Invalid Aether child");
}
