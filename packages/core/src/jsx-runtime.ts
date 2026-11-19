import { createElement, Fragment } from "./create-element.js";
import type {
  AetherChild,
  AetherNode,
  AetherProps,
  ComponentType,
} from "./types.js";

export { Fragment };

export function jsx(
  type: string | ComponentType<any>,
  props: AetherProps | null,
  key?: string | number,
): AetherNode {
  const input = props ?? {};
  const { children, ...rest } = input;

  if (key !== undefined) {
    rest.key = key;
  }

  const childList =
    children === undefined
      ? []
      : Array.isArray(children)
        ? children
        : [children];

  return createElement(type, rest, ...(childList as AetherChild[]));
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export namespace JSX {
  export type Element = AetherNode;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicAttributes {
    key?: string | number;
  }

  export interface IntrinsicElements {
    [tagName: string]: AetherProps;
  }
}
