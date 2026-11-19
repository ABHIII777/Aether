import { normalizeChild } from "./create-element.js";
import { createHostDOM, updateProps } from "./host-dom.js";
import type {
  AetherComponent,
  AetherElement,
  AetherNode,
  AetherText,
} from "./types.js";

type StateHook<T = unknown> = {
  kind: "state";
  value: T;
};

type EffectHook = {
  kind: "effect";
  deps: unknown[] | undefined;
  cleanup: (() => void) | undefined;
};

type Hook = StateHook | EffectHook;

type PendingEffect = {
  instance: ComponentInstance;
  hook: EffectHook;
  effect: () => void | (() => void);
};

export type Root = {
  kind: "root";
  container: HTMLElement;
  vnode: AetherNode | null;
  children: Instance[];
  effects: PendingEffect[];
  rendering: boolean;
};

export type ComponentInstance = {
  kind: "component";
  vnode: AetherComponent;
  parent: Parent;
  root: Root;
  children: Instance[];
  hooks: Hook[];
};

export type ElementInstance = {
  kind: "element";
  vnode: AetherElement;
  parent: Parent;
  root: Root;
  dom: Element;
  children: Instance[];
};

export type TextInstance = {
  kind: "text";
  vnode: AetherText;
  parent: Parent;
  root: Root;
  dom: Text;
};

export type Instance = ComponentInstance | ElementInstance | TextInstance;
export type Parent = Root | ElementInstance | ComponentInstance;

const roots = new WeakMap<HTMLElement, Root>();
const mounted = new WeakSet<Instance>();
const scheduledRoots = new Set<Root>();

let currentInstance: ComponentInstance | null = null;
let currentHook = 0;
let scheduled = false;

export function render(node: AetherNode, container: HTMLElement): void {
  let root = roots.get(container);

  if (!root) {
    root = {
      kind: "root",
      container,
      vnode: null,
      children: [],
      effects: [],
      rendering: false,
    };
    roots.set(container, root);
  } else {
    const first = root.children.length ? firstDOMNode(root.children[0]!) : null;

    if (first && first.parentNode !== container) {
      root.children = [];
    }
  }

  root.vnode = node;
  renderRoot(root);
}

export function unmount(container: HTMLElement): void {
  const root = roots.get(container);

  if (!root) {
    return;
  }

  for (const child of root.children) {
    removeInstance(child);
  }

  roots.delete(container);
  scheduledRoots.delete(root);
}

export function useState<T>(
  initial: T | (() => T),
): [T, (value: T | ((previous: T) => T)) => void] {
  const instance = currentInstance;

  if (!instance) {
    throw new Error("useState can only be called while rendering a component");
  }

  const index = currentHook++;
  let hook = instance.hooks[index];

  if (!hook) {
    const value = typeof initial === "function" ? (initial as () => T)() : initial;
    hook = { kind: "state", value } satisfies StateHook<T>;
    instance.hooks[index] = hook;
  } else if (hook.kind !== "state") {
    throw new Error("Hook order changed between renders");
  }

  const stateHook = hook as StateHook<T>;
  const setState = (value: T | ((previous: T) => T)) => {
    const next =
      typeof value === "function"
        ? (value as (previous: T) => T)(stateHook.value)
        : value;

    if (Object.is(next, stateHook.value)) {
      return;
    }

    stateHook.value = next;
    scheduleRoot(instance.root);
  };

  return [stateHook.value, setState];
}

export function useEffect(
  effect: () => void | (() => void),
  deps?: unknown[],
): void {
  const instance = currentInstance;

  if (!instance) {
    throw new Error("useEffect can only be called while rendering a component");
  }

  const index = currentHook++;
  let hook = instance.hooks[index];

  if (!hook) {
    hook = {
      kind: "effect",
      deps: undefined,
      cleanup: undefined,
    } satisfies EffectHook;
    instance.hooks[index] = hook;
  } else if (hook.kind !== "effect") {
    throw new Error("Hook order changed between renders");
  }

  const effectHook = hook as EffectHook;
  const changed =
    deps === undefined ||
    effectHook.deps === undefined ||
    !sameDeps(deps, effectHook.deps);

  if (!changed) {
    return;
  }

  effectHook.deps = deps ? [...deps] : undefined;
  instance.root.effects.push({
    instance,
    hook: effectHook,
    effect,
  });
}

function renderRoot(root: Root): void {
  if (root.rendering) {
    return;
  }

  root.rendering = true;
  root.effects = [];
  scheduledRoots.delete(root);

  try {
    const nodes = root.vnode ? normalizeChild(root.vnode) : [];
    root.children = reconcileChildren(root, root.children, nodes);
    placeChildren(root.container, root.children);
  } finally {
    root.rendering = false;
  }

  flushEffects(root);
}

function createInstance(vnode: AetherNode, parent: Parent): Instance {
  const root = rootOf(parent);

  if (vnode.kind === "text") {
    const instance: TextInstance = {
      kind: "text",
      vnode,
      parent,
      root,
      dom: document.createTextNode(vnode.value),
    };
    mounted.add(instance);
    return instance;
  }

  if (vnode.kind === "element") {
    const instance: ElementInstance = {
      kind: "element",
      vnode,
      parent,
      root,
      dom: createHostDOM(vnode.type),
      children: [],
    };
    mounted.add(instance);
    instance.children = reconcileChildren(instance, [], vnode.children);
    placeChildren(instance.dom, instance.children);
    updateProps(instance.dom, {}, vnode.props);
    return instance;
  }

  if (vnode.kind === "component") {
    const instance: ComponentInstance = {
      kind: "component",
      vnode,
      parent,
      root,
      children: [],
      hooks: [],
    };
    mounted.add(instance);
    renderComponent(instance);
    return instance;
  }

  throw new Error("Fragments must be normalized before mounting");
}

function patchInstance(
  instance: Instance,
  vnode: AetherNode,
  parent: Parent,
): Instance {
  if (instance.kind === "text") {
    if (vnode.kind !== "text") {
      return createInstance(vnode, parent);
    }

    instance.vnode = vnode;
    instance.parent = parent;

    if (instance.dom.nodeValue !== vnode.value) {
      instance.dom.nodeValue = vnode.value;
    }

    return instance;
  }

  if (instance.kind === "element") {
    if (vnode.kind !== "element" || instance.vnode.type !== vnode.type) {
      return createInstance(vnode, parent);
    }

    const previousProps = instance.vnode.props;
    instance.vnode = vnode;
    instance.parent = parent;
    updateProps(instance.dom, previousProps, vnode.props);
    instance.children = reconcileChildren(
      instance,
      instance.children,
      vnode.children,
    );
    placeChildren(instance.dom, instance.children);
    return instance;
  }

  if (vnode.kind !== "component" || instance.vnode.type !== vnode.type) {
    return createInstance(vnode, parent);
  }

  instance.vnode = vnode;
  instance.parent = parent;
  renderComponent(instance);
  return instance;
}

function renderComponent(instance: ComponentInstance): void {
  const previousInstance = currentInstance;
  const previousHook = currentHook;

  currentInstance = instance;
  currentHook = 0;

  try {
    const output = instance.vnode.type({
      ...instance.vnode.props,
      children: instance.vnode.children,
    });
    const nodes = normalizeChild(output);

    trimHooks(instance, currentHook);
    instance.children = reconcileChildren(instance, instance.children, nodes);
  } finally {
    currentInstance = previousInstance;
    currentHook = previousHook;
  }
}

function trimHooks(instance: ComponentInstance, count: number): void {
  if (instance.hooks.length <= count) {
    return;
  }

  for (let index = count; index < instance.hooks.length; index++) {
    const hook = instance.hooks[index]!;

    if (hook.kind === "effect" && hook.cleanup) {
      hook.cleanup();
    }
  }

  instance.hooks.length = count;
}

function reconcileChildren(
  parent: Parent,
  oldChildren: Instance[],
  newChildren: AetherNode[],
): Instance[] {
  const keyed = new Map<string, Instance>();
  const unkeyed: Instance[] = [];

  for (const child of oldChildren) {
    const key = getKey(child.vnode);

    if (key === null) {
      unkeyed.push(child);
    } else {
      keyed.set(key, child);
    }
  }

  const used = new Set<Instance>();
  const next: Instance[] = [];
  let cursor = 0;

  for (const vnode of newChildren) {
    const key = getKey(vnode);
    let previous: Instance | undefined;

    if (key !== null) {
      const candidate = keyed.get(key);

      if (candidate && !used.has(candidate)) {
        previous = candidate;
      }
    } else {
      while (cursor < unkeyed.length && used.has(unkeyed[cursor]!)) {
        cursor++;
      }

      previous = unkeyed[cursor];
    }

    let instance: Instance;

    if (previous) {
      used.add(previous);
      instance = patchInstance(previous, vnode, parent);

      if (instance !== previous) {
        removeInstance(previous);
      }
    } else {
      instance = createInstance(vnode, parent);
    }

    next.push(instance);
  }

  for (const child of oldChildren) {
    if (!used.has(child)) {
      removeInstance(child);
    }
  }

  return next;
}

function removeInstance(instance: Instance): void {
  mounted.delete(instance);

  if (instance.kind === "component") {
    for (const hook of instance.hooks) {
      if (hook.kind === "effect" && hook.cleanup) {
        hook.cleanup();
      }
    }

    instance.hooks.length = 0;

    for (const child of instance.children) {
      removeInstance(child);
    }

    instance.children = [];
    return;
  }

  if (instance.kind === "element") {
    for (const child of instance.children) {
      removeInstance(child);
    }

    instance.children = [];
  }

  if (instance.dom.parentNode) {
    instance.dom.parentNode.removeChild(instance.dom);
  }
}

function placeChildren(container: Node, instances: Instance[]): void {
  let reference: Node | null = null;

  for (let index = instances.length - 1; index >= 0; index--) {
    const nodes = getDOMNodes(instances[index]!);

    for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex--) {
      const node = nodes[nodeIndex]!;

      if (node.parentNode !== container || node.nextSibling !== reference) {
        container.insertBefore(node, reference);
      }

      reference = node;
    }
  }
}

function getDOMNodes(instance: Instance): Node[] {
  if (instance.kind === "text" || instance.kind === "element") {
    return [instance.dom];
  }

  return instance.children.flatMap(getDOMNodes);
}

function firstDOMNode(instance: Instance): Node | null {
  return getDOMNodes(instance)[0] ?? null;
}

function getKey(vnode: AetherNode): string | null {
  if (vnode.kind !== "element" && vnode.kind !== "component") {
    return null;
  }

  const key = vnode.props.key;

  if (typeof key === "string" || typeof key === "number") {
    return String(key);
  }

  return null;
}

function rootOf(parent: Parent): Root {
  return parent.kind === "root" ? parent : parent.root;
}

function sameDeps(left: unknown[], right: unknown[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => Object.is(value, right[index]));
}

function scheduleRoot(root: Root): void {
  if (root.rendering) {
    return;
  }

  scheduledRoots.add(root);

  if (scheduled) {
    return;
  }

  scheduled = true;
  queueMicrotask(flushQueue);
}

function flushQueue(): void {
  scheduled = false;
  const pending = [...scheduledRoots];
  scheduledRoots.clear();

  for (const root of pending) {
    try {
      renderRoot(root);
    } catch (error) {
      console.error(error);
    }
  }
}

function flushEffects(root: Root): void {
  const effects = root.effects;
  root.effects = [];

  for (const pending of effects) {
    if (!mounted.has(pending.instance)) {
      continue;
    }

    if (pending.hook.cleanup) {
      pending.hook.cleanup();
    }

    const cleanup = pending.effect();
    pending.hook.cleanup =
      typeof cleanup === "function" ? cleanup : undefined;
  }
}
