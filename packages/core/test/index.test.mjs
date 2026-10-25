import test from "node:test";
import assert from "node:assert/strict";

import { createElement } from "../dist/index.js";

test("createElement builds a nested element tree", () => {
  const tree = createElement(
    "div",
    { id: "root" },
    createElement("h1", {}, "Hello Aether"),
    createElement("h1", {}, "Learning Aether"),
  );

  assert.equal(tree.type, "div");
  assert.equal(tree.props.id, "root");
  assert.equal(tree.children.length, 2);

  const heading = tree.children[0];

  assert.equal(heading.kind, "element");

  if (heading.kind === "element") {
    assert.equal(heading.type, "h1");
    assert.equal(heading.children[0]?.kind, "text");

    const text = heading.children[0];
    if (text?.kind == "text") {
      assert.equal(text.value, "Hello Aether");
    }
  }
});
