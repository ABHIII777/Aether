import test from "node:test";
import assert from "node:assert/strict";

import { FakeElement, installFakeDOM } from "./fake-dom.mjs";

installFakeDOM();

const {
  createElement: h,
  Fragment,
  Link,
  Router,
  matchRoute,
  navigate,
  render,
  unmount,
  useEffect,
  useState,
} = await import("../dist/index.js");
const { jsx, jsxs } = await import("../dist/jsx-runtime.js");

function makeContainer() {
  return new FakeElement("div");
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("function components render props and children", () => {
  const container = makeContainer();
  const Panel = (props) =>
    h("section", { title: String(props.title) }, props.children);
  const App = () =>
    h(
      Panel,
      { title: "demo" },
      h("h1", {}, "Hello"),
      h("p", {}, "World"),
    );

  render(h(App), container);

  const section = container.firstChild;

  assert.equal(section.tagName, "SECTION");
  assert.equal(section.getAttribute("title"), "demo");
  assert.equal(section.childNodes[0].textContent, "Hello");
  assert.equal(section.childNodes[1].textContent, "World");
});

test("useState updates a component without replacing its DOM", async () => {
  const container = makeContainer();
  const Counter = () => {
    const [count, setCount] = useState(0);

    return h(
      "button",
      { onClick: () => setCount((value) => value + 1) },
      `Count: ${count}`,
    );
  };

  render(h(Counter), container);

  const button = container.firstChild;

  assert.equal(button.textContent, "Count: 0");

  button.dispatchEvent({ type: "click" });
  await tick();

  assert.equal(container.firstChild, button);
  assert.equal(button.textContent, "Count: 1");

  button.dispatchEvent({ type: "click" });
  await tick();

  assert.equal(container.firstChild, button);
  assert.equal(button.textContent, "Count: 2");
});

test("keyed component state follows the key when reordered", async () => {
  const container = makeContainer();
  const Item = (props) => {
    const [count, setCount] = useState(0);

    return h(
      "li",
      { onClick: () => setCount((value) => value + 1) },
      `${props.label}:${count}`,
    );
  };
  const list = (labels) =>
    h(
      "ul",
      {},
      ...labels.map((label) => h(Item, { key: label, label })),
    );

  render(list(["a", "b", "c"]), container);

  const listElement = container.firstChild;
  const second = listElement.childNodes[1];

  second.dispatchEvent({ type: "click" });
  await tick();

  assert.equal(second.textContent, "b:1");

  render(list(["c", "a", "b"]), container);

  assert.equal(listElement.childNodes[2], second);
  assert.equal(second.textContent, "b:1");
});

test("useEffect runs after mount and cleans up on unmount", async () => {
  const container = makeContainer();
  let runs = 0;
  let cleanups = 0;
  const Child = () => {
    useEffect(() => {
      runs++;
      return () => {
        cleanups++;
      };
    }, []);

    return h("span", {}, "child");
  };
  let toggle;
  const App = () => {
    const [show, setShow] = useState(true);
    toggle = setShow;
    return show ? h(Child) : h("p", {}, "hidden");
  };

  render(h(App), container);

  assert.equal(runs, 1);
  assert.equal(container.firstChild.tagName, "SPAN");

  toggle(false);
  await tick();

  assert.equal(cleanups, 1);
  assert.equal(container.firstChild.tagName, "P");
});

test("unmount removes the tree and runs effect cleanup", () => {
  const container = makeContainer();
  let cleanups = 0;
  const App = () => {
    useEffect(() => () => {
      cleanups++;
    }, []);

    return h("div", {}, "app");
  };

  render(h(App), container);
  assert.equal(container.childNodes.length, 1);

  unmount(container);

  assert.equal(cleanups, 1);
  assert.equal(container.childNodes.length, 0);
});

test("fragments and component arrays render multiple nodes", () => {
  const container = makeContainer();
  const Rows = () => [h("span", {}, "one"), h("span", {}, "two")];

  render(
    h(
      Fragment,
      {},
      h("p", {}, "top"),
      h(Rows),
      h("p", {}, "bottom"),
    ),
    container,
  );

  assert.equal(container.childNodes.length, 4);
  assert.equal(container.childNodes[0].textContent, "top");
  assert.equal(container.childNodes[1].textContent, "one");
  assert.equal(container.childNodes[2].textContent, "two");
  assert.equal(container.childNodes[3].textContent, "bottom");
});

test("jsx runtime creates elements, components and fragments", () => {
  const Badge = (props) => jsx("strong", { children: props.children });

  const element = jsx("div", { id: "root", children: "Hello" });
  const component = jsxs(Badge, { children: ["one", "two"] });
  const fragment = jsxs(Fragment, {
    children: [jsx("i", { children: "a" }), jsx("i", { children: "b" })],
  });

  assert.equal(element.kind, "element");
  assert.equal(element.type, "div");
  assert.equal(element.props.id, "root");
  assert.equal(element.children[0].value, "Hello");
  assert.equal(component.kind, "component");
  assert.equal(component.children.length, 2);
  assert.equal(fragment.kind, "fragment");
  assert.equal(fragment.children.length, 2);
});

test("router matches static, parameterized and wildcard paths", () => {
  assert.deepEqual(matchRoute("/", "/"), {});
  assert.deepEqual(matchRoute("/users/:id", "/users/42"), { id: "42" });
  assert.deepEqual(matchRoute("/files/*", "/files/a/b.txt"), {
    "*": "a/b.txt",
  });
  assert.equal(matchRoute("/users/:id", "/posts/42"), null);
});

test("router and navigate switch the rendered component", async () => {
  const container = makeContainer();
  const Home = () => h("h1", { id: "home" }, "Home");
  const User = (props) => h("h1", { id: "user" }, `User ${props.id}`);
  const routes = [
    { path: "/", component: Home },
    { path: "/users/:id", component: User },
  ];

  navigate("/", { replace: true });
  render(h(Router, { routes }), container);

  assert.equal(container.firstChild.getAttribute("id"), "home");

  navigate("/users/7");
  await tick();

  assert.equal(container.firstChild.tagName, "H1");
  assert.equal(container.firstChild.getAttribute("id"), "user");
  assert.equal(container.firstChild.textContent, "User 7");
});

test("link intercepts clicks and navigates", async () => {
  const container = makeContainer();
  const Home = () => h("p", {}, "home");
  const User = (props) => h("p", {}, `user ${props.id}`);
  const routes = [
    { path: "/", component: Home },
    { path: "/users/:id", component: User },
  ];

  navigate("/", { replace: true });
  render(
    h(Router, { routes, fallback: h("p", {}, "missing") }),
    container,
  );

  const link = h(Link, { to: "/users/9" }, "Open");
  render(link, makeContainer());

  const linkContainer = makeContainer();
  render(link, linkContainer);
  const anchor = linkContainer.firstChild;

  const event = anchor.dispatchEvent({ type: "click" });

  assert.equal(event.defaultPrevented, true);

  await tick();

  assert.equal(container.firstChild.textContent, "user 9");
});
