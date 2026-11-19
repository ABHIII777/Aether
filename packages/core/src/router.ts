import { createElement } from "./create-element.js";
import { useEffect, useState } from "./runtime.js";
import type {
  AetherChild,
  AetherNode,
  AetherProps,
  ComponentType,
} from "./types.js";

export type RouteDefinition = {
  path: string;
  component: ComponentType<any>;
};

export type NavigateOptions = {
  replace?: boolean;
};

type Listener = () => void;

const listeners = new Set<Listener>();

let currentPath = typeof window === "undefined" ? "/" : readPath();

if (typeof window !== "undefined") {
  window.addEventListener("popstate", syncPath);
}

export function navigate(to: string, options: NavigateOptions = {}): void {
  if (typeof window === "undefined") {
    currentPath = to;
    notify();
    return;
  }

  const url = new URL(to, window.location.href);
  const next = `${url.pathname}${url.search}${url.hash}`;

  if (options.replace) {
    window.history.replaceState(null, "", next);
  } else {
    window.history.pushState(null, "", next);
  }

  currentPath = next;
  notify();
}

export function useLocation(): string {
  const [path, setPath] = useState(currentPath);

  useEffect(() => subscribe(() => setPath(currentPath)), []);

  return path;
}

export function useNavigate(): (
  to: string,
  options?: NavigateOptions,
) => void {
  return navigate;
}

export function Router(props: AetherProps): AetherNode {
  const routes = (props.routes as RouteDefinition[] | undefined) ?? [];
  const path = useLocation();
  const match = matchRoutes(routes, path);

  if (!match) {
    const fallback = props.fallback;

    if (typeof fallback === "function") {
      return (fallback as () => AetherNode)();
    }

    return (fallback as AetherNode | undefined) ?? createElement("div", {}, "Not found");
  }

  return createElement(match.route.component, {
    ...match.params,
    path,
  });
}

export function Link(props: AetherProps): AetherNode {
  const {
    to,
    onClick,
    children,
    ...rest
  } = props;
  const destination = String(to ?? "/");

  const handleClick = (event: Event) => {
    if (typeof onClick === "function") {
      onClick(event);
    }

    const mouseEvent = event as MouseEvent;

    if (
      mouseEvent.defaultPrevented ||
      mouseEvent.button !== 0 ||
      mouseEvent.metaKey ||
      mouseEvent.ctrlKey ||
      mouseEvent.shiftKey ||
      mouseEvent.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigate(destination);
  };

  return createElement(
    "a",
    {
      ...rest,
      href: destination,
      onClick: handleClick,
    },
    children as AetherChild,
  );
}

export function matchRoute(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const pathname = stripPath(path);
  const patternSegments = splitPath(pattern);
  const pathSegments = splitPath(pathname);
  const params: Record<string, string> = {};

  for (let index = 0; index < patternSegments.length; index++) {
    const patternSegment = patternSegments[index]!;
    const pathSegment = pathSegments[index];

    if (patternSegment === "*") {
      params["*"] = pathSegments.slice(index).join("/");
      return params;
    }

    if (pathSegment === undefined) {
      return null;
    }

    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = decodeURIComponent(pathSegment);
      continue;
    }

    if (patternSegment !== pathSegment) {
      return null;
    }
  }

  if (pathSegments.length !== patternSegments.length) {
    return null;
  }

  return params;
}

function matchRoutes(
  routes: RouteDefinition[],
  path: string,
): { route: RouteDefinition; params: Record<string, string> } | null {
  for (const route of routes) {
    const params = matchRoute(route.path, path);

    if (params) {
      return { route, params };
    }
  }

  return null;
}

function readPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function syncPath(): void {
  currentPath = readPath();
  notify();
}

function notify(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function stripPath(path: string): string {
  const query = path.indexOf("?");
  const hash = path.indexOf("#");
  let end = path.length;

  if (query !== -1) {
    end = Math.min(end, query);
  }

  if (hash !== -1) {
    end = Math.min(end, hash);
  }

  const pathname = path.slice(0, end);
  return pathname === "" ? "/" : pathname;
}

function splitPath(path: string): string[] {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean === "" ? [] : clean.split("/");
}
