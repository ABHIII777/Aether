import { createElement } from "../dist/index.js";
import { render } from "../dist/dom.js";

const app = createElement(
  "main",
  { class: "app" },
  createElement("h1", {}, "Hello Aether"),
  createElement("p", {}, "This UI was created by the Aether Elements"),
  createElement("p", {}, "Typescript builds the tree. Aether renders it into the browser DOM."),
  createElement(
    "button",
    {
      id: "hello-button",
      onClick: () => {
        alert("Hello from Aether");
        console.log("Button Clicked !!");
      },
    },
    "Click ME !",
  ),
);

const root = document.getElementById("root");

if (!root) {
  throw new Error("Aether could not find the root element");
}

render(app, root);
